using System.Globalization;
using Backend.Admission;

namespace Backend.Api;

/// <summary>Every error response has the same shape: <c>{ "code": "...", "message": "..." }</c>.</summary>
public sealed record ApiError(string Code, string Message);

public static class ApiResults
{
    public static IResult Error(int status, string code, string message) =>
        Results.Json(new ApiError(code, message), statusCode: status);

    public static IResult BadRequest(string code, string message) => Error(StatusCodes.Status400BadRequest, code, message);

    public static IResult FromError(ErrorKind error) => error switch
    {
        ErrorKind.ClassNotFound => Error(404, "CLASS_NOT_FOUND", "Class not found."),
        ErrorKind.HoldNotFound => Error(404, "HOLD_NOT_FOUND", "Application not found."),
        ErrorKind.NotOwner => Error(403, "NOT_OWNER", "This application belongs to another student."),
        ErrorKind.ClassFull => Error(409, "CLASS_FULL", "No seats are available in this class."),
        ErrorKind.AlreadyApplied => Error(409, "ALREADY_APPLIED", "This student already has an active application or a confirmed admission in this class."),
        ErrorKind.HoldExpired => Error(409, "HOLD_EXPIRED", "The application has expired."),
        ErrorKind.HoldCancelled => Error(409, "HOLD_CANCELLED", "The application was cancelled."),
        ErrorKind.HoldConfirmed => Error(409, "HOLD_CONFIRMED", "A confirmed admission cannot be cancelled."),
        _ => Error(500, "INTERNAL_ERROR", "Unexpected error."),
    };

    /// <summary>UTC ISO-8601 with a trailing Z, e.g. 2026-11-01T04:10:00.000Z.</summary>
    public static string Iso(DateTime value) =>
        value.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

    public static object ClassCreated(ClassSeats c) => new
    {
        id = c.Id, name = c.Name, totalSeats = c.TotalSeats,
        heldSeats = c.HeldSeats, confirmedSeats = c.ConfirmedSeats, availableSeats = c.AvailableSeats,
    };

    public static object Class(ClassSeats c) => ClassCreated(c);

    /// <summary>Hold as seen by its owner (includes studentId).</summary>
    public static object OwnHold(Hold h) => new
    {
        holdId = h.HoldId, classId = h.ClassId, className = h.ClassName, studentId = h.StudentId,
        status = h.Status, expiresAt = Iso(h.ExpiresAt), serverTime = Iso(h.ServerTime),
    };

    /// <summary>Hold as returned by the header-less GET /holds/{id}: the birth registration number is left out.</summary>
    public static object PublicHold(Hold h) => new
    {
        holdId = h.HoldId, classId = h.ClassId, className = h.ClassName,
        status = h.Status, expiresAt = Iso(h.ExpiresAt), serverTime = Iso(h.ServerTime),
    };
}
