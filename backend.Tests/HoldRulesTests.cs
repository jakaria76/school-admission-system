using System.Net;
using System.Text.Json;

namespace backend.Tests;

public class HoldRulesTests
{
    private static readonly string Alice = Api.Student(1);
    private static readonly string Bob = Api.Student(2);

    [Fact]
    public async Task Responses_follow_the_api_contract()
    {
        await using var app = await TestApp.StartAsync();
        var client = app.Client;

        var created = await client.PostAsync("/classes", Json("""{ "name": "Class 6 - Morning Shift", "totalSeats": 120 }"""));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var createdJson = await created.JsonAsync();
        var classId = createdJson.GetProperty("id").GetString()!;
        Assert.Equal("Class 6 - Morning Shift", createdJson.GetProperty("name").GetString());
        Assert.Equal(120, createdJson.GetProperty("totalSeats").GetInt32());

        var before = DateTimeOffset.UtcNow;
        var applied = await client.ApplyAsync(classId, Alice);
        Assert.Equal(HttpStatusCode.Created, applied.StatusCode);
        var hold = await applied.JsonAsync();
        var holdId = hold.GetProperty("holdId").GetString()!;
        Assert.Equal(classId, hold.GetProperty("classId").GetString());
        Assert.Equal(Alice, hold.GetProperty("studentId").GetString());
        Assert.Equal("HELD", hold.GetProperty("status").GetString());
        var expiresAt = hold.GetProperty("expiresAt").GetString()!;
        Assert.EndsWith("Z", expiresAt);
        Assert.InRange(DateTimeOffset.Parse(expiresAt), before.AddSeconds(595), DateTimeOffset.UtcNow.AddSeconds(605));

        var list = await client.GetJsonAsync("/classes");
        var item = Assert.Single(list.EnumerateArray());
        AssertClass(item, classId, total: 120, held: 1, confirmed: 0, available: 119);
        AssertClass(await client.GetJsonAsync($"/classes/{classId}"), classId, total: 120, held: 1, confirmed: 0, available: 119);

        var fetched = await client.GetJsonAsync($"/holds/{holdId}");
        Assert.Equal(holdId, fetched.GetProperty("holdId").GetString());
        Assert.Equal(classId, fetched.GetProperty("classId").GetString());
        Assert.Equal("HELD", fetched.GetProperty("status").GetString());
        Assert.Equal(expiresAt, fetched.GetProperty("expiresAt").GetString());

        var mine = Assert.Single((await client.GetJsonAsync("/me/holds", Alice)).EnumerateArray());
        Assert.Equal(holdId, mine.GetProperty("holdId").GetString());
        Assert.Equal(classId, mine.GetProperty("classId").GetString());
        Assert.Equal("Class 6 - Morning Shift", mine.GetProperty("className").GetString());
        Assert.Equal("HELD", mine.GetProperty("status").GetString());
        Assert.Equal(expiresAt, mine.GetProperty("expiresAt").GetString());
        Assert.Empty((await client.GetJsonAsync("/me/holds", Bob)).EnumerateArray());

        var confirmed = await client.ConfirmAsync(holdId, Alice);
        Assert.Equal(HttpStatusCode.OK, confirmed.StatusCode);
        var confirmedJson = await confirmed.JsonAsync();
        Assert.Equal(holdId, confirmedJson.GetProperty("holdId").GetString());
        Assert.Equal("CONFIRMED", confirmedJson.GetProperty("status").GetString());
        AssertClass(await client.GetJsonAsync($"/classes/{classId}"), classId, total: 120, held: 0, confirmed: 1, available: 119);
    }

