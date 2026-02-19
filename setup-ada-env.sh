#!/usr/bin/env bash
# ============================================================
# ADA Dev Environment — Setup Automatico
# Eseguire con Git Bash:  bash setup-ada-env.sh
# ============================================================
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
fail() { echo -e "${RED}[ERRORE]${NC} $1"; }
info() { echo -e "${CYAN}[>]${NC} $1"; }

ERRORS=()

echo ""
echo "============================================"
echo "  ADA Dev Environment — Setup Automatico"
echo "============================================"
echo ""

# ----------------------------------------------------------
# 1. Controlla prerequisiti
# ----------------------------------------------------------
info "Controllo prerequisiti..."
echo ""

# Node.js
if command -v node &>/dev/null; then
  NODE_VER=$(node -v)
  NODE_MAJOR=$(echo "$NODE_VER" | sed 's/v\([0-9]*\).*/\1/')
  if [ "$NODE_MAJOR" -ge 20 ]; then
    ok "Node.js $NODE_VER"
  else
    fail "Node.js $NODE_VER trovato, serve v20+."
    ERRORS+=("Installa Node.js 20+ da https://nodejs.org/")
  fi
else
  fail "Node.js non trovato."
  ERRORS+=("Installa Node.js 20+ da https://nodejs.org/")
fi

# npm
if command -v npm &>/dev/null; then
  ok "npm $(npm -v)"
else
  fail "npm non trovato."
  ERRORS+=("npm dovrebbe venire con Node.js")
fi

# Git
if command -v git &>/dev/null; then
  ok "Git $(git --version | awk '{print $3}')"
else
  fail "Git non trovato."
  ERRORS+=("Installa Git da https://git-scm.com/")
fi

# GitHub CLI
if command -v gh &>/dev/null; then
  ok "GitHub CLI $(gh --version | head -1 | awk '{print $3}')"
  # Controlla autenticazione
  if gh auth status &>/dev/null; then
    ok "GitHub CLI autenticato"
  else
    warn "GitHub CLI installato ma NON autenticato."
    ERRORS+=("Esegui: gh auth login")
  fi
else
  fail "GitHub CLI (gh) non trovato."
  ERRORS+=("Installa gh da https://cli.github.com/")
fi

