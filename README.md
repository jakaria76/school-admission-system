# School Admission System

First-come-first-served school admission: a guardian applies, a seat is held for a limited
time, and paying the fee inside that window confirms the admission. If the fee is not paid
in time the seat goes back to the pool by itself.

- **Backend:** C# / .NET 9 minimal API, PostgreSQL 16 (Npgsql + Dapper)
- **Frontend:** React 19 + TypeScript + Vite
- **Runs with:** Docker only

See [ASSUMPTIONS.md](ASSUMPTIONS.md) for the decisions taken where the brief was silent, and
[AI_USAGE.md](AI_USAGE.md) for how AI tools were used.

## Run it

Only Docker is needed.

```bash
docker compose up --build
```

| What     | URL                     |
| -------- | ----------------------- |
| Frontend | <http://localhost:5173> |
| Backend  | <http://localhost:8080> |

Open the frontend, then:

1. **ক্লাস তৈরি (school admin)** - create a class (one shift = one class) with a name and seat count.
2. Type a 17-digit birth registration number in the box at the top of the page, e.g. `20152691234567890`.
3. **ক্লাস তালিকা** - press **আবেদন করুন** to hold a seat.
4. On the application screen press **ভর্তি ফি দিন** to confirm, or **বাতিল** to cancel.
5. **আমার আবেদন** lists every application of that student.

Stop with `docker compose down`. Data is kept in the `pgdata` volume, so it is still there
after the next `docker compose up`. (`docker compose down -v` wipes it.)

### Configuration

All settings are environment variables. Set them in the shell or in a `.env` file next to
`docker-compose.yml`.

| Variable                | Default                                                                    | Used by  | Meaning                                                    |
| ----------------------- | -------------------------------------------------------------------------- | -------- | ---------------------------------------------------------- |
| `DB_CONNECTION_STRING`  | `Host=db;Port=5432;Database=admission;Username=admission;Password=admission` | backend  | PostgreSQL connection (Npgsql format)                      |
| `HOLD_DURATION_SECONDS` | `600`                                                                      | backend  | How long a seat stays held                                 |
| `API_BASE_URL`          | `http://localhost:8080`                                                    | frontend | Backend URL as seen from the browser, read at container start |
| `FRONTEND_PORT`         | `5173`                                                                     | compose  | Host port of the frontend                                  |

Example, to watch a hold expire quickly:

```bash
HOLD_DURATION_SECONDS=30 docker compose up --build
```

PowerShell: `$env:HOLD_DURATION_SECONDS=30; docker compose up --build`

## Tests

Both suites run inside Docker, nothing else has to be installed.

```bash
# Backend: 57 tests against a real PostgreSQL (concurrency, hold rules, validation)
docker compose --profile test run --rm --build backend-tests

# Frontend: 16 tests (Vitest + Testing Library)
docker compose --profile test run --rm --build frontend-tests
```

The backend tests start the real API in-process and talk to the `db` container. Every test
creates its own throwaway database and drops it afterwards, so the application data is not
touched.

What the backend tests cover:

- `ConcurrencyTests` - hundreds of simultaneous applications for a class with a few seats:
  exactly `totalSeats` succeed, the rest get `409`. Repeated with **two backend instances
  sharing one database**, with applying / paying / cancelling mixed together, with one
  student applying 30 times at once, and with 25 simultaneous confirms of one hold.
- `HoldRulesTests` - response contract, expiry without any API call, ownership, idempotent
  confirm, cancel, re-applying, data surviving a restart.
- `ValidationTests` - malformed bodies, bad `X-Student-Id`, unknown ids and routes are all `4xx`.

With the .NET 9 SDK and Node 24 installed they can also be run directly:

```bash
# needs a PostgreSQL; point the tests at it (default: localhost:5432, postgres/postgres)
TEST_DB_CONNECTION_STRING="Host=localhost;Port=5432;Database=postgres;Username=postgres;Password=postgres" dotnet test
cd frontend && npm ci && npm test
```

## Bonus: two backend processes on one database

```bash
docker compose --profile multi up --build
```

This adds a second backend on <http://localhost:8081> that uses the same database. The seat
limit holds across both because it is enforced inside PostgreSQL, not in application memory
(details in [ASSUMPTIONS.md](ASSUMPTIONS.md#how-the-seat-limit-is-guaranteed)).

## API

Base URL `http://localhost:8080`, JSON in and out. The student is identified by the
`X-Student-Id` header (17-digit birth registration number).

| #   | Method and path                | Header         | Success | Purpose                    |
| --- | ------------------------------ | -------------- | ------- | -------------------------- |
| 1   | `POST /classes`                |                | `201`   | Create a class             |
| 2   | `GET /classes`                 |                | `200`   | All classes with seat numbers |
| 3   | `GET /classes/{classId}`       |                | `200`   | One class with seat numbers |
| 4   | `POST /classes/{classId}/holds` | `X-Student-Id` | `201`   | Apply (hold a seat)        |
| 5   | `GET /holds/{holdId}`          |                | `200`   | Current state of an application |
| 6   | `POST /holds/{holdId}/confirm` | `X-Student-Id` | `200`   | Pay the fee, confirm       |
| 7   | `DELETE /holds/{holdId}`       | `X-Student-Id` | `204`   | Cancel an application      |
| 8   | `GET /me/holds`                | `X-Student-Id` |         | All applications of the student |

Errors always look like `{ "code": "CLASS_FULL", "message": "..." }`:
`400` invalid input, `403` not your application, `404` unknown class / application,
`409` no seat left, already applied, expired or cancelled.

## Project layout

```
backend/                 .NET minimal API
  Program.cs             routes, CORS, error handling
  Admission/             AdmissionService: every seat rule, as SQL
  Api/                   input validation and response shapes
  Data/                  schema creation on startup
  Dockerfile
backend.Tests/           xUnit tests (real PostgreSQL)
frontend/                React app
  src/pages/             ClassList, CreateClass, HoldDetail, MyHolds
  src/api.ts             API client
  src/test/              Vitest tests
  Dockerfile
docker-compose.yml
```

## Local development without Docker

```bash
# backend on http://localhost:8080 (needs a PostgreSQL)
cd backend
DB_CONNECTION_STRING="Host=localhost;Port=5432;Database=admission;Username=postgres;Password=postgres" dotnet run

# frontend on http://localhost:5173
cd frontend
npm ci
VITE_API_BASE_URL=http://localhost:8080 npm run dev
```
