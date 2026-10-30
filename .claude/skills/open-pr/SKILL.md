---
name: open-pr
description: Open a pull request in the cinema-ticketing-system repo the way CI and the owner expect — rebase on main, run the checks, regenerate the API contract, run Impeccable for UI changes, fill the PR template, request the owner's review. Use whenever work on a branch is ready for review, or the user says "open a PR", "push this", "submit", "I'm done".
---

# Open a pull request

CI rejects PRs that skip these steps, so don't skip any. If a step fails, fix the problem or stop and tell the user.

## 1. Preflight

```bash
git branch --show-current
```
- It must **not** be `main`. If it is, stop.
- It must match `^(feat|fix|chore|docs|refactor|test)/[0-9]+-[a-z0-9-]+$`. If it doesn't, rename it: `git branch -m <new-name>`.
- Get the issue number from the branch name.

## 2. Update from main

```bash
git fetch origin
git rebase origin/main
```
On conflicts in files outside the user's area, stop and ask. Don't guess someone else's code.

## 3. Run the checks for every area you touched

Backend (`backend/` changed). Run from `backend/`:
```bash
ruff check . && ruff format --check .
pytest -q
python -m app.export_openapi   # rewrites openapi.json; commit it if it changed
```
- Every new or changed endpoint needs at least **one success test and one failure test**. If one is missing, write it now.

Frontend (`frontend/` changed). Run from `frontend/`:
```bash
npm run gen:api   # only if backend/openapi.json changed
npm run lint && npm run typecheck && npm run build
```
- **UI change?** Run the `impeccable` skill on the changed screens (`/impeccable audit <target>`, then fix what it finds, or `/impeccable polish <target>`).
  Only after that may you tick the Impeccable box in the PR body.

## 4. Size check

```bash
git diff --shortstat origin/main...HEAD -- . ':!**/package-lock.json' ':!**/openapi.json' ':!**/schema.d.ts'
```
More than **500** changed lines (insertions + deletions)? Stop and propose a split. Only the owner can apply the `size-ok` label.

## 5. Commit and push

- Don't commit `.env`, `node_modules`, `.venv`, `dist` or debug output. Check with `git status`.
```bash
git push -u origin HEAD
```
Never `--force` a branch someone has already reviewed. If you rebased after review, use `git push --force-with-lease` and say so in a PR comment.

## 6. Create the PR

- **Title:** Conventional Commit, e.g. `feat(booking): hold seats for 10 minutes`, max ~70 chars.
  Scopes: `frontend`, `backend`, `db`, `auth`, `catalog`, `booking`, `payment`, `report`, `ci`, `docs`.
- **Body:** fill in every section of `.github/pull_request_template.md`. Keep `Closes #<issue>`.
  Write "Why", not just "What". List exactly how the owner can check it (URL, request, steps).
- Add the milestone of the issue and an `area:*` label.

```bash
gh pr create --base main --title "<title>" --body-file <filled-template-file> \
  --assignee @me --reviewer sawayaka143 --milestone "<W1x>" --label "area:backend"
```
(Skip `--reviewer` if the user **is** sawayaka143.)

## 7. After opening

```bash
gh pr checks --watch
```
If a check fails, read its log (`gh run view --log-failed`), fix it, and push again. Tell the user the PR URL and the check status.
While waiting for review, the user should start the next issue on a **new** branch from `main`.
