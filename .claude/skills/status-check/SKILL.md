---
name: status-check
description: Generate the teacher's weekly status check for the cinema-ticketing-system team into docs/status-checks/week-NN.md — project stage and status, team report, one individual report per member with GitHub evidence, one measurable next task per member, and the "Ready?" checklist — and refresh docs/status-checks/final-defence.md. Use when the user asks for the weekly report or status check, "what did everyone do this week", or prepares for the practical lesson.
argument-hint: "[week number, e.g. 11]"
---

# Weekly status check

The format comes from the teacher: see [`docs/status-checks/README.md`](../../../docs/status-checks/README.md).
**A promise is not progress.** Every claim needs evidence (a merged PR, a commit, a file, a live URL). If someone did nothing, write "No evidence". Don't soften it and don't invent work.

## 1. Date range

Course weeks end on Friday. Week 10 ends 2026-11-06, week 11 on 11-13, week 12 on 11-20, week 13 on 11-27, week 14 on 12-04.
The range is the 7 days ending on that Friday (Saturday → Friday). If no week is given, use the latest week that has started.
The practical lesson is on that Friday, so "next tasks" are due the following Friday.

## 2. Collect facts from GitHub

```bash
gh pr list --state merged --search "merged:<from>..<to>" --limit 200 --json number,title,author,mergedAt,additions,deletions
gh pr list --state open --json number,title,author,createdAt,reviewDecision,isDraft
gh issue list --state closed --search "closed:<from>..<to>" --limit 200 --json number,title,assignees,closedAt
gh issue list --state open --json number,title,assignees,milestone,updatedAt,labels
gh api "repos/{owner}/{repo}/milestones?state=all" --jq '.[] | {title, open_issues, closed_issues, due_on}'
gh api "repos/{owner}/{repo}/collaborators" --jq '.[].login'
gh api "repos/{owner}/{repo}/invitations" --jq '.[] | {login: .invitee.login, created_at}'
```
- Reviews given: for each PR merged in the range, `gh pr view <n> --json reviews`.
- Map logins to names with "Who owns what" in `AGENTS.md`.
- **Stale issues:** assigned, open, no update for more than 3 days and no open PR. Under the 3-day rule in `TEAM.md` they go back to the pool.
- Read the previous `week-NN.md` to fill "What changed since the last check" and to check last week's tasks: done (with evidence) or not done.

Ask the user only for what GitHub can't show: work done outside GitHub (with a link or file as evidence), each person's current difficulty, and team decisions.

## 3. Decide stage and status

Pick **one stage** from the README table (Planning, Started, Technical foundation exists, Working system, Finished) and justify it with what works today.
Pick **one status**:
- **On Track:** show evidence, owner, deadline, next action.
- **At Risk:** show cause, impact, response, person responsible.
- **Blocked:** show the exact blocker, escalation action, owner, recovery date.

## 4. Write `docs/status-checks/week-NN.md`

```markdown
# Week NN status check (<from> – <to>)

## Team report
| | |
|---|---|
| Stage | ... (one line why) |
| Status | ... |
| Milestone WNN | X/Y issues closed |
| Main process | which steps of movie → screening → seats → hold → pay → tickets work end to end |

**What changed since the last check:** ...
**Demo:** what we show and where (URL, endpoint, file).
**Current difficulty and team decision:** ...
**Status details:** cause / impact / response / owner (or the matching fields for the status).
**Next team milestone:** WNN+1 — goal and due date.

## Individual reports
### <Name> (@login) — <responsibility>
- **Completed this week:** #12 feat(booking): hold seats (+210/−14), ... or "No evidence"
- **Evidence:** PR/commit/file/URL links
- **Last week's task:** done / not done
- **Difficulty:** ...
- **Next task (due <date>):** #NN — <checkable result>

## Next tasks
| Who | Task | Deadline | How we check it |
|---|---|---|---|

## Stale issues (3-day rule)

## Ready? (check before class)
- [ ] We can show a new result, not only talk about it
- [ ] Every member has evidence or is honestly marked "No evidence"
- [ ] Every member has one measurable task with an owner, deadline and checkable result
```

Every member gets a next task with a GitHub issue. If the issue doesn't exist yet, list it and offer to create it (ask first).

## 5. Refresh `docs/status-checks/final-defence.md`

Update the answers that changed this week (what works now, what was tested, who contributed what). Keep each answer short and backed by evidence.

## 6. Finish

Show the user the file paths and a 3-line summary. Don't commit on your own: the owner decides what goes to the teacher.
To commit, use the normal flow (issue → `docs/<n>-week-NN-status` branch → `/open-pr`).
