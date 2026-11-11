using System.Net;
using System.Text;
using Backend;

namespace backend.Tests;

/// <summary>Rule 7: bad input is always a 4xx, never a 500.</summary>
public class ValidationTests : IAsyncLifetime
{
    private TestApp _app = null!;
    private string _classId = "";
    private string _holdId = "";

    public async Task InitializeAsync()
    {
        _app = await TestApp.StartAsync();
        _classId = await _app.Client.CreateClassAsync(5);
        _holdId = await _app.Client.ApplyOkAsync(_classId, Api.Student(1));
    }

    public async Task DisposeAsync() => await _app.DisposeAsync();

    [Theory]
    [InlineData("")]
    [InlineData("not json")]
    [InlineData("null")]
    [InlineData("[]")]
    [InlineData("\"text\"")]
    [InlineData("{}")]
    [InlineData("""{ "name": "A" }""")]
    [InlineData("""{ "totalSeats": 10 }""")]
    [InlineData("""{ "name": "", "totalSeats": 10 }""")]
    [InlineData("""{ "name": "   ", "totalSeats": 10 }""")]
    [InlineData("""{ "name": 42, "totalSeats": 10 }""")]
    [InlineData("""{ "name": null, "totalSeats": 10 }""")]
    [InlineData("""{ "name": "A\u0000B", "totalSeats": 10 }""")]
    [InlineData("""{ "name": "A", "totalSeats": 0 }""")]
    [InlineData("""{ "name": "A", "totalSeats": -5 }""")]
    [InlineData("""{ "name": "A", "totalSeats": 1.5 }""")]
    [InlineData("""{ "name": "A", "totalSeats": "10" }""")]
    [InlineData("""{ "name": "A", "totalSeats": null }""")]
    [InlineData("""{ "name": "A", "totalSeats": 99999999999999999999 }""")]
    [InlineData("""{ "name": "A", "totalSeats": 10 """)]
    public async Task Create_class_rejects_bad_bodies_with_400(string body)
    {
        var response = await _app.Client.PostAsync("/classes", new StringContent(body, Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.False(string.IsNullOrEmpty((await response.JsonAsync()).GetProperty("message").GetString()));
    }

    [Fact]
    public async Task Create_class_rejects_an_overlong_name()
    {
        var body = $$"""{ "name": "{{new string('x', 201)}}", "totalSeats": 10 }""";
        var response = await _app.Client.PostAsync("/classes", new StringContent(body, Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("abc")]
    [InlineData("2015269123456789")]     // 16 digits
    [InlineData("201526912345678901")]   // 18 digits
    [InlineData("2015269123456789x")]
    [InlineData("-2015269123456789")]
    [InlineData("২০১৫২৬৯১২৩৪৫৬৭৮৯০")]    // Bengali digits are not accepted by the API
    [InlineData("20152691234567890, 20152691234567891")]
    public async Task Endpoints_that_need_a_student_reject_a_bad_header_with_400(string? studentId)
    {
        Assert.Equal(HttpStatusCode.BadRequest, (await _app.Client.ApplyAsync(_classId, studentId)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _app.Client.ConfirmAsync(_holdId, studentId)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _app.Client.CancelAsync(_holdId, studentId)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _app.Client.SendAsync(HttpMethod.Get, "/me/holds", studentId)).StatusCode);
    }

    [Theory]
    [InlineData("does-not-exist")]
    [InlineData("c_123")]
    [InlineData("%00")]
    [InlineData("'; DROP TABLE holds; --")]
    [InlineData("12345678901234567890123456789012345678901234567890123456789012345678901234567890")]
    public async Task Unknown_ids_are_404(string id)
    {
        var escaped = Uri.EscapeDataString(id);
        var student = Api.Student(1);

        Assert.Equal(HttpStatusCode.NotFound, (await _app.Client.GetAsync($"/classes/{escaped}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _app.Client.ApplyAsync(escaped, student)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _app.Client.GetAsync($"/holds/{escaped}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _app.Client.ConfirmAsync(escaped, student)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _app.Client.CancelAsync(escaped, student)).StatusCode);
    }

    [Fact]
    public async Task Unknown_routes_and_methods_are_4xx_with_a_json_body()
    {
        var notFound = await _app.Client.GetAsync("/nope");
        Assert.Equal(HttpStatusCode.NotFound, notFound.StatusCode);
        Assert.Equal("NOT_FOUND", (await notFound.JsonAsync()).GetProperty("code").GetString());

        var wrongMethod = await _app.Client.DeleteAsync("/classes");
        Assert.Equal(HttpStatusCode.MethodNotAllowed, wrongMethod.StatusCode);
    }

    [Theory]
    [InlineData(null, 600)]
    [InlineData("", 600)]
    [InlineData("abc", 600)]
    [InlineData("0", 600)]
    [InlineData("-10", 600)]
    [InlineData("30", 30)]
    public void Hold_duration_falls_back_to_600_when_unset_or_invalid(string? raw, int expected) =>
        Assert.Equal(expected, AppSettings.ParseHoldDuration(raw));
}