# Se ci sono errori bloccanti, esci
if [ ${#ERRORS[@]} -gt 0 ]; then
  echo ""
  fail "Prerequisiti mancanti:"
  for e in "${ERRORS[@]}"; do
    echo "   - $e"
  done
  echo ""
  echo "Installa i prerequisiti e rilancia lo script."
  exit 1
fi

echo ""
ok "Tutti i prerequisiti OK!"
echo ""

# ----------------------------------------------------------
# 2. Chiedi dove clonare il repo (o usa quello esistente)
# ----------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Se lo script e' dentro il repo ada, usalo
if [ -f "$SCRIPT_DIR/AGENTS.md" ] && [ -d "$SCRIPT_DIR/frontend" ] && [ -d "$SCRIPT_DIR/backend" ]; then
  REPO_DIR="$SCRIPT_DIR"
  info "Repo ADA trovato in: $REPO_DIR (uso quello esistente)"
else
  read -rp "Dove vuoi clonare il repo? [default: $HOME/ada]: " CLONE_DIR
  CLONE_DIR="${CLONE_DIR:-$HOME/ada}"

  if [ -d "$CLONE_DIR/.git" ]; then
    REPO_DIR="$CLONE_DIR"
    info "Repo gia' presente in $REPO_DIR, skip clone."
  else
    info "Clono il repo in $CLONE_DIR..."
    git clone https://github.com/abupet/ada.git "$CLONE_DIR"
    REPO_DIR="$CLONE_DIR"
    ok "Repo clonato."
  fi
fi

cd "$REPO_DIR"

# ----------------------------------------------------------
# 3. Checkout branch dev
# ----------------------------------------------------------
info "Checkout branch dev..."
git checkout dev 2>/dev/null || git checkout -b dev origin/dev
git pull origin dev
ok "Branch dev aggiornato."

# ----------------------------------------------------------
# 4. Installa dipendenze frontend (root)
# ----------------------------------------------------------
info "Installazione dipendenze frontend..."
npm install
ok "Dipendenze frontend installate."

# ----------------------------------------------------------
# 5. Installa dipendenze backend
# ----------------------------------------------------------
info "Installazione dipendenze backend..."
cd backend
npm install
cd ..
ok "Dipendenze backend installate."

# ----------------------------------------------------------
# 6. Installa browser Playwright
# ----------------------------------------------------------
info "Installazione browser Playwright (puo' richiedere qualche minuto)..."
npx playwright install --with-deps chromium 2>/dev/null || npx playwright install chromium
ok "Playwright browser installati."

# ----------------------------------------------------------
# 7. Installa Claude Code (globale)
# ----------------------------------------------------------
if command -v claude &>/dev/null; then
  ok "Claude Code gia' installato: $(claude --version 2>/dev/null || echo 'ok')"
else
  info "Installazione Claude Code..."
  npm install -g @anthropic-ai/claude-code
  ok "Claude Code installato."
fi

# ----------------------------------------------------------
# 8. Configura CLAUDE.md globale (~/.claude/CLAUDE.md)
# ----------------------------------------------------------
CLAUDE_DIR="$HOME/.claude"
CLAUDE_MD="$CLAUDE_DIR/CLAUDE.md"

if [ -f "$CLAUDE_MD" ]; then
  ok "CLAUDE.md globale gia' presente in $CLAUDE_MD"
else
  info "Creo CLAUDE.md globale..."
  mkdir -p "$CLAUDE_DIR"
  cat > "$CLAUDE_MD" << 'CLAUDEEOF'
# User-Level Instructions (all sessions)

## Autonomous Operation

- Work autonomously without asking for confirmation, except for truly critical/irreversible decisions.
- Critical decisions that DO require confirmation: force-pushing to main/master, deleting branches with unmerged work, dropping databases, actions that affect production systems, merging PRs.
- Everything else should be done without asking: file edits, creating branches, running tests, pushing feature branches, creating PRs, installing dev dependencies, running builds.
- When in doubt, prefer acting over asking.

## "Esegui il prompt" Workflow

- Prompt spec files are in `tmp/`. When asked "esegui il prompt", list files in `tmp/` **excluding** `README.md` and the `archivio/` subdirectory.
- Show the list to the user and ask which file(s) to execute.
- **When the user specifies which spec file(s) to execute**: go all the way through without asking anything. Implement everything, push, create PR to `dev`, merge to `dev` without asking for confirmation, align the local `dev` branch (`git checkout dev && git pull origin dev`), and move the spec file(s) to `tmp/archivio/`. Do NOT stop to ask questions mid-execution.

## ADA Project — Database Connection Strings

- **Neon dev DB**: `postgresql://neondb_owner:npg_SOJ3pHRVkX9r@ep-little-boat-agwp3a99-pooler.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require`
- After merging a PR that includes new SQL migrations, automatically apply them to Neon dev using `psql` with the connection string above.
CLAUDEEOF
  ok "CLAUDE.md globale creato in $CLAUDE_MD"
fi

# ----------------------------------------------------------
# 9. Controlla API key Anthropic
# ----------------------------------------------------------
echo ""
if [ -n "$ANTHROPIC_API_KEY" ]; then
  ok "ANTHROPIC_API_KEY impostata."
else
  warn "ANTHROPIC_API_KEY non trovata nell'ambiente."
  echo ""
  echo "   Per usare Claude Code devi impostare la API key Anthropic."
  echo "   Opzione 1 — variabile d'ambiente temporanea (solo questa sessione):"
  echo "     export ANTHROPIC_API_KEY=sk-ant-..."
  echo ""
  echo "   Opzione 2 — permanente (aggiungi al profilo bash):"
  echo "     echo 'export ANTHROPIC_API_KEY=sk-ant-...' >> ~/.bashrc"
  echo ""
  echo "   In alternativa, Claude Code te la chiedera' al primo avvio."
  echo ""
fi

# ----------------------------------------------------------
# 10. Verifica rapida
# ----------------------------------------------------------
echo ""
info "Verifica finale..."
echo ""

echo "  Repo:          $REPO_DIR"
echo "  Branch:        $(git branch --show-current)"
echo "  Node:          $(node -v)"
echo "  npm:           $(npm -v)"
echo "  Git:           $(git --version | awk '{print $3}')"
echo "  gh:            $(gh --version | head -1 | awk '{print $3}')"
if command -v claude &>/dev/null; then
  echo "  Claude Code:   installato"
else
  echo "  Claude Code:   da verificare (riavvia il terminale)"
fi
echo "  CLAUDE.md:     $CLAUDE_MD"
echo ""

# ----------------------------------------------------------
# Riepilogo comandi utili
# ----------------------------------------------------------
# === Web Push (VAPID) ===
export VAPID_PUBLIC_KEY="BCkihEr83KqmCi90QwcP0jx5jVptUWf5X_T2-MgjOeYz9yITiubobfQfuRx47o_Zgle2TBwq9WInCbKfpA6YvKU"
export VAPID_PRIVATE_KEY="MDNgVwaN97IlOnahW_vqJYKBGKs6A_mWV78vIcCbCS0"
export VAPID_SUBJECT="mailto:support@ada-vet.app"

echo "============================================"
echo "  Setup completato!"
echo "============================================"
echo ""
echo "  Comandi utili:"
echo ""
echo "  # Avvia Claude Code"
echo "  cd $REPO_DIR && claude"
echo ""
echo "  # Avvia frontend (terminal 1)"
echo "  npm run serve"
echo ""
echo "  # Avvia backend mock (terminal 2)"
echo "  MODE=MOCK node backend/src/server.js"
echo ""
echo "  # Esegui test smoke"
echo "  npx playwright test --grep \"@smoke\""
echo ""
echo "============================================"
