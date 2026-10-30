@AGENTS.md

## Claude Code specifics

- Use the project skills for workflow steps instead of improvising: `/start-task <issue>`, `/open-pr`, `/review-pr <pr>`, `/weekly-report`.
- Before writing code, check which area you're in (see "Who owns what"). If the request is outside the user's area, say so and offer to open an issue instead.
- Never run `git push` to `main`, `git push --force`, or `git commit --no-verify`. The project settings block them.
- Ask before creating issues, PRs or comments on GitHub, unless the current skill says to do it.
