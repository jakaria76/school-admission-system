using System.Net;

namespace backend.Tests;

/// <summary>Rule 1: held + confirmed never exceeds totalSeats, however many requests arrive together.</summary>
public class ConcurrencyTests
{
    [Fact]
    public async Task Many_students_applying_at_once_never_get_more_holds_than_seats()
    {
        await using var app = await TestApp.StartAsync();
        const int seats = 10, students = 200;
        var classId = await app.Client.CreateClassAsync(seats);

        var responses = await FireTogether(students, i => app.Client.ApplyAsync(classId, Api.Student(i)));

        Assert.Equal(seats, responses.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.Equal(students - seats, responses.Count(r => r.StatusCode == HttpStatusCode.Conflict));
        Assert.Equal((seats, seats, 0, 0), await app.Client.SeatsAsync(classId));
    }

    [Fact]
    public async Task Two_backend_instances_sharing_one_database_do_not_oversell()
    {
        await using var app = await TestApp.StartAsync(instances: 2);
        const int seats = 7, students = 150;
        var classId = await app.Clients[0].CreateClassAsync(seats);

        var responses = await FireTogether(students, i => app.Clients[i % 2].ApplyAsync(classId, Api.Student(i)));

        Assert.Equal(seats, responses.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.Equal(students - seats, responses.Count(r => r.StatusCode == HttpStatusCode.Conflict));
        Assert.Equal((seats, seats, 0, 0), await app.Clients[1].SeatsAsync(classId));
    }

    [Fact]
    public async Task Applying_and_confirming_concurrently_keeps_held_plus_confirmed_within_total()
    {
        await using var app = await TestApp.StartAsync(instances: 2);
        const int seats = 5, students = 60;
        var classId = await app.Client.CreateClassAsync(seats);

        // Every student applies and, if they got a seat, immediately pays or cancels.
        await FireTogether(students, async i =>
        {
            var client = app.Clients[i % 2];
            var response = await client.ApplyAsync(classId, Api.Student(i));
            if (response.StatusCode == HttpStatusCode.Created)
            {
                var holdId = (await response.JsonAsync()).GetProperty("holdId").GetString()!;
                var next = i % 3 == 0 ? client.CancelAsync(holdId, Api.Student(i)) : client.ConfirmAsync(holdId, Api.Student(i));
                await next;
            }

            var (total, held, confirmed, available) = await client.SeatsAsync(classId);
            Assert.True(held + confirmed <= total, $"oversold: held={held} confirmed={confirmed} total={total}");
            Assert.Equal(total - held - confirmed, available);
            return response;
        });

        var final = await app.Client.SeatsAsync(classId);
        Assert.True(final.Held + final.Confirmed <= seats);
    }

    [Fact]
    public async Task Same_student_applying_many_times_at_once_gets_exactly_one_hold()
    {
        await using var app = await TestApp.StartAsync(instances: 2);
        var classId = await app.Client.CreateClassAsync(50);

        var responses = await FireTogether(30, i => app.Clients[i % 2].ApplyAsync(classId, Api.Student(1)));

        Assert.Equal(1, responses.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.Equal(29, responses.Count(r => r.StatusCode == HttpStatusCode.Conflict));
        Assert.Equal(1, (await app.Client.SeatsAsync(classId)).Held);
    }

    [Fact]
    public async Task Confirming_the_same_hold_many_times_at_once_counts_one_seat()
    {
        await using var app = await TestApp.StartAsync(instances: 2);
        var classId = await app.Client.CreateClassAsync(10);
        var holdId = await app.Client.ApplyOkAsync(classId, Api.Student(1));

        var responses = await FireTogether(25, i => app.Clients[i % 2].ConfirmAsync(holdId, Api.Student(1)));

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
        Assert.Equal((10, 0, 1, 9), await app.Client.SeatsAsync(classId));
    }

    /// <summary>Starts all requests behind one gate so they hit the server as simultaneously as possible.</summary>
    private static async Task<HttpResponseMessage[]> FireTogether(int count, Func<int, Task<HttpResponseMessage>> request)
    {
        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var tasks = Enumerable.Range(0, count).Select(i => Task.Run(async () =>
        {
            await gate.Task;
            return await request(i);
        })).ToArray();
        gate.SetResult();
        return await Task.WhenAll(tasks);
    }
}
