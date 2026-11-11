using Dapper;
using Npgsql;

namespace Backend.Admission;

/// <summary>
/// All seat logic lives here, and every rule is enforced inside PostgreSQL so it holds
/// for any number of concurrent requests and any number of backend processes.
///
/// Expiry is "lazy": a hold is active only while <c>status = 'HELD' AND expires_at &gt; now</c>.
/// The moment the deadline passes the seat stops being counted, without any timer,
/// background job or API call. The database clock is the only clock used.
/// </summary>
public sealed class AdmissionService(NpgsqlDataSource dataSource, AppSettings settings)
{
    private const string ClassColumns = """
        c.id AS Id, c.name AS Name, c.total_seats AS TotalSeats,
        (SELECT count(*) FROM holds h
          WHERE h.class_id = c.id AND h.status = 'HELD' AND h.expires_at > clock_timestamp())::int AS HeldSeats,
        (SELECT count(*) FROM holds h
          WHERE h.class_id = c.id AND h.status = 'CONFIRMED')::int AS ConfirmedSeats
        """;

    private const string HoldSelect = """
        SELECT h.id AS HoldId, h.class_id AS ClassId, c.name AS ClassName, h.student_id AS StudentId,
               CASE WHEN h.status = 'HELD' AND h.expires_at <= clock_timestamp() THEN 'EXPIRED' ELSE h.status END AS Status,
               h.expires_at AS ExpiresAt, clock_timestamp() AS ServerTime
        FROM holds h JOIN classes c ON c.id = h.class_id
        """;

    public async Task<ClassSeats> CreateClassAsync(string name, int totalSeats, CancellationToken ct)
    {
        var id = NewId("c");
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        await connection.ExecuteAsync(new CommandDefinition(
            "INSERT INTO classes (id, name, total_seats) VALUES (@id, @name, @totalSeats)",
            new { id, name, totalSeats }, cancellationToken: ct));
        return new ClassSeats { Id = id, Name = name, TotalSeats = totalSeats };
    }

    public async Task<IReadOnlyList<ClassSeats>> ListClassesAsync(CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        var rows = await connection.QueryAsync<ClassSeats>(new CommandDefinition(
            $"SELECT {ClassColumns} FROM classes c ORDER BY c.created_at, c.id", cancellationToken: ct));
        return rows.AsList();
    }

    public async Task<ClassSeats?> GetClassAsync(string classId, CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        return await connection.QuerySingleOrDefaultAsync<ClassSeats>(new CommandDefinition(
            $"SELECT {ClassColumns} FROM classes c WHERE c.id = @classId", new { classId }, cancellationToken: ct));
    }

    /// <summary>
    /// Applies for a seat. The class row is locked with SELECT ... FOR UPDATE, so all
    /// applications for one class are serialised by the database: the count below and the
    /// insert that follows cannot interleave with another application for the same class.
    /// </summary>
    public async Task<HoldResult> CreateHoldAsync(string classId, string studentId, CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        await using var tx = await connection.BeginTransactionAsync(ct);

        var totalSeats = await connection.QuerySingleOrDefaultAsync<int?>(new CommandDefinition(
            "SELECT total_seats FROM classes WHERE id = @classId FOR UPDATE", new { classId }, tx, cancellationToken: ct));
        if (totalSeats is null)
        {
            return HoldResult.Fail(ErrorKind.ClassNotFound);
        }

        // Housekeeping under the lock: persist EXPIRED for elapsed holds of this class. After
        // this statement every remaining HELD/CONFIRMED row occupies a seat, and an expired
        // application no longer blocks the same student from applying again.
        await connection.ExecuteAsync(new CommandDefinition(
            "UPDATE holds SET status = 'EXPIRED' WHERE class_id = @classId AND status = 'HELD' AND expires_at <= clock_timestamp()",
            new { classId }, tx, cancellationToken: ct));

        var existing = await connection.QueryFirstOrDefaultAsync<Hold>(new CommandDefinition(
            $"{HoldSelect} WHERE h.class_id = @classId AND h.student_id = @studentId AND h.status IN ('HELD', 'CONFIRMED')",
            new { classId, studentId }, tx, cancellationToken: ct));
        if (existing is not null)
        {
            return HoldResult.Fail(ErrorKind.AlreadyApplied, existing);
        }

        var occupied = await connection.ExecuteScalarAsync<int>(new CommandDefinition(
            "SELECT count(*)::int FROM holds WHERE class_id = @classId AND status IN ('HELD', 'CONFIRMED')",
            new { classId }, tx, cancellationToken: ct));
        if (occupied >= totalSeats)
        {
            return HoldResult.Fail(ErrorKind.ClassFull);
        }

        var holdId = NewId("h");
        try
        {
            await connection.ExecuteAsync(new CommandDefinition(
                """
                INSERT INTO holds (id, class_id, student_id, status, expires_at)
                VALUES (@holdId, @classId, @studentId, 'HELD',
                        date_trunc('milliseconds', clock_timestamp()) + make_interval(secs => @seconds))
                """,
                new { holdId, classId, studentId, seconds = settings.HoldDurationSeconds }, tx, cancellationToken: ct));
        }
        catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.UniqueViolation)
        {
            // Unreachable while the class lock is held; kept as a last line of defence.
            return HoldResult.Fail(ErrorKind.AlreadyApplied);
        }

