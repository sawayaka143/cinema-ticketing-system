# Owner setup (one time, this weekend)

Order matters: the repo and CI exist **before** anyone is invited.

## 1. GitHub repo

```bash
git init -b main
git add -A
git commit -m "chore: project setup"
gh repo create cinema-ticketing-system --public --source . --push
```

Then apply the rules, labels, milestones and the `production` environment:

```bash
bash scripts/setup-github.sh
```

Check it in **Settings → Rules → Rulesets → main**: PR required, squash only, 4 required checks
(`PR rules`, `Owner approval`, `Backend`, `Frontend`), no bypass.

## 2. Supabase (two free projects)

1. Create `cinema-prod` and `cinema-dev` (region: closest to users, e.g. Frankfurt). Save both database passwords in your password manager.
2. In each: **Database → Extensions** → enable `btree_gist` and `pg_cron`.
3. Copy for each project:
   - **Project URL**: `https://<ref>.supabase.co`
   - **Publishable (anon) key**: safe in the browser. RLS with no policies blocks all table access through it.
   - **Connection strings** (Connect button):
     - *Transaction pooler* (port **6543**), used by the backend on Vercel → `DATABASE_URL`
     - *Session pooler* (port **5432**), used by migrations from GitHub Actions → `PROD_MIGRATION_DATABASE_URL`
       (GitHub runners are IPv4-only; the "direct" connection is IPv6-only.)
   - Use the `postgresql+psycopg://` prefix instead of `postgresql://` for the backend and migrations.
4. Teammates get **only `cinema-dev`** connection strings, sent privately.

## 3. Vercel (two projects from the same repo)

Import the GitHub repo twice (**Add New → Project**):

| Project | Root Directory | Framework | Environment variables |
|---|---|---|---|
| `cinema-api` | `backend` | FastAPI (auto) | Production: `DATABASE_URL` (prod, transaction pooler), `SUPABASE_URL` (prod), `APP_ENV=production`, `CORS_ORIGINS=https://<frontend>.vercel.app` · Preview: the same with **dev** values, `CORS_ORIGINS=*` |
| `cinema-web` | `frontend` | Vite (auto) | Production: `VITE_API_URL=https://<cinema-api>.vercel.app`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (prod) · Preview: the same API URL, dev Supabase values |

Preview frontends talk to the **production** API (it's the only stable URL). Before the week-14 demo, production data gets reset and seeded with demo data.

Then, for the GitHub Action deploy:
1. **Account Settings → Tokens** → create a token → `VERCEL_TOKEN`.
2. Each project's **Settings → General**: copy the Project ID. Team/Account ID → `VERCEL_ORG_ID`.

Both apps' `vercel.json` switch off Vercel's own production builds from `main`, so production is deployed only by `.github/workflows/deploy.yml`
(migrate → backend → frontend). PR previews still come from Vercel.

## 4. GitHub secrets (environment `production`)

**Settings → Environments → production → Add secret**:

| Secret | Value |
|---|---|
| `PROD_MIGRATION_DATABASE_URL` | prod session pooler URL (`postgresql+psycopg://…:5432/postgres`) |
| `VERCEL_TOKEN` | from step 3 |
| `VERCEL_ORG_ID` | from step 3 |
| `VERCEL_BACKEND_PROJECT_ID` | `cinema-api` project id |
| `VERCEL_FRONTEND_PROJECT_ID` | `cinema-web` project id |

Repository secrets (**Settings → Secrets → Actions**), whenever you get to it:

| Secret | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | from @BotFather (`/newbot`), then add the bot to the group |
| `TELEGRAM_CHAT_ID` | group id: send a message in the group, open `https://api.telegram.org/bot<token>/getUpdates`, copy `chat.id` (starts with `-100`) |

## 5. Test the whole pipeline before inviting anyone

1. `git switch -c chore/1-pipeline-check`, change a line in `README.md`, then open a PR (create issue #1 first).
2. All 4 checks go green, the Vercel previews appear, you merge.
3. The **Deploy** workflow runs: migrate → backend → frontend. Open both production URLs; `GET /api/health` returns `{"status":"ok"}`.

## 6. Invite the team (Monday)

```bash
bash scripts/setup-github.sh <login1> <login2> <login3> <login4>
```
Fill in their logins in the "Who owns what" table in `AGENTS.md` (via a PR, of course), and post `TEAM.md` in Telegram.
