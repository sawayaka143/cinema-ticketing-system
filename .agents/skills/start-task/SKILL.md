---
name: start-task
description: Start work on a GitHub issue in the cinema-ticketing-system repo — checks the issue, updates main, creates a correctly named branch, and assigns the issue. Use when the user says "start issue 12", "pick up a task", "what should I work on", or begins any new piece of work.
argument-hint: "[issue number]"
---

# Start a task

Follow these steps in order. Stop and tell the user if any check fails. Don't try to work around it.

## 1. Pick the issue

- If the user gave an issue number, read it: `gh issue view <n> --json number,title,body,labels,assignees,milestone,state`.
- If not, list open issues assigned to them in the current milestone:
  `gh issue list --assignee @me --state open --json number,title,milestone,labels`.
  If none, list unassigned issues in the current milestone and let the user choose. **Don't pick one for them.**
- Refuse to start if:
  - the issue is closed;
  - the issue has no acceptance criteria (ask the user to get them from Zhakhongir or the owner first);
  - the issue is in someone else's area (see "Who owns what" in `AGENTS.md`), e.g. a non-owner picking a `area:frontend` issue.

## 2. Clean, current main

```bash
git status --porcelain        # must be empty; otherwise ask the user to commit or stash first
git switch main
git pull --ff-only origin main
```

## 3. Create the branch

Name: `<type>/<issue-number>-<slug>`.
- `type` comes from the issue: `feat` (new behaviour), `fix` (bug), `test`, `docs`, `refactor`, `chore`.
- `slug`: 2–5 lowercase words from the title, joined by hyphens, ASCII only.

```bash
git switch -c feat/12-seat-map
```

## 4. Claim it

```bash
gh issue edit <n> --add-assignee @me
```

## 5. Plan before coding

Summarise for the user:
- what the acceptance criteria require;
- which files you expect to change (all must be inside the user's area);
- which tests you'll add (backend: at least one success and one failure test per endpoint);
- whether the change will stay **under 500 changed lines**. If it won't, propose how to split it into several issues **now**.

Then start the work. When it's done, use the `open-pr` skill.
