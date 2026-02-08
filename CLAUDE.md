# Claude Code - Project Instructions

## Post-Push CI Workflow (ALWAYS follow this)

After every `git push`, automatically check GitHub Actions results:

1. **Push** the changes
2. **Watch** the CI run: `gh run watch` (waits for completion)
3. **If failed**, read logs: `gh run view --log-failed` and fix the issue
4. **Re-push** the fix and repeat until CI is green

Never wait for the user to paste CI logs. Always check CI results autonomously.

## PR and Merge Workflow

- After CI passes, **automatically create a PR** with `gh pr create`
- For **merge**, always ask the user for confirmation first
- Use `gh pr merge` with the appropriate merge strategy after approval

## Project Setup

- Node.js 20, npm
- Backend: `backend/` directory
- CI workflow: `.github/workflows/ci.yml` (runs on PRs)
- Tests: `npm run test:ci` (Playwright + backend, MODE=MOCK)
- Frontend serve: `npm run serve` (port 4173)
- Backend: `node backend/src/server.js` (port 3000)
