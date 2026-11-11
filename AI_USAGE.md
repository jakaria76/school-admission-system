# AI usage

## Tools

- **Claude Code** (Anthropic's coding agent, model Claude Fable 5.2), used inside VS Code.
- **Cursor**, for the visual redesign of the frontend.

## What they were used for

The project skeleton (`dotnet new`, `npm create vite`) was created by hand, without AI.

Starting from that skeleton and the assignment brief, **Claude Code** wrote:

- the backend: API routes, validation, the SQL for holding / confirming / cancelling seats,
  schema creation
- the backend tests, including the concurrency tests
- the first version of the React frontend (all four screens, polling, countdown, error
  messages) and its tests
- the Dockerfiles and `docker-compose.yml`
- the first draft of `README.md`, `ASSUMPTIONS.md` and this file

The commits it made carry a `Co-Authored-By: Claude` trailer.

**Cursor** was then used to restyle that frontend: the header, stat cards, table chips,
the stepper and countdown on the application screen, and the stylesheet (commit "Enhance
frontend UI with modern design system, stats cards, and Bengali typography"). It changed
the look only; the API calls and the behaviour stayed as they were, and the existing
frontend tests still passed afterwards.

After the redesign, Claude Code fixed the two problems found in it (the last two UI rows
in the table below).

## Where the AI got it wrong, and how that was caught

| What went wrong | How it was caught | Fix |
| --- | --- | --- |
| The first `docker-compose.yml` published the frontend on port 3000. | `docker compose up` failed: "port is already allocated" (another project on the development machine uses 3000). | Default changed to 5173 and made configurable with `FRONTEND_PORT`. |
| A test compared `string?[]` with `string[]`, which produced a nullable-reference compiler warning. | Build output of `dotnet test`. | Added the missing null-forgiving operator. |
| Several frontend files were first generated through one long shell command, which failed on quoting and wrote nothing. | The command's error output, then listing the directory. | Files were written one by one instead. |
| On the class list the **apply** button was simply disabled until a student number was typed. Clicking it did nothing and nothing on screen said why. | Found by hand while trying the running app in the browser: "the apply button does not work". | The button is now always clickable; without a number it moves the cursor to the number box, highlights it and says what to type. A one-click sample number was added, and a browser click-through of the whole flow was run. |
| The header showed a green "system active" badge that was a fixed label, even with the backend stopped. | Reading the redesigned header against the rule that a stopped server must be reported. | The badge now reflects the result of the latest API call (connected / disconnected). |
| A helper used to create several commits stopped after the first one, so two commits were silently not made. | `git log` showed fewer commits than expected. | The remaining commits were made individually. |

## How the AI's work was checked

The code was not accepted on the AI's word; each claim was run:

- **Does the concurrency test really detect overselling?** The row lock
  (`FOR UPDATE`) was removed temporarily: 3 of the 5 concurrency tests failed. With the lock
  restored all pass.
- **Does it hold across processes?** Two backend containers on one database received 400
  simultaneous applications for a 10-seat class: 10 x `201`, 390 x `409`.
- **Does data survive?** `docker compose down` then `up`: class and confirmed admission
  were still there.
- **Does the UI really render and reach the API from the browser?** The running frontend
  was opened in a headless browser against the Docker stack (this also checks CORS).
- Backend tests (57) and frontend tests (17) pass both locally and inside Docker.

Two design points where the obvious AI-style answer was deliberately not used:

- Expiry is not a background timer. A timer in each process is exactly what breaks with two
  backend processes; instead a hold simply stops counting once the database clock passes
  `expires_at`.
- The hold duration is passed to SQL as a number of seconds (`make_interval`), because
  Dapper sends a .NET `TimeSpan` as SQL `time`, not as an interval.
