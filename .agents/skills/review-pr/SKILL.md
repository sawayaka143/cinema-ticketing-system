---
name: review-pr
description: Review a pull request in the cinema-ticketing-system repo against AGENTS.md, the schema decisions and the testing rule, and draft review comments. Use when the user says "review PR 14", "check this PR", or before approving anything. Teammates can also run it on their own PR before asking for review.
argument-hint: "<pr number>"
---

# Review a pull request

This skill **drafts** a review. It never approves, requests changes or comments on GitHub unless the user explicitly says to post it.

## 1. Load it

```bash
gh pr view <n> --json number,title,author,body,headRefName,baseRefName,additions,deletions,files,labels,milestone,reviews,statusCheckRollup
gh pr diff <n>
```
Also read the linked issue (`Closes #x`) for the acceptance criteria.

## 2. Check, in this order

**Process**
- Is CI green? If not, the review is just "fix CI first" plus the failing check names.
- Do the title, branch name and linked issue follow `AGENTS.md`?
- Is every touched file inside the author's area? Flag anything outside it, especially `frontend/`, `.github/`, `.claude/` and migrations.

**Correctness**
- Does it meet every acceptance criterion of the issue? Go through them one by one.
- Backend: are there at least one success test and one failure test per new or changed endpoint? Do the tests actually assert the behaviour, or just call the endpoint?
- Database: does every migration match `docs/schema-decisions.md`? Is there a working `downgrade()`? Are constraints done in the database, not only in Python?
- Booking/payment code: is everything in a transaction? Are double booking, expired holds and someone else's booking handled? Is a taken seat a 409?
- Security: does every endpoint check the logged-in user and role? Can a customer see another customer's data? Are there secrets in the diff?
- API contract: if endpoints changed, are `backend/openapi.json` (and `frontend/src/api/schema.d.ts`) regenerated?

**Quality**
- Is it readable? Look for dead code, debug prints, copy-paste, and magic numbers that belong in config.
- Is the scope tight? Flag unrelated changes and suggest a separate issue for them.

## 3. Output

Give the user:
1. **Verdict:** approve / request changes / comment, with one sentence why.
2. **Blocking issues:** file:line, what's wrong, what to do. Only real problems.
3. **Non-blocking suggestions:** short list, or none.

If the user says to post it:
```bash
gh pr review <n> --request-changes --body-file <file>   # or --approve / --comment
```