        var hold = await connection.QuerySingleAsync<Hold>(new CommandDefinition(
            $"{HoldSelect} WHERE h.id = @holdId", new { holdId }, tx, cancellationToken: ct));
        await tx.CommitAsync(ct);
        return HoldResult.Ok(hold);
    }

    public async Task<Hold?> GetHoldAsync(string holdId, CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        return await GetHoldAsync(connection, holdId, ct);
    }

    public async Task<IReadOnlyList<Hold>> ListHoldsForStudentAsync(string studentId, CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        var rows = await connection.QueryAsync<Hold>(new CommandDefinition(
            $"{HoldSelect} WHERE h.student_id = @studentId ORDER BY h.created_at DESC, h.id",
            new { studentId }, cancellationToken: ct));
        return rows.AsList();
    }

    /// <summary>
    /// Pays the fee. A single conditional UPDATE does the whole check-and-set, so only the
    /// owner's unexpired HELD hold can change, and it can change exactly once. Repeating the
    /// call finds the hold already CONFIRMED and returns success without touching anything.
    /// </summary>
    public async Task<HoldResult> ConfirmHoldAsync(string holdId, string studentId, CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);

        await connection.ExecuteAsync(new CommandDefinition(
            """
            UPDATE holds SET status = 'CONFIRMED', confirmed_at = clock_timestamp()
            WHERE id = @holdId AND student_id = @studentId AND status = 'HELD' AND expires_at > clock_timestamp()
            """,
            new { holdId, studentId }, cancellationToken: ct));

        var hold = await GetHoldAsync(connection, holdId, ct);
        if (hold is null) return HoldResult.Fail(ErrorKind.HoldNotFound);
        if (hold.StudentId != studentId) return HoldResult.Fail(ErrorKind.NotOwner);

        return hold.Status switch
        {
            HoldStatus.Confirmed => HoldResult.Ok(hold),
            HoldStatus.Cancelled => HoldResult.Fail(ErrorKind.HoldCancelled, hold),
            _ => HoldResult.Fail(ErrorKind.HoldExpired, hold),
        };
    }

    /// <summary>Withdraws an application that is still HELD. Cancelling twice is a no-op.</summary>
    public async Task<HoldResult> CancelHoldAsync(string holdId, string studentId, CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);

        await connection.ExecuteAsync(new CommandDefinition(
            """
            UPDATE holds SET status = 'CANCELLED', cancelled_at = clock_timestamp()
            WHERE id = @holdId AND student_id = @studentId AND status = 'HELD' AND expires_at > clock_timestamp()
            """,
            new { holdId, studentId }, cancellationToken: ct));

        var hold = await GetHoldAsync(connection, holdId, ct);
        if (hold is null) return HoldResult.Fail(ErrorKind.HoldNotFound);
        if (hold.StudentId != studentId) return HoldResult.Fail(ErrorKind.NotOwner);

        return hold.Status switch
        {
            HoldStatus.Cancelled => HoldResult.Ok(hold),
            HoldStatus.Confirmed => HoldResult.Fail(ErrorKind.HoldConfirmed, hold),
            _ => HoldResult.Fail(ErrorKind.HoldExpired, hold),
        };
    }

    private static Task<Hold?> GetHoldAsync(NpgsqlConnection connection, string holdId, CancellationToken ct) =>
        connection.QuerySingleOrDefaultAsync<Hold>(new CommandDefinition(
            $"{HoldSelect} WHERE h.id = @holdId", new { holdId }, cancellationToken: ct));

    private static string NewId(string prefix) => $"{prefix}_{Guid.NewGuid():N}";
}
