# How this team works

Short version: **issue → branch → PR → owner review → merge.** CI blocks everything else.

## Weekly rhythm

| When | What |
|---|---|
| Monday | 15-minute call: everyone picks issues from this week's milestone (`W10` … `W14`) |
| During the week | Work in PRs. Short status in Telegram when something blocks you |
| Daily | The owner reviews open PRs (within about 24 hours) |
| Sunday | Weekly report generated from GitHub: merged PRs, reviews and closed issues per person |

## Rules

- **Your work counts only when it's merged.** The weekly report is generated from GitHub, not from what people say in chat.
- **3-day rule:** an issue assigned to you with no branch or PR after 3 days goes back into the pool, and anyone can take it.
- **Critical path first:** schema, auth, catalog and booking come before anything nice-to-have.
- **Feature freeze in week 13:** after that, only bug fixes and polish get merged.
- **Code is written in the cloned repo** (Claude Code, Claude Desktop's Code tab, or another coding agent), never pasted from a chat window.
- **Accounts and production secrets belong to the owner.** You get access to the dev database only. Never put keys in the repo or in Telegram.

## Timeline

| Week | Goal |
|---|---|
| W10 | Repo, CI, starter app deployed; first migration (schema); auth; catalog read endpoints; frontend shell |
| W11 | Seat map, hold + payment + expiry, seat-hall trigger, phone check, discounts (Task 09 items due 13.11) |
| W12 | Manager panel: CRUD and occupancy/revenue report; my bookings; cancel |
| W13 | **Feature freeze.** Bug fixes, polish, PostHog, stretch goals only if the MVP is solid |
| W14 | Demo data, demo rehearsal (twice), final report |
| W15 | Present |