    [Fact]
    public async Task Full_class_rejects_further_applications_with_409()
    {
        await using var app = await TestApp.StartAsync();
        var classId = await app.Client.CreateClassAsync(1);
        await app.Client.ApplyOkAsync(classId, Alice);

        var response = await app.Client.ApplyAsync(classId, Bob);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("CLASS_FULL", (await response.JsonAsync()).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Student_cannot_hold_two_seats_in_one_class_but_can_apply_to_another_class()
    {
        await using var app = await TestApp.StartAsync();
        var morning = await app.Client.CreateClassAsync(10, "Class 6 - Morning Shift");
        var day = await app.Client.CreateClassAsync(10, "Class 6 - Day Shift");
        var holdId = await app.Client.ApplyOkAsync(morning, Alice);

        Assert.Equal(HttpStatusCode.Conflict, (await app.Client.ApplyAsync(morning, Alice)).StatusCode);
        await app.Client.ApplyOkAsync(day, Alice);

        // Still blocked after the admission is confirmed.
        await app.Client.ConfirmAsync(holdId, Alice);
        var again = await app.Client.ApplyAsync(morning, Alice);
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        Assert.Equal("ALREADY_APPLIED", (await again.JsonAsync()).GetProperty("code").GetString());
        Assert.Equal((10, 0, 1, 9), await app.Client.SeatsAsync(morning));
    }

    [Fact]
    public async Task Expired_hold_releases_its_seat_without_any_api_call_and_cannot_be_confirmed()
    {
        await using var app = await TestApp.StartAsync(holdDurationSeconds: 1);
        var classId = await app.Client.CreateClassAsync(1);
        var holdId = await app.Client.ApplyOkAsync(classId, Alice);
        Assert.Equal((1, 1, 0, 0), await app.Client.SeatsAsync(classId));

        await Task.Delay(TimeSpan.FromSeconds(1.5));

        // The very first read after the deadline already shows the seat as free.
        Assert.Equal((1, 0, 0, 1), await app.Client.SeatsAsync(classId));
        Assert.Equal("EXPIRED", (await app.Client.GetJsonAsync($"/holds/{holdId}")).GetProperty("status").GetString());

        var confirm = await app.Client.ConfirmAsync(holdId, Alice);
        Assert.Equal(HttpStatusCode.Conflict, confirm.StatusCode);
        Assert.Equal("HOLD_EXPIRED", (await confirm.JsonAsync()).GetProperty("code").GetString());
        Assert.Equal(HttpStatusCode.Conflict, (await app.Client.CancelAsync(holdId, Alice)).StatusCode);
        Assert.Equal((1, 0, 0, 1), await app.Client.SeatsAsync(classId));

        // Somebody else can take the seat, and the history keeps the expired application.
        await app.Client.ApplyOkAsync(classId, Bob);
        var mine = Assert.Single((await app.Client.GetJsonAsync("/me/holds", Alice)).EnumerateArray());
        Assert.Equal("EXPIRED", mine.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Student_can_apply_again_after_their_hold_expired()
    {
        await using var app = await TestApp.StartAsync(holdDurationSeconds: 1);
        var classId = await app.Client.CreateClassAsync(1);
        var first = await app.Client.ApplyOkAsync(classId, Alice);

        await Task.Delay(TimeSpan.FromSeconds(1.5));
        var second = await app.Client.ApplyOkAsync(classId, Alice);

        Assert.NotEqual(first, second);
        var statuses = (await app.Client.GetJsonAsync("/me/holds", Alice)).EnumerateArray()
            .Select(h => h.GetProperty("status").GetString()!).Order().ToArray();
        Assert.Equal(["EXPIRED", "HELD"], statuses);
    }

    [Fact]
    public async Task Only_the_owner_can_confirm_or_cancel()
    {
        await using var app = await TestApp.StartAsync();
        var classId = await app.Client.CreateClassAsync(5);
        var holdId = await app.Client.ApplyOkAsync(classId, Alice);

        Assert.Equal(HttpStatusCode.Forbidden, (await app.Client.ConfirmAsync(holdId, Bob)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await app.Client.CancelAsync(holdId, Bob)).StatusCode);
        Assert.Equal((5, 1, 0, 4), await app.Client.SeatsAsync(classId));
    }

    [Fact]
    public async Task Confirm_is_idempotent()
    {
        await using var app = await TestApp.StartAsync();
        var classId = await app.Client.CreateClassAsync(5);
        var holdId = await app.Client.ApplyOkAsync(classId, Alice);

        for (var i = 0; i < 3; i++)
        {
            var response = await app.Client.ConfirmAsync(holdId, Alice);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Equal("CONFIRMED", (await response.JsonAsync()).GetProperty("status").GetString());
        }

        Assert.Equal((5, 0, 1, 4), await app.Client.SeatsAsync(classId));
    }

    [Fact]
    public async Task Cancel_frees_the_seat_and_a_cancelled_hold_cannot_be_confirmed()
    {
        await using var app = await TestApp.StartAsync();
        var classId = await app.Client.CreateClassAsync(1);
        var holdId = await app.Client.ApplyOkAsync(classId, Alice);

        Assert.Equal(HttpStatusCode.NoContent, (await app.Client.CancelAsync(holdId, Alice)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await app.Client.CancelAsync(holdId, Alice)).StatusCode);

        Assert.Equal("CANCELLED", (await app.Client.GetJsonAsync($"/holds/{holdId}")).GetProperty("status").GetString());
        Assert.Equal((1, 0, 0, 1), await app.Client.SeatsAsync(classId));
        Assert.Equal(HttpStatusCode.Conflict, (await app.Client.ConfirmAsync(holdId, Alice)).StatusCode);

        // The student may apply again after cancelling.
        await app.Client.ApplyOkAsync(classId, Alice);
    }

    [Fact]
    public async Task Confirmed_admission_cannot_be_cancelled()
    {
        await using var app = await TestApp.StartAsync();
        var classId = await app.Client.CreateClassAsync(1);
        var holdId = await app.Client.ApplyOkAsync(classId, Alice);
        await app.Client.ConfirmAsync(holdId, Alice);

        Assert.Equal(HttpStatusCode.Conflict, (await app.Client.CancelAsync(holdId, Alice)).StatusCode);
        Assert.Equal((1, 0, 1, 0), await app.Client.SeatsAsync(classId));
    }

    [Fact]
    public async Task Data_survives_a_backend_restart()
    {
        await using var app = await TestApp.StartAsync();
        var classId = await app.Client.CreateClassAsync(3);
        var held = await app.Client.ApplyOkAsync(classId, Alice);
        var confirmed = await app.Client.ApplyOkAsync(classId, Bob);
        await app.Client.ConfirmAsync(confirmed, Bob);

        await app.StopAllInstancesAsync();
        var restarted = app.StartInstance();

        Assert.Equal((3, 1, 1, 1), await restarted.SeatsAsync(classId));
        Assert.Equal("HELD", (await restarted.GetJsonAsync($"/holds/{held}")).GetProperty("status").GetString());
        Assert.Equal("CONFIRMED", (await restarted.GetJsonAsync($"/holds/{confirmed}")).GetProperty("status").GetString());
    }

    private static void AssertClass(JsonElement json, string id, int total, int held, int confirmed, int available)
    {
        Assert.Equal(id, json.GetProperty("id").GetString());
        Assert.Equal(total, json.GetProperty("totalSeats").GetInt32());
        Assert.Equal(held, json.GetProperty("heldSeats").GetInt32());
        Assert.Equal(confirmed, json.GetProperty("confirmedSeats").GetInt32());
        Assert.Equal(available, json.GetProperty("availableSeats").GetInt32());
    }

    private static StringContent Json(string body) => new(body, System.Text.Encoding.UTF8, "application/json");
}
