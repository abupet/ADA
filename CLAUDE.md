# Claude Code - Project Instructions

## AGENTS.md is the source of truth (ALWAYS read it first)

Before starting any work, **read `AGENTS.md`** and follow all its rules.
Key mandatory rules:
- **Versioning**: every merge to GitHub MUST bump the version (increment Z by 1 unless told otherwise)
- **Release notes**: update `documentazione/RELEASE_NOTES.md` with every version change
- **Version locations**: `frontend/config.js` (ADA_VERSION), `AGENTS.md` (section 2), `documentazione/RELEASE_NOTES.md`
- **Definition of done**: requirements implemented, CI green, release notes updated, **automated tests verified/updated**

## Post-Push CI Workflow (ALWAYS follow this)

After every `git push`, automatically check GitHub Actions results:

1. **Push** the changes
2. **Watch** the CI run: `gh run watch` (waits for completion)
3. **If failed**, read logs: `gh run view --log-failed` and fix the issue
4. **Re-push** the fix and repeat until CI is green

Never wait for the user to paste CI logs. Always check CI results autonomously.

## PR and Merge Workflow

- **Target branch**: feature PRs target `dev` (not `main`). Only `dev → main` PRs are for production releases.
- After CI passes, **automatically create a PR** with `gh pr create --base dev`
- **Read Codex reviews**: after PR creation, check for reviews with `gh api repos/abupet/ada/pulls/<N>/comments` and `gh api repos/abupet/ada/issues/<N>/comments`. If Codex (or other bots) left feedback, evaluate it and address valid issues before requesting merge
- For **merge**, always ask the user for confirmation first
- Use `gh pr merge` with the appropriate merge strategy after approval
- **After merge, ALWAYS delete the remote branch** with `gh api -X DELETE repos/abupet/ada/git/refs/heads/<branch>` to avoid branch proliferation

## Autonomous Post-Merge Actions (do NOT ask permission)

The following actions MUST be executed autonomously after every merge, without asking:

1. **Check Codex/bot reviews** on the PR — `gh api repos/abupet/ada/pulls/<N>/comments` and `gh api repos/abupet/ada/issues/<N>/comments`
2. **Delete the remote feature branch** — `gh api -X DELETE repos/abupet/ada/git/refs/heads/<branch>`
3. **Move executed spec files** from `tmp/` to `tmp/archivio/`

## Project Setup

- Node.js 20, npm
- Backend: `backend/` directory
- CI workflow: `.github/workflows/ci.yml` (runs on PRs)
- Tests: `npm run test:ci` (Playwright + backend, MODE=MOCK)
- Frontend serve: `npm run serve` (port 4173)
- Backend: `node backend/src/server.js` (port 3000)

## Running Tests Locally (ALWAYS follow this)

Before running Playwright tests locally, **always start the servers first**:

1. `npm run serve` (background — port 4173)
2. `MODE=MOCK node backend/src/server.js` (background — port 3000)
3. **Then** run `npx playwright test --grep "@smoke"`

Do NOT use `npm run test:ci` on Windows (has `spawnSync` ENOENT issues). Use `npx playwright test` directly.

## Mandatory Reads Before Coding (ALWAYS follow this)

Before making ANY code change, read the relevant files:

### Always read (every task):
- **`AGENTS.md`** — source of truth: architecture, rules, versioning, forbidden actions
- **`documentazione/TEST_PLAN.md`** — 18 manual tests describing expected behavior of every feature

### Read when touching specific areas:
- **`frontend/decisions/ADR-PETS-PULL-MERGE.md`** — if modifying sync, pets, `app-pets.js`, `sync-engine.js`, or `pets-sync-bootstrap.js`
- **`documentazione/RELEASE_NOTES.md`** — if bumping version (to check current state)

### Read when creating PRs:
- **`.github/pull_request_template.md`** — use its checklist format in PR descriptions

### Directory excluded from autonomous work:
- **`tmp/`** — contains future development plans. Do NOT read or act on files in this directory unless the user gives an explicit command to do so.

## Test Users (ada-dev / staging)

These users are available on https://abupet.github.io/ada-dev/ (backend: Render staging).

| Email | Password | Role |
|---|---|---|
| `vet_test@adiuvet.it` | `AltriUtentiPerTest72&` | vet |
| `owner_test@adiuvet.it` | `AltriUtentiPerTest72&` | owner |
| `super_admin_test@adiuvet.it` | `AltriUtentiPerTest72&` | super_admin |
| `admin_brand_test@adiuvet.it` | `AltriUtentiPerTest72&` | admin_brand |

## Prompt Specifications Workflow

- **Prompt specs location**: specification files (prompts) are stored in `tmp/`. The `README.md` in that directory is excluded from this workflow.
- **When the user says "esegui il prompt"** (or similar): list the files in `tmp/` (excluding `README.md` and the `archivio/` subdirectory), show them to the user, and ask for confirmation on which file(s) to execute.
- **After a PR is successfully merged into `dev`**: move the executed prompt spec file(s) to `tmp/archivio/` to keep `tmp/` clean.
