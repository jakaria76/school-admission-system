using System.Text.Json;
using System.Text.RegularExpressions;

namespace Backend.Api;

public static partial class Validation
{
    public const string StudentHeader = "X-Student-Id";
    public const int MaxClassNameLength = 200;
    public const int MaxTotalSeats = 100_000;

    [GeneratedRegex("^[0-9]{17}$")]
    private static partial Regex StudentIdRegex();

    [GeneratedRegex("^[A-Za-z0-9_-]{1,64}$")]
    private static partial Regex ResourceIdRegex();

    /// <summary>IDs we generate are short ASCII tokens; anything else cannot exist, so it is simply "not found".</summary>
    public static bool IsPlausibleId(string? id) => id is not null && ResourceIdRegex().IsMatch(id);

    /// <summary>Reads X-Student-Id: exactly 17 ASCII digits (birth registration number).</summary>
    public static bool TryGetStudentId(HttpRequest request, out string studentId, out IResult? error)
    {
        studentId = "";
        error = null;

        var values = request.Headers[StudentHeader];
        if (values.Count == 0 || string.IsNullOrWhiteSpace(values[0]))
        {
            error = ApiResults.BadRequest("STUDENT_ID_REQUIRED", $"The {StudentHeader} header is required.");
            return false;
        }

        var value = values.Count == 1 ? values[0]!.Trim() : "";
        if (!StudentIdRegex().IsMatch(value))
        {
            error = ApiResults.BadRequest("STUDENT_ID_INVALID", $"{StudentHeader} must be a 17-digit birth registration number.");
            return false;
        }

        studentId = value;
        return true;
    }

    /// <summary>Parses and validates the POST /classes body by hand so that every malformed input is a 400.</summary>
    public static async Task<(string Name, int TotalSeats, IResult? Error)> ReadCreateClassAsync(HttpRequest request, CancellationToken ct)
    {
        JsonDocument document;
        try
        {
            document = await JsonDocument.ParseAsync(request.Body, cancellationToken: ct);
        }
        catch (JsonException)
        {
            return ("", 0, ApiResults.BadRequest("INVALID_JSON", "Request body must be valid JSON."));
        }

        using (document)
        {
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                return ("", 0, ApiResults.BadRequest("INVALID_BODY", "Request body must be a JSON object."));
            }

            if (!root.TryGetProperty("name", out var nameElement) || nameElement.ValueKind != JsonValueKind.String)
            {
                return ("", 0, ApiResults.BadRequest("NAME_INVALID", "name is required and must be a string."));
            }

            var name = nameElement.GetString()!.Trim();
            if (name.Length == 0 || name.Length > MaxClassNameLength || name.Any(char.IsControl))
            {
                return ("", 0, ApiResults.BadRequest("NAME_INVALID",
                    $"name must be 1-{MaxClassNameLength} characters and contain no control characters."));
            }

            if (!root.TryGetProperty("totalSeats", out var seatsElement)
                || seatsElement.ValueKind != JsonValueKind.Number
                || !seatsElement.TryGetInt32(out var totalSeats)
                || totalSeats < 1 || totalSeats > MaxTotalSeats)
            {
                return ("", 0, ApiResults.BadRequest("TOTAL_SEATS_INVALID",
                    $"totalSeats is required and must be a whole number between 1 and {MaxTotalSeats}."));
            }

            return (name, totalSeats, null);
        }
    }
}
