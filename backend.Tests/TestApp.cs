using System.Net.Http.Json;
using System.Text.Json;
using Backend;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace backend.Tests;

/// <summary>
/// Boots the real API (in-memory HTTP, real PostgreSQL) against a throwaway database.
/// <paramref name="instances"/> &gt; 1 starts several independent hosts, each with its own
/// connection pool, sharing that one database - the same situation as several backend
/// processes behind different ports.
/// </summary>
public sealed class TestApp : IAsyncDisposable
{
    private readonly string _adminConnectionString;
    private readonly string _databaseName;
    private readonly List<WebApplicationFactory<Program>> _factories = [];

    public IReadOnlyList<HttpClient> Clients { get; private set; } = [];
    public HttpClient Client => Clients[0];
    public string ConnectionString { get; }
    public int HoldDurationSeconds { get; }

    private TestApp(string adminConnectionString, string databaseName, int holdDurationSeconds)
    {
        _adminConnectionString = adminConnectionString;
        _databaseName = databaseName;
        HoldDurationSeconds = holdDurationSeconds;
        ConnectionString = new NpgsqlConnectionStringBuilder(adminConnectionString)
        {
            Database = databaseName,
            MaxPoolSize = 20,
        }.ConnectionString;
    }

    public static async Task<TestApp> StartAsync(int holdDurationSeconds = 600, int instances = 1)
    {
        var admin = Environment.GetEnvironmentVariable("TEST_DB_CONNECTION_STRING")
            ?? "Host=localhost;Port=5432;Database=postgres;Username=postgres;Password=postgres";
        var databaseName = $"admission_test_{Guid.NewGuid():N}";

        await using (var connection = new NpgsqlConnection(admin))
        {
            await connection.OpenAsync();
            await using var cmd = new NpgsqlCommand($"CREATE DATABASE \"{databaseName}\"", connection);
            await cmd.ExecuteNonQueryAsync();
        }

        var app = new TestApp(admin, databaseName, holdDurationSeconds);
        app.Clients = Enumerable.Range(0, instances).Select(_ => app.StartInstance()).ToList();
        return app;
    }

    /// <summary>Starts one more backend host on the same database (also used to simulate a restart).</summary>
    public HttpClient StartInstance()
    {
        var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
            builder.ConfigureTestServices(services =>
                services.AddSingleton(new AppSettings(ConnectionString, HoldDurationSeconds))));
        _factories.Add(factory);
        return factory.CreateClient();
    }

    public async Task StopAllInstancesAsync()
    {
        foreach (var factory in _factories)
        {
            await factory.DisposeAsync();
        }
        _factories.Clear();
    }

    public async ValueTask DisposeAsync()
    {
        await StopAllInstancesAsync();
        await using var connection = new NpgsqlConnection(_adminConnectionString);
        await connection.OpenAsync();
        await using var cmd = new NpgsqlCommand($"DROP DATABASE IF EXISTS \"{_databaseName}\" WITH (FORCE)", connection);
        await cmd.ExecuteNonQueryAsync();
    }
}

public static class Api
{
    /// <summary>A valid 17-digit birth registration number derived from a small integer.</summary>
    public static string Student(int n) => (20150000000000000L + n).ToString();

    public static async Task<string> CreateClassAsync(this HttpClient client, int totalSeats, string name = "Class 6 - Morning Shift")
    {
        var response = await client.PostAsJsonAsync("/classes", new { name, totalSeats });
        response.EnsureSuccessStatusCode();
        return (await response.JsonAsync()).GetProperty("id").GetString()!;
    }

    public static Task<HttpResponseMessage> SendAsync(this HttpClient client, HttpMethod method, string path, string? studentId = null)
    {
        var request = new HttpRequestMessage(method, path);
        if (studentId is not null)
        {
            request.Headers.TryAddWithoutValidation("X-Student-Id", studentId);
        }
        return client.SendAsync(request);
    }

    public static Task<HttpResponseMessage> ApplyAsync(this HttpClient client, string classId, string? studentId) =>
        client.SendAsync(HttpMethod.Post, $"/classes/{classId}/holds", studentId);

    public static Task<HttpResponseMessage> ConfirmAsync(this HttpClient client, string holdId, string? studentId) =>
        client.SendAsync(HttpMethod.Post, $"/holds/{holdId}/confirm", studentId);

    public static Task<HttpResponseMessage> CancelAsync(this HttpClient client, string holdId, string? studentId) =>
        client.SendAsync(HttpMethod.Delete, $"/holds/{holdId}", studentId);

    public static async Task<string> ApplyOkAsync(this HttpClient client, string classId, string studentId)
    {
        var response = await client.ApplyAsync(classId, studentId);
        Assert.Equal(System.Net.HttpStatusCode.Created, response.StatusCode);
        return (await response.JsonAsync()).GetProperty("holdId").GetString()!;
    }

    public static async Task<JsonElement> GetJsonAsync(this HttpClient client, string path, string? studentId = null)
    {
        var response = await client.SendAsync(HttpMethod.Get, path, studentId);
        response.EnsureSuccessStatusCode();
        return await response.JsonAsync();
    }

    public static async Task<JsonElement> JsonAsync(this HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.Clone();

    public static async Task<(int Total, int Held, int Confirmed, int Available)> SeatsAsync(this HttpClient client, string classId)
    {
        var json = await client.GetJsonAsync($"/classes/{classId}");
        return (json.GetProperty("totalSeats").GetInt32(), json.GetProperty("heldSeats").GetInt32(),
            json.GetProperty("confirmedSeats").GetInt32(), json.GetProperty("availableSeats").GetInt32());
    }
}
