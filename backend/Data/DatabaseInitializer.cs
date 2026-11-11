using Npgsql;

namespace Backend.Data;

/// <summary>
/// Creates the schema on startup. The statements are idempotent and run under a
/// PostgreSQL advisory lock, so several backend processes can start at the same time.
/// </summary>
public sealed class DatabaseInitializer(NpgsqlDataSource dataSource, ILogger<DatabaseInitializer> logger)
    : IHostedService
{
    private const long SchemaLockKey = 7_316_204_915;

    private const string Schema = """
        CREATE TABLE IF NOT EXISTS classes (
            id          text        PRIMARY KEY,
            name        text        NOT NULL,
            total_seats integer     NOT NULL CHECK (total_seats > 0),
            created_at  timestamptz NOT NULL DEFAULT now()
        );

        -- A hold is one application. An elapsed HELD row counts as EXPIRED even
        -- before anything rewrites its status (see AdmissionService).
        CREATE TABLE IF NOT EXISTS holds (
            id           text        PRIMARY KEY,
            class_id     text        NOT NULL REFERENCES classes (id),
            student_id   text        NOT NULL,
            status       text        NOT NULL CHECK (status IN ('HELD', 'CONFIRMED', 'EXPIRED', 'CANCELLED')),
            expires_at   timestamptz NOT NULL,
            created_at   timestamptz NOT NULL DEFAULT now(),
            confirmed_at timestamptz,
            cancelled_at timestamptz
        );

        -- Database-level guarantee: one active application / admission per student per class.
        CREATE UNIQUE INDEX IF NOT EXISTS ux_holds_active_per_student
            ON holds (class_id, student_id) WHERE status IN ('HELD', 'CONFIRMED');

        CREATE INDEX IF NOT EXISTS ix_holds_student ON holds (student_id, created_at DESC);
        """;

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        const int maxAttempts = 30;
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
                await using var tx = await connection.BeginTransactionAsync(cancellationToken);
                await using (var cmd = new NpgsqlCommand("SELECT pg_advisory_xact_lock(@key)", connection, tx))
                {
                    cmd.Parameters.AddWithValue("key", SchemaLockKey);
                    await cmd.ExecuteNonQueryAsync(cancellationToken);
                }
                await using (var cmd = new NpgsqlCommand(Schema, connection, tx))
                {
                    await cmd.ExecuteNonQueryAsync(cancellationToken);
                }
                await tx.CommitAsync(cancellationToken);
                logger.LogInformation("Database schema is ready");
                return;
            }
            catch (Exception ex) when (attempt < maxAttempts && ex is NpgsqlException or TimeoutException)
            {
                logger.LogWarning("Database not ready (attempt {Attempt}/{Max}): {Message}", attempt, maxAttempts, ex.Message);
                await Task.Delay(TimeSpan.FromSeconds(2), cancellationToken);
            }
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
