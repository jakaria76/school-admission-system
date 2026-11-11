namespace Backend.Admission;

public static class HoldStatus
{
    public const string Held = "HELD";
    public const string Confirmed = "CONFIRMED";
    public const string Expired = "EXPIRED";
    public const string Cancelled = "CANCELLED";
}

/// <summary>A class (one shift) together with its live seat numbers.</summary>
public sealed class ClassSeats
{
    public string Id { get; init; } = "";
    public string Name { get; init; } = "";
    public int TotalSeats { get; init; }
    public int HeldSeats { get; init; }
    public int ConfirmedSeats { get; init; }
    public int AvailableSeats => Math.Max(0, TotalSeats - HeldSeats - ConfirmedSeats);
}

/// <summary>An application. <see cref="Status"/> is the effective status (an elapsed HELD reads as EXPIRED).</summary>
public sealed class Hold
{
    public string HoldId { get; init; } = "";
    public string ClassId { get; init; } = "";
    public string ClassName { get; init; } = "";
    public string StudentId { get; init; } = "";
    public string Status { get; init; } = "";
    public DateTime ExpiresAt { get; init; }
    public DateTime ServerTime { get; init; }
}

public enum ErrorKind
{
    None,
    ClassNotFound,
    HoldNotFound,
    NotOwner,
    ClassFull,
    AlreadyApplied,
    HoldExpired,
    HoldCancelled,
    HoldConfirmed,
}

public readonly record struct HoldResult(ErrorKind Error, Hold? Hold)
{
    public static HoldResult Ok(Hold hold) => new(ErrorKind.None, hold);
    public static HoldResult Fail(ErrorKind error, Hold? hold = null) => new(error, hold);
}
