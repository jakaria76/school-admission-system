using System.Net.Sockets;
using Backend;
using Backend.Admission;
using Backend.Api;
using Backend.Data;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton(sp => AppSettings.FromConfiguration(sp.GetRequiredService<IConfiguration>()));
builder.Services.AddSingleton(sp => NpgsqlDataSource.Create(sp.GetRequiredService<AppSettings>().ConnectionString));
builder.Services.AddSingleton<AdmissionService>();
builder.Services.AddHostedService<DatabaseInitializer>();

// The React app is served from another origin (port), and there are no cookies or
// credentials involved, so any origin may call the API.
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();

// Last line of defence: nothing may leak out as an unhandled exception page.
app.Use(async (context, next) =>
{
    try
    {
        await next(context);
    }
    catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
    {
        // Client went away; nothing to send.
    }
    catch (Exception ex) when (!context.Response.HasStarted)
    {
        var (status, code, message) = ex switch
        {
            BadHttpRequestException bad => (bad.StatusCode, "BAD_REQUEST", "The request could not be read."),
            NpgsqlException or TimeoutException or SocketException =>
                (StatusCodes.Status503ServiceUnavailable, "SERVICE_UNAVAILABLE", "The database is temporarily unavailable. Please retry."),
            _ => (StatusCodes.Status500InternalServerError, "INTERNAL_ERROR", "Unexpected server error."),
        };

        if (status >= 500)
        {
            app.Logger.LogError(ex, "Request {Method} {Path} failed", context.Request.Method, context.Request.Path);
        }

        context.Response.Clear();
        context.Response.StatusCode = status;
        await context.Response.WriteAsJsonAsync(new ApiError(code, message));
    }
});

app.UseCors();

// Unknown routes / wrong methods still answer with the JSON error shape.
app.UseStatusCodePages(async statusContext =>
{
    var response = statusContext.HttpContext.Response;
    var (code, message) = response.StatusCode switch
    {
        StatusCodes.Status404NotFound => ("NOT_FOUND", "Resource not found."),
        StatusCodes.Status405MethodNotAllowed => ("METHOD_NOT_ALLOWED", "Method not allowed."),
        _ => ("REQUEST_FAILED", "The request could not be processed."),
    };
    await response.WriteAsJsonAsync(new ApiError(code, message));
});

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

// 1. Create a class (one shift = one class).
app.MapPost("/classes", async (HttpRequest request, AdmissionService service, CancellationToken ct) =>
{
    var (name, totalSeats, error) = await Validation.ReadCreateClassAsync(request, ct);
    if (error is not null) return error;

    var created = await service.CreateClassAsync(name, totalSeats, ct);
    return Results.Json(ApiResults.ClassCreated(created), statusCode: StatusCodes.Status201Created);
});

// 2. All classes with seat numbers.
app.MapGet("/classes", async (AdmissionService service, CancellationToken ct) =>
    Results.Ok((await service.ListClassesAsync(ct)).Select(ApiResults.Class)));

// 3. One class with seat numbers.
app.MapGet("/classes/{classId}", async (string classId, AdmissionService service, CancellationToken ct) =>
{
    var found = Validation.IsPlausibleId(classId) ? await service.GetClassAsync(classId, ct) : null;
    return found is null ? ApiResults.FromError(ErrorKind.ClassNotFound) : Results.Ok(ApiResults.Class(found));
});

// 4. Apply: hold a seat for the student.
app.MapPost("/classes/{classId}/holds", async (string classId, HttpRequest request, AdmissionService service, CancellationToken ct) =>
{
    if (!Validation.TryGetStudentId(request, out var studentId, out var error)) return error!;
    if (!Validation.IsPlausibleId(classId)) return ApiResults.FromError(ErrorKind.ClassNotFound);

    var result = await service.CreateHoldAsync(classId, studentId, ct);
    return result.Error == ErrorKind.None
        ? Results.Json(ApiResults.OwnHold(result.Hold!), statusCode: StatusCodes.Status201Created)
        : ApiResults.FromError(result.Error);
});

// 5. Current state of an application.
app.MapGet("/holds/{holdId}", async (string holdId, AdmissionService service, CancellationToken ct) =>
{
    var hold = Validation.IsPlausibleId(holdId) ? await service.GetHoldAsync(holdId, ct) : null;
    return hold is null ? ApiResults.FromError(ErrorKind.HoldNotFound) : Results.Ok(ApiResults.PublicHold(hold));
});

// 6. Pay the fee: confirm the admission (idempotent).
app.MapPost("/holds/{holdId}/confirm", async (string holdId, HttpRequest request, AdmissionService service, CancellationToken ct) =>
{
    if (!Validation.TryGetStudentId(request, out var studentId, out var error)) return error!;
    if (!Validation.IsPlausibleId(holdId)) return ApiResults.FromError(ErrorKind.HoldNotFound);

    var result = await service.ConfirmHoldAsync(holdId, studentId, ct);
    return result.Error == ErrorKind.None
        ? Results.Ok(new { holdId = result.Hold!.HoldId, status = result.Hold.Status, classId = result.Hold.ClassId })
        : ApiResults.FromError(result.Error);
});

// 7. Cancel an application.
app.MapDelete("/holds/{holdId}", async (string holdId, HttpRequest request, AdmissionService service, CancellationToken ct) =>
{
    if (!Validation.TryGetStudentId(request, out var studentId, out var error)) return error!;
    if (!Validation.IsPlausibleId(holdId)) return ApiResults.FromError(ErrorKind.HoldNotFound);

    var result = await service.CancelHoldAsync(holdId, studentId, ct);
    return result.Error == ErrorKind.None ? Results.NoContent() : ApiResults.FromError(result.Error);
});

// 8. All applications of the student.
app.MapGet("/me/holds", async (HttpRequest request, AdmissionService service, CancellationToken ct) =>
{
    if (!Validation.TryGetStudentId(request, out var studentId, out var error)) return error!;
    return Results.Ok((await service.ListHoldsForStudentAsync(studentId, ct)).Select(ApiResults.OwnHold));
});

app.Run();

public partial class Program;
