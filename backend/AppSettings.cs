using Npgsql;

namespace Backend;

/// <summary>
/// Runtime settings. Everything comes from environment variables so the same
/// image can be pointed at a different database / hold duration without a rebuild.
/// </summary>
public sealed record AppSettings(string ConnectionString, int HoldDurationSeconds)
{
    public const int DefaultHoldDurationSeconds = 600;

    private const string DefaultConnectionString =
        "Host=localhost;Port=5432;Database=admission;Username=postgres;Password=postgres";

    public static AppSettings FromConfiguration(IConfiguration config)
    {
        // DB_CONNECTION_STRING is the documented variable; ConnectionStrings__Default is
        // accepted too because that is what .NET developers usually reach for.
        var raw = FirstNonEmpty(
            config["DB_CONNECTION_STRING"],
            config.GetConnectionString("Default"),
            DefaultConnectionString);

        var builder = new NpgsqlConnectionStringBuilder(raw);

        // PostgreSQL allows 100 connections by default. Keep each process well below
        // that so two backend processes can share one database (bonus requirement).
        if (!raw.Contains("Pool Size", StringComparison.OrdinalIgnoreCase))
        {
            builder.MaxPoolSize = 40;
        }

        return new AppSettings(builder.ConnectionString, ParseHoldDuration(config["HOLD_DURATION_SECONDS"]));
    }

    /// <summary>Missing, non-numeric or non-positive values fall back to the default (600).</summary>
    public static int ParseHoldDuration(string? raw) =>
        int.TryParse(raw, out var seconds) && seconds > 0 ? seconds : DefaultHoldDurationSeconds;

    private static string FirstNonEmpty(params string?[] values) =>
        values.First(v => !string.IsNullOrWhiteSpace(v))!;
}
