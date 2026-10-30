Closes #

## What and why

<!-- What changes for the user or the system, and why. 2–5 sentences. -->

## How to check it

<!-- Exact steps for the reviewer: endpoint + request, page + clicks, or test names. -->

## Checklist

- [ ] Everything I changed is inside my area (see `AGENTS.md`)
- [ ] Backend: every new or changed endpoint has a success test **and** a failure test
- [ ] Backend: `backend/openapi.json` is regenerated if the API changed
- [ ] Database: migration matches `docs/schema-decisions.md` and has a working downgrade
- [ ] No secrets, `.env` files, debug prints or commented-out code
- [ ] UI change: ran `/impeccable` (audit or polish) on the changed screens

<!-- Untick boxes that don't apply only if they truly don't apply. The owner checks. -->
