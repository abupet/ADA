# Claude Code - Project Instructions

## AGENTS.md is the source of truth (ALWAYS read it first)

Before starting any work, **read `AGENTS.md`** and follow all its rules.
Key mandatory rules:
- **Versioning**: every merge to GitHub MUST bump the version (increment Z by 1 unless told otherwise)
- **Release notes**: update `RELEASE_NOTES.md` with every version change
- **Version locations**: `docs/config.js` (ADA_VERSION), `AGENTS.md` (section 2), `RELEASE_NOTES.md`
- **Definition of done**: requirements implemented, CI green, release notes updated

## Post-Push CI Workflow (ALWAYS follow this)

After every `git push`, automatically check GitHub Actions results:

1. **Push** the changes
2. **Watch** the CI run: `gh run watch` (waits for completion)
3. **If failed**, read logs: `gh run view --log-failed` and fix the issue
4. **Re-push** the fix and repeat until CI is green

Never wait for the user to paste CI logs. Always check CI results autonomously.

## PR and Merge Workflow

- After CI passes, **automatically create a PR** with `gh pr create`
- **Read Codex reviews**: after PR creation, check for reviews with `gh api repos/abupet/ada/pulls/<N>/comments` and `gh api repos/abupet/ada/issues/<N>/comments`. If Codex (or other bots) left feedback, evaluate it and address valid issues before requesting merge
- For **merge**, always ask the user for confirmation first
- Use `gh pr merge` with the appropriate merge strategy after approval
- **After merge, ALWAYS delete the remote branch** with `gh api -X DELETE repos/abupet/ada/git/refs/heads/<branch>` to avoid branch proliferation

## Project Setup

- Node.js 20, npm
- Backend: `backend/` directory
- CI workflow: `.github/workflows/ci.yml` (runs on PRs)
- Tests: `npm run test:ci` (Playwright + backend, MODE=MOCK)
- Frontend serve: `npm run serve` (port 4173)
- Backend: `node backend/src/server.js` (port 3000)
