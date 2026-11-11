# Assumptions

Where the brief did not say what should happen, this is what was chosen and why.

## Identity and input

| Assumption | Why |
| --- | --- |
| `X-Student-Id` must be exactly 17 ASCII digits. Missing or malformed gives `400`. | The brief defines it as a 17-digit birth registration number; accepting anything else would let typos create applications nobody can find again. |
| `GET /holds/{holdId}` needs no header and does not return `studentId`. | The brief lists no header for it. Since anyone holding the id can read it, the birth registration number is left out. |
| Class name: 1-200 characters after trimming, no control characters. `totalSeats`: whole number, 1 to 100,000. | A class with zero seats or an unbounded name is never intended; the limits only exist to reject mistakes. |
| Two classes may have the same name. | Classes are identified by `id`. Rejecting duplicates would also break anyone re-running the same script against a database that keeps its data. |
| Classes cannot be edited or deleted. | There is no such endpoint in the contract. |
| No login, so the "school admin" screen is open to everyone. | The brief says login is not required. |
| An unknown class or application id is `404`; an unknown route is `404`; a wrong method is `405`. | Standard HTTP meaning. |

## Applying

| Assumption | Why |
| --- | --- |
| A student with a `HELD` (not yet expired) or `CONFIRMED` application in a class gets `409` when applying to that class again. | Rule: at most one active application or confirmed admission per class. |
| After an application is `EXPIRED` or `CANCELLED` the same student may apply to that class again. | Those applications no longer occupy a seat, and people do miss the deadline by accident. |
| A student may hold seats in several different classes at once. | The rule is stated per class. Whether a child may sit in two shifts is a school policy the brief does not give. |
| "No seat" and "already applied" both answer `409`, distinguished by `code` (`CLASS_FULL`, `ALREADY_APPLIED`). | The brief fixes `409` for no seat; a duplicate is the same kind of conflict. |

## Expiry

| Assumption | Why |
| --- | --- |
| A hold is expired from the instant `expiresAt` is reached, judged by the database clock. | One clock for every backend process; the browser clock and the app server clocks are never trusted. |
| No background job. A hold is active only while `status = 'HELD' AND expires_at > now`, so the seat is free in the very next query after the deadline. | Nothing can lag, crash or run twice, and it needs no coordination between processes. The stored status is rewritten to `EXPIRED` the next time somebody applies to that class; until then readers compute it. |
| `HOLD_DURATION_SECONDS` that is missing, not a number or not positive falls back to `600`. It applies to holds created after the change. | A bad value should not stop the service or create holds that expire instantly. |
| `expiresAt` is UTC ISO-8601 with milliseconds, e.g. `2026-11-01T04:10:00.000Z`. | Rounding to whole seconds would make the hold up to a second longer or shorter than configured. |

## Paying and cancelling

| Assumption | Why |
| --- | --- |
| Confirming someone else's application gives `403`. | It exists, but it is not yours. |
| Confirming an expired or cancelled application gives `409` (`HOLD_EXPIRED`, `HOLD_CANCELLED`). | The request is valid but conflicts with the application's state. |
| Confirming an already confirmed application gives `200` again and changes nothing. | Required idempotency: a retried payment must not fail or count twice. |
| Only a `HELD` application can be cancelled. Cancelling twice gives `204` both times. | Same idempotency reasoning as confirm. |
| A `CONFIRMED` admission cannot be cancelled (`409`). | The fee has been paid; withdrawing an admission means a refund process that is outside this brief. |
| Cancelling an expired application gives `409`. | There is nothing left to cancel and the user should learn that it expired. |

## Response shape

- Extra fields were added, none removed or renamed: `heldSeats` / `confirmedSeats` /
  `availableSeats` on `POST /classes`, `className` and `serverTime` on applications.
  `serverTime` lets the UI count down on the server's clock.
- Every error is `{ "code": "...", "message": "..." }`.
- If the database is unreachable the API answers `503`, not `500`.

## How the seat limit is guaranteed

Also the answer to the bonus question about two backend processes on one database.

Every rule is enforced inside PostgreSQL, so it does not matter how many requests or how
many backend processes there are.

1. **Applying** runs in one transaction that first takes a row lock on the class
   (`SELECT ... FROM classes WHERE id = ? FOR UPDATE`). All applications for the same class
   therefore queue up in the database. Inside the lock it marks elapsed holds as `EXPIRED`,
   counts `HELD + CONFIRMED`, and inserts only if the count is below `total_seats`. Counting
   and inserting cannot interleave with another application for that class, whichever
   process it came through. Different classes do not block each other.
2. **One application per student per class** is additionally a partial unique index on
   `(class_id, student_id) WHERE status IN ('HELD', 'CONFIRMED')`.
3. **Confirm and cancel** are single conditional statements
   (`UPDATE ... WHERE id = ? AND student_id = ? AND status = 'HELD' AND expires_at > now`).
   Only one of any number of simultaneous attempts can match, which is why
   `confirmedSeats` grows once. Confirming moves a seat from held to confirmed, so the sum
   never grows.
4. **Time** always comes from the database (`clock_timestamp()`), so two processes cannot
   disagree about whether a hold has expired.
5. **Startup**: the schema is created with idempotent statements under an advisory lock, so
   processes can start at the same moment. Each process limits itself to 40 connections to
   stay under PostgreSQL's default of 100.

Checked by `ConcurrencyTests` (two API instances with separate connection pools on one
database) and by sending 400 simultaneous applications for a 10-seat class to two real
containers (`docker compose --profile multi up`): 10 answered `201`, 390 answered `409`.
Removing the `FOR UPDATE` makes three of those tests fail, so the tests do detect overselling.

The cost: applications for one class are processed one at a time. Each transaction is a few
short statements, which is acceptable for an admission day; thousands of classes still run
in parallel.

## Frontend

| Assumption | Why |
| --- | --- |
| The UI is in Bengali; status codes are shown next to their meaning (e.g. `EXPIRED · মেয়াদ শেষ`). | The users are guardians and school staff; the brief itself names the buttons in Bengali. |
| The frontend is served on port `5173` (changeable with `FRONTEND_PORT`). | The brief fixes only the backend port. |
| The birth registration number is remembered in `localStorage`; applications are always loaded from the server with it. | This is what makes a running application visible after a refresh or after reopening the browser, without a login. |
| Class seats, the application screen and "my applications" refresh every 3 seconds. | "Every few seconds" in the brief; polling is simple and enough at this scale. |
| The countdown uses the server's time, and at zero the screen switches to `EXPIRED` and disables the buttons by itself. | The user's computer clock may be wrong, and the UI must not wait for the next refresh. |
| The number box accepts Bengali digits and ignores spaces and dashes. | People copy the number from a paper certificate. |
