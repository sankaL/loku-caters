# Switching Between the Full and Lite Site

Run the full site while an order event is open, and the lite site during a
hiatus. Switching is one command and takes 3 to 5 minutes of build time.

| | Full site | Lite site |
| --- | --- | --- |
| Git branch | `main` | `frontend-only` |
| Command | `make deploy-full` | `make deploy-lite` |
| What runs on Railway | Frontend + FastAPI backend | Frontend only (backend stopped) |
| Admin portal | Yes, at `/admin` | No |
| Where events, menu and prices live | Admin portal (Supabase database) | `config/event-config.json` in the repo |
| Where orders go | Database + owner email | Owner email only |
| Frontend sleeps when idle | No | Yes (first visit after idle takes a few seconds) |
| Approximate Railway memory | About 330 MB (two services) | About 100 MB, near zero while asleep |

The Supabase keep-alive job runs in both modes, so the database never pauses.

## One-time setup

You need a local copy of the repo and the Railway CLI logged in to the account
that owns the `loku-caters-v2` project.

1. Clone the repo: `git clone https://github.com/sankaL/loku-caters.git`
2. Install the [Railway CLI](https://docs.railway.com/guides/cli) and log in:
   `railway login`
3. Check access: `railway list` should show `loku-caters-v2`.
4. Make sure `python3` and `git` are available. The script uses both.

The switch script is `scripts/railway-mode.sh` on both branches, so you can run
it from either checkout. It always deploys the latest commit of the target
branch on GitHub, not your local files. Push before you switch.

## Switching to full mode (an event is coming)

Run this a day or two before you set up the event, so there is time to fix
anything that fails.

1. Make sure everything you want live is merged into `main` on GitHub.
2. From the repo folder, run `make deploy-full` and answer `y`.
3. Wait for both services to report `SUCCESS` (about 3 to 5 minutes).
4. Check the site:
    - <https://www.lokucaters.com> loads.
    - <https://api.lokucaters.com/api/health> shows `"status":"ok"`.
    - <https://www.lokucaters.com/admin> sends you to the login page, and you
      can sign in.
5. Create and activate the event in the admin portal as usual.

What it does: deploys `main` to the backend, turns off frontend sleeping, then
deploys `main` to the frontend and waits for both.

## Switching to lite mode (going on hiatus)

Run this once the last event's orders are picked up and paid.

1. Make sure `frontend-only` on GitHub has what you want live. Its
   `config/event-config.json` should have `active_event.is_active` set to
   `false` unless you are taking orders in lite mode (see
   `docs/running-an-event.md` on the `frontend-only` branch).
2. Run `make deploy-lite` and answer `y`.
3. Wait for the frontend to report `SUCCESS`. The script then stops the
   backend.
4. Check <https://www.lokucaters.com> loads and shows "No active events at this
   moment!" (or your lite event).

What it does: turns on frontend sleeping, deploys `frontend-only` to the
frontend, waits for it, then removes the backend deployment. The backend's
settings, variables and `api.lokucaters.com` domain are kept for the next full
switch.

## Checking status and making changes

`make deploy-status` prints the commit, status and sleep setting of each
service. In lite mode the backend shows `REMOVED` or `FAILED` with no commit,
which means it is stopped.

- **Nothing deploys on push.** The GitHub Actions Deploy workflow is disabled
  and Railway's GitHub triggers are removed. After merging a change, rerun
  `make deploy-full` (on `main`) or `make deploy-lite` (on `frontend-only`).
- **The two modes keep separate data.** Prices, items and locations changed in
  the admin portal do not carry over to `config/event-config.json`, and the
  other way round.
- **Lite-mode submissions are emails only.** Orders, catering requests and
  feedback sent in lite mode never reach the admin portal.
- **Skip the confirmation prompt** with `./scripts/railway-mode.sh full -y` (or
  `lite -y`).

## Supabase keep-alive

The Supabase project is on the Free plan, which pauses after 7 days of low
activity ([Supabase docs](https://supabase.com/docs/guides/platform/free-project-pausing)).
The Railway cron service `supabase-keepalive` prevents that in both modes.

- Runs every 6 hours (`23 */6 * * *`, UTC) using the stock
  `postgres:17-alpine` image.
- Reads `DATABASE_URL` by reference from `loku-caters-backend` and runs one
  read-only query that counts `events` and `orders`. Nothing is written.
- Costs well under one cent a month.
- Check recent runs: `railway cron list --service supabase-keepalive`.
- Never delete the `loku-caters-backend` service without first moving
  `DATABASE_URL` onto the keep-alive service.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Script says `FAILED` or `CRASHED` | Build or start error | Run the `railway logs` command it prints, fix on the branch, push, rerun |
| API returns 502 "Application failed to respond" | Backend cannot reach the database, usually a dependency change | Check `railway logs --service loku-caters-backend`; the `scramp==1.4.18` pin in `backend/requirements.txt` must stay |
| `/admin` shows a 500 page | Login redirect broken | Make sure `main` includes the middleware fix from PR #75 |
| Site slow on the first visit | Lite mode frontend was asleep | Expected; it wakes in a few seconds. Use full mode during events |
| `lokucaters.com` (no `www`) shows a certificate error | Apex DNS points away from Railway | Point the apex record at Railway at the domain registrar; `www` is unaffected |
| `railway` says no project or no access | CLI logged in to the wrong account | `railway logout`, then `railway login` with the account that owns `loku-caters-v2` |
