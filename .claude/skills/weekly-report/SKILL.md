---
name: weekly-report
description: Generate the weekly per-person progress report for the cinema-ticketing-system team from GitHub (merged PRs, reviews, closed issues, open work, stale issues) into docs/reports/week-NN.md. Use when the user asks for the weekly report, "what did everyone do this week", or prepares the weekly task for the teacher.
argument-hint: "[week number, e.g. 11]"
---

# Weekly report

The report shows facts from GitHub, not opinions. If someone did nothing, the report shows "nothing merged". Don't soften it and don't invent work.

## 1. Date range

Course weeks end on Friday. Week 10 ends 2026-11-06, week 11 on 11-13, week 12 on 11-20, week 13 on 11-27, week 14 on 12-04.
The range is the 7 days ending on that Friday (Saturday → Friday). If no week is given, use the latest week that has started.

## 2. Collect

```bash
gh pr list --state merged --search "merged:<from>..<to>" --limit 200 --json number,title,author,mergedAt,additions,deletions,labels
gh pr list --state open --json number,title,author,createdAt,reviewDecision,isDraft
gh issue list --state closed --search "closed:<from>..<to>" --limit 200 --json number,title,assignees,closedAt
gh issue list --state open --json number,title,assignees,milestone,updatedAt,labels
gh api "repos/{owner}/{repo}/milestones?state=all" --jq '.[] | {title, open_issues, closed_issues, due_on}'
```
Reviews given: for each PR merged in the range, `gh pr view <n> --json reviews`.
Map GitHub logins to names with the "Who owns what" table in `AGENTS.md`.

**Stale issues:** open issues with an assignee whose last update was more than 3 days ago and no linked open PR. Under the 3-day rule in `TEAM.md`, they go back to the pool.

## 3. Write `docs/reports/week-NN.md`

```markdown
# Week NN report (<from> – <to>)

## Summary
Milestone WNN: X/Y issues closed. Deployed: yes/no. Main risk: ...

## Per person
### <Name> (<area>)
- Merged: #12 feat(booking): hold seats (+210/−14), ...
- Reviews: ...
- Open: #20 (in review since <date>)
- Next week: <from their assigned open issues>

## Decisions made this week
- ... (from PR descriptions and schema-decisions.md changes)

## Problems / still unclear
- ...

## Stale issues (3-day rule)
- #NN assigned to X, no activity since <date>
```

Then show the user the file path and a 3-line summary. Don't commit it. The owner decides what goes into the teacher's weekly task.
