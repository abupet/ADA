#!/usr/bin/env bash
# ada-tests.sh v5
#
# Location: ./ada/tests/ada-tests.sh
#
# Secrets: read from ./ada/.env (dotenv format, NOT committed)
#
# Logs: ./ada/test-results/ada-tests-XXX/ada-tests-<timestamp>.log
#   - All detailed output goes to the log file
#   - Terminal shows only PASS/FAIL summary + log path on failure
#
# Run:
#   bash ./ada/tests/ada-tests.sh                 # interactive menu
#   bash ./ada/tests/ada-tests.sh smoke           # direct command
#   MODE=REAL STRICT_ON=1 bash ./ada/tests/ada-tests.sh smoke
#
set -euo pipefail

# ---------------------- Defaults ----------------------
DEFAULT_LOCAL_PORT="4173"
DEFAULT_BACKEND_PORT="3000"
DEFAULT_DEPLOY_URL="https://abupet.github.io/ada/"
DEFAULT_STRICT_ALLOW_HOSTS="cdnjs.cloudflare.com"
# ------------------------------------------------------

# Script is inside repo: <repo>/tests
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR_DEFAULT="$(cd "$SCRIPT_DIR/.." && pwd)"

REPO_DIR="${REPO_DIR:-"$REPO_DIR_DEFAULT"}"

# -------------------- Load .env from repo root --------------------
ENV_FILE="$REPO_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
  # Parse .env: skip comments and empty lines, export vars
  while IFS='=' read -r key value; do
    # Skip comments and empty
    [[ -z "$key" || "$key" == \#* ]] && continue
    # Trim whitespace
    key="$(echo "$key" | xargs)"
    # Remove surrounding quotes from value
    value="$(echo "$value" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
    # Only export if not already set (env takes precedence)
    if [[ -z "${!key:-}" ]]; then
      export "$key=$value"
    fi
  done < "$ENV_FILE"
else
  echo "⚠️  File .env non trovato: $ENV_FILE"
  echo "   Crea ada/.env con almeno: ADA_TEST_PASSWORD=... e DATABASE_URL=..."
fi
# ------------------------------------------------------------------

PORT="${PORT:-$DEFAULT_LOCAL_PORT}"
BACKEND_PORT="${BACKEND_PORT:-$DEFAULT_BACKEND_PORT}"
LOCAL_URL="${LOCAL_URL:-"http://localhost:${PORT}/index.html"}"
BACKEND_URL="http://localhost:${BACKEND_PORT}"
DEPLOY_URL="${DEPLOY_URL:-$DEFAULT_DEPLOY_URL}"

# ---------------------- UI colors ----------------------
CLR_RESET=$'\e[0m'
CLR_RED=$'\e[31m'
CLR_GREEN=$'\e[32m'
CLR_YELLOW=$'\e[33m'
CLR_CYAN=$'\e[36m'
CLR_DIM=$'\e[2m'
CLR_BOLD=$'\e[1m'

say()  { echo -e "${CLR_CYAN}👉${CLR_RESET} $*"; }
warn() { echo -e "${CLR_YELLOW}⚠️${CLR_RESET} $*"; }
die()  { echo -e "${CLR_RED}❌ $*${CLR_RESET}" >&2; exit 1; }
# -------------------------------------------------------

if [[ ! -d "$REPO_DIR" ]]; then
  die "Repo dir not found: $REPO_DIR"
fi
cd "$REPO_DIR"

have_cmd() { command -v "$1" >/dev/null 2>&1; }

need_password() {
  if [[ -z "${ADA_TEST_PASSWORD:-}" && -z "${TEST_PASSWORD:-}" ]]; then
    die "Missing ADA_TEST_PASSWORD. Impostala in ada/.env"
  fi
}

# ---------------------- Session management ----------------------
TEST_RESULTS_BASE="$REPO_DIR/test-results"
mkdir -p "$TEST_RESULTS_BASE"

init_session() {
  # Find highest existing session number
  local last_num=-1
  local d
  for d in "$TEST_RESULTS_BASE"/ada-tests-[0-9][0-9][0-9]; do
    if [[ -d "$d" ]]; then
      local num
      num="$(basename "$d" | grep -oP '\d{3}$' || true)"
      if [[ -n "$num" ]] && (( 10#$num > last_num )); then
        last_num=$((10#$num))
      fi
    fi
  done

  local next_num=$(( last_num + 1 ))
  SESSION_NUM="$(printf "%03d" "$next_num")"
  SESSION_DIR="$TEST_RESULTS_BASE/ada-tests-${SESSION_NUM}"
  mkdir -p "$SESSION_DIR"

  SESSION_LOG="$SESSION_DIR/ada-tests-$(date +%Y%m%d_%H%M%S).log"
  touch "$SESSION_LOG"
  echo "[$(date +"%Y-%m-%d %H:%M:%S")] Session ada-tests-${SESSION_NUM} started" >> "$SESSION_LOG"
}

# Initialize first session
init_session

# Convert path to Windows-style for display
to_win_path() {
  local p="$1"
  if have_cmd cygpath; then
    cygpath -w "$p"
  else
    # WSL/Git Bash: try manual conversion
    echo "$p" | sed 's|^/c/|C:\\|; s|^/mnt/c/|C:\\|; s|/|\\|g'
  fi
}

SESSION_LOG_WIN="$(to_win_path "$SESSION_LOG")"
# ----------------------------------------------------------------

# ---------------------- Runtime toggles ----------------------
MODE="${MODE:-MOCK}"
STRICT_ON="${STRICT_ON:-0}"
STRICT_ALLOW_HOSTS_RUNTIME="${STRICT_ALLOW_HOSTS:-$DEFAULT_STRICT_ALLOW_HOSTS}"

mode_label() {
  if [[ "${MODE^^}" == "REAL" ]]; then echo "REAL"; else echo "MOCK"; fi
}

strict_label() {
  if [[ "${STRICT_ON}" == "1" ]]; then echo "ON"; else echo "OFF"; fi
}
# -------------------------------------------------------------

# Build env assignments for playwright
build_envs() {
  local base_url="${1:-}"
  local deployed="${2:-0}"
  local -a envs=()

  [[ -n "$base_url" ]] && envs+=("BASE_URL=$base_url")

  if [[ "${MODE^^}" == "REAL" ]]; then
    envs+=("ALLOW_OPENAI=1")
  fi

  if [[ "$deployed" == "1" ]]; then
    envs+=("DEPLOYED=1" "DEPLOY_URL=$DEPLOY_URL")
  fi

  if [[ "${STRICT_ON}" == "1" ]]; then
    envs+=("STRICT_NETWORK=1" "STRICT_ALLOW_HOSTS=$STRICT_ALLOW_HOSTS_RUNTIME")
  fi

  printf '%s\n' "${envs[@]}"
}

# ---------------------- Server checks ----------------------
server_is_up() {
  if have_cmd curl; then
    curl -fsS "$LOCAL_URL" >/dev/null 2>&1
    return $?
  fi
  if have_cmd powershell.exe; then
    powershell.exe -NoProfile -Command \
      "try { (Invoke-WebRequest -UseBasicParsing '$LOCAL_URL').StatusCode -eq 200 } catch { exit 1 }" \
      >/dev/null 2>&1
    return $?
  fi
  return 1
}

port_is_listening() {
  if have_cmd powershell.exe; then
    powershell.exe -NoProfile -Command \
      "try { \$p=$PORT; \$c=Get-NetTCPConnection -LocalPort \$p -State Listen -ErrorAction SilentlyContinue; if(\$c){ exit 0 } else { exit 1 } } catch { exit 1 }" \
      >/dev/null 2>&1
    return $?
  fi
  if have_cmd cmd.exe; then
    cmd.exe /c "netstat -ano | findstr /R /C:\":$PORT .*LISTENING\"" >/dev/null 2>&1
    return $?
  fi
  return 1
}

start_server_new_terminal() {
  local repo_win
  repo_win="$(cd "$REPO_DIR" && pwd -W 2>/dev/null || true)"
  if [[ -z "$repo_win" ]]; then repo_win="$REPO_DIR"; fi
  repo_win="${repo_win//$'\r'/}"

  echo "[$(date +"%Y-%m-%d %H:%M:%S")] Starting frontend server in new terminal" >> "$SESSION_LOG"

  if have_cmd powershell.exe; then
    powershell.exe -NoProfile -Command \
      "Start-Process -FilePath 'cmd.exe' -WorkingDirectory '$repo_win' -ArgumentList '/k','npm run serve' -WindowStyle Normal" \
      >/dev/null 2>&1
    return 0
  fi

  cmd.exe /c start "ADA server" cmd.exe /k "cd /d \"$repo_win\" && npm run serve"
}

wait_for_server() {
  local max_seconds="${1:-25}"
  local i=0
  echo "[$(date +"%Y-%m-%d %H:%M:%S")] Waiting for frontend on $LOCAL_URL (max ${max_seconds}s)" >> "$SESSION_LOG"
  while (( i < max_seconds )); do
    if server_is_up; then
      echo "[$(date +"%Y-%m-%d %H:%M:%S")] Frontend OK" >> "$SESSION_LOG"
      say "Server OK: $LOCAL_URL"
      return 0
    fi
    sleep 1
    ((i++))
  done
  echo "[$(date +"%Y-%m-%d %H:%M:%S")] Frontend TIMEOUT after ${max_seconds}s" >> "$SESSION_LOG"
  warn "Server non raggiungibile dopo ${max_seconds}s: $LOCAL_URL"
  return 1
}

ensure_server_running() {
  if server_is_up; then
    say "Server già attivo: $LOCAL_URL"
    return 0
  fi
  if port_is_listening; then
    warn "Porta $PORT in ascolto ma $LOCAL_URL non risponde."
    return 1
  fi
  start_server_new_terminal
  wait_for_server 25
}

backend_is_up() {
  if have_cmd curl; then
    curl -fsS "$BACKEND_URL/api/health" >/dev/null 2>&1
    return $?
  fi
  if have_cmd powershell.exe; then
    powershell.exe -NoProfile -Command \
      "try { (Invoke-WebRequest -UseBasicParsing '$BACKEND_URL/api/health').StatusCode -eq 200 } catch { exit 1 }" \
      >/dev/null 2>&1
    return $?
  fi
  return 1
}

start_backend_new_terminal() {
  local repo_win
  repo_win="$(cd "$REPO_DIR" && pwd -W 2>/dev/null || true)"
  if [[ -z "$repo_win" ]]; then repo_win="$REPO_DIR"; fi
  repo_win="${repo_win//$'\r'/}"

  echo "[$(date +"%Y-%m-%d %H:%M:%S")] Starting backend in new terminal" >> "$SESSION_LOG"

  if have_cmd powershell.exe; then
    powershell.exe -NoProfile -Command \
      "Start-Process -FilePath 'cmd.exe' -WorkingDirectory '$repo_win' -ArgumentList '/k','set MODE=${MODE}&&set FRONTEND_ORIGIN=http://localhost:${PORT}&&set RATE_LIMIT_PER_MIN=600&&node backend/src/server.js' -WindowStyle Normal" \
      >/dev/null 2>&1
    return 0
  fi

  cmd.exe /c start "ADA backend" cmd.exe /k "cd /d \"$repo_win\" && set MODE=${MODE}&& set FRONTEND_ORIGIN=http://localhost:${PORT}&& set RATE_LIMIT_PER_MIN=600&& node backend/src/server.js"
}

wait_for_backend() {
  local max_seconds="${1:-30}"
  local i=0
  echo "[$(date +"%Y-%m-%d %H:%M:%S")] Waiting for backend on $BACKEND_URL/api/health (max ${max_seconds}s)" >> "$SESSION_LOG"
  while (( i < max_seconds )); do
    if backend_is_up; then
      echo "[$(date +"%Y-%m-%d %H:%M:%S")] Backend OK" >> "$SESSION_LOG"
      say "Backend OK: $BACKEND_URL"
      return 0
    fi
    sleep 1
    ((i++))
  done
  echo "[$(date +"%Y-%m-%d %H:%M:%S")] Backend TIMEOUT after ${max_seconds}s" >> "$SESSION_LOG"
  warn "Backend non raggiungibile dopo ${max_seconds}s: $BACKEND_URL"
  return 1
}

ensure_backend_running() {
  if backend_is_up; then
    say "Backend già attivo: $BACKEND_URL"
    return 0
  fi
  start_backend_new_terminal
  wait_for_backend 30
}

ensure_all_servers_running() {
  ensure_backend_running
  ensure_server_running
}

# ---------------------- Logged test runner ----------------------
# All output → log file. Terminal → only PASS/FAIL + log path.
run_and_log() {
  local test_name="$1"
  shift

  echo "" >> "$SESSION_LOG"
  echo "================================================================================" >> "$SESSION_LOG"
  echo "[$(date +"%Y-%m-%d %H:%M:%S")] START: $test_name  MODE=$(mode_label)  STRICT=$(strict_label)" >> "$SESSION_LOG"
  echo "Command: $*" >> "$SESSION_LOG"
  echo "================================================================================" >> "$SESSION_LOG"

  local rc=0
  set +e
  "$@" >> "$SESSION_LOG" 2>&1
  rc=$?
  set -e

  echo "[$(date +"%Y-%m-%d %H:%M:%S")] END: $test_name -> rc=$rc" >> "$SESSION_LOG"
  echo "" >> "$SESSION_LOG"

  if [[ $rc -eq 0 ]]; then
    echo -e "${CLR_GREEN}✅ ${test_name}: PASSED${CLR_RESET}"
  else
    echo -e "${CLR_RED}❌ ${test_name}: FAILED${CLR_RESET}"
    echo -e "   Log: ${CLR_DIM}${SESSION_LOG_WIN}${CLR_RESET}"
  fi
  return $rc
}
# ----------------------------------------------------------------

# ---------------------- Test runners ----------------------
run_smoke_local() {
  need_password
  ensure_all_servers_running
  mapfile -t envs < <(build_envs "$LOCAL_URL" 0)
  run_and_log "SMOKE (local, $(mode_label), STRICT=$(strict_label))" \
    env "${envs[@]}" npx playwright test --project=chromium --grep @smoke
}

run_smoke_local_headed() {
  need_password
  ensure_all_servers_running
  mapfile -t envs < <(build_envs "$LOCAL_URL" 0)
  run_and_log "SMOKE headed (local, $(mode_label))" \
    env "${envs[@]}" npx playwright test --project=chromium --grep @smoke --headed
}

run_regression_local() {
  need_password
  ensure_all_servers_running
  mapfile -t envs < <(build_envs "$LOCAL_URL" 0)
  run_and_log "REGRESSION (local, $(mode_label), STRICT=$(strict_label))" \
    env "${envs[@]}" npx playwright test --project=chromium
}

run_long_local() {
  need_password
  ensure_all_servers_running
  mapfile -t envs < <(build_envs "$LOCAL_URL" 0)
  run_and_log "LONG @long (local, $(mode_label))" \
    env "${envs[@]}" npx playwright test --project=chromium --grep @long
}

run_unit() {
  run_and_log "UNIT tests" npm run test:unit
}

run_policy() {
  run_and_log "POLICY checks" node tests/policy/policy-checks.js
}

run_deployed() {
  need_password
  mapfile -t envs < <(build_envs "" 1)
  run_and_log "DEPLOYED ($(mode_label), STRICT=$(strict_label))" \
    env "${envs[@]}" npx playwright test --project=chromium --grep @deployed
}

install_all() {
  say "Installing deps..."
  run_and_log "npm ci" npm ci
  run_and_log "playwright install" npx playwright install --with-deps
}

run_level1() {
  local failed=0
  run_unit || failed=1
  run_policy || failed=1
  run_smoke_local || failed=1
  return $failed
}

run_level2() {
  local failed=0
  run_regression_local || failed=1
  run_deployed || failed=1
  run_long_local || failed=1
  return $failed
}

open_report() {
  say "Opening Playwright report..."
  npx playwright show-report
}

clean_artifacts() {
  say "Cleaning artifacts..."
  rm -rf playwright-report test-results/.playwright .cache/ms-playwright 2>/dev/null || true
  say "Done."
}

start_new_session() {
  init_session
  SESSION_LOG_WIN="$(to_win_path "$SESSION_LOG")"
  say "Nuova sessione: ada-tests-${SESSION_NUM}"
  say "Log: ${SESSION_LOG_WIN}"
}

analyze_with_claude() {
  if [[ ! -f "$SESSION_LOG" ]]; then
    warn "Nessun log per la sessione corrente."
    return 1
  fi

  local win_log="${SESSION_LOG_WIN}"
  say "Invocando Claude Code per analisi errori..."
  say "Log: ${win_log}"

  if have_cmd claude; then
    claude "Ci sono errori o avvisi nei test automatici di ADA. Fai root-cause analysis leggendo questo file di log: ${win_log}"
  elif have_cmd claude.exe; then
    claude.exe "Ci sono errori o avvisi nei test automatici di ADA. Fai root-cause analysis leggendo questo file di log: ${win_log}"
  else
    warn "Comando 'claude' non trovato nel PATH."
    warn "Installa Claude Code (https://docs.anthropic.com/en/docs/claude-code) e riprova."
    return 1
  fi
}

status() {
  echo "================ ADA TEST STATUS ================"
  echo "Repo:             $REPO_DIR"
  echo "Session:          ada-tests-${SESSION_NUM}"
  echo "Log:              ${SESSION_LOG_WIN}"
  echo "------------------------------------------------"
  echo "Local URL:        $LOCAL_URL"
  echo "Deploy URL:       $DEPLOY_URL"
  echo "MODE:             $(mode_label)"
  echo "STRICT_NETWORK:   $(strict_label)"
  [[ -n "${ADA_TEST_PASSWORD:-}" ]] && echo "ADA_TEST_PASSWORD: ✅ set" || echo "ADA_TEST_PASSWORD: ❌ NOT set"
  [[ -n "${TEST_VET_EMAIL:-}" ]] && echo "TEST_VET_EMAIL:    ✅ ${TEST_VET_EMAIL}" || echo "TEST_VET_EMAIL:    ❌ NOT set"
  echo "------------------------------------------------"
  if backend_is_up; then echo "Backend (${BACKEND_PORT}):   ✅ reachable"; else echo "Backend (${BACKEND_PORT}):   ❌ not reachable"; fi
  if server_is_up; then echo "Frontend (${PORT}):  ✅ reachable"; else echo "Frontend (${PORT}):  ❌ not reachable"; fi
  echo "================================================="
}

# ---------------------- Command dispatcher ----------------------
run_cmd() {
  local cmd="${1:-}"
  case "$cmd" in
    status) status ;;
    install) install_all ;;
    start-server-bg) ensure_all_servers_running ;;
    level1) run_level1 ;;
    unit) run_unit ;;
    smoke) run_smoke_local ;;
    smoke-headed) run_smoke_local_headed ;;
    level2) run_level2 ;;
    regression) run_regression_local ;;
    long) run_long_local ;;
    policy) run_policy ;;
    deployed) run_deployed ;;
    report) open_report ;;
    clean) clean_artifacts ;;
    new-session) start_new_session ;;
    analyze) analyze_with_claude ;;
    "" ) ;;
    *) die "Unknown command: $cmd" ;;
  esac
}

# ---------------------- Menu ----------------------
menu_level=1
clear_screen() { printf "\e[2J\e[H"; }

wait_space_to_menu() {
  echo ""
  echo -e "${CLR_DIM}Premi SPAZIO per tornare al menu... (ESC per uscire)${CLR_RESET}"
  local k=""
  while true; do
    IFS= read -rsn1 k
    if [[ "$k" == " " ]]; then clear_screen; return 0; fi
    if [[ "$k" == $'\e' ]]; then echo ""; echo "Bye 👋"; exit 0; fi
  done
}

read_choice() { local k=""; IFS= read -rsn1 k; printf "%s" "$k"; }

print_header() {
  echo -e "${CLR_BOLD}==================== ADA Tests v5 ====================${CLR_RESET}"
  echo "Repo:    $REPO_DIR"
  echo "Session: ada-tests-${SESSION_NUM}"
  echo "Log:     ${SESSION_LOG_WIN}"
  echo "------------------------------------------------------"
  echo -e "MODE: ${CLR_BOLD}$(mode_label)${CLR_RESET}  |  STRICT: ${CLR_BOLD}$(strict_label)${CLR_RESET}  ${CLR_DIM}(m=MOCK r=REAL s=toggle)${CLR_RESET}"
  echo "------------------------------------------------------"
  echo -e "${CLR_DIM}Tasti: h=help  ESC=esci  0=switch livello${CLR_RESET}"
  echo "------------------------------------------------------"

  if [[ $menu_level -eq 1 ]]; then
    echo -e "${CLR_BOLD}MENU LIVELLO 1${CLR_RESET}"
    echo "1) Level 1 suite (Unit + Policy + Smoke)  [consigliato]"
    echo "2) Smoke (local)"
    echo "3) Unit tests"
    echo "4) Policy checks"
    echo "5) Status"
    echo "6) Open report"
    echo "7) Nuova sessione (nuovo log)"
    echo "8) Analizza errori con Claude Code"
    echo "0) Vai a MENU LIVELLO 2"
  else
    echo -e "${CLR_BOLD}MENU LIVELLO 2${CLR_RESET}"
    echo "1) Level 2 suite (Regression + Deployed + Long)"
    echo "2) Regression (local)"
    echo "3) Deployed"
    echo "4) Long tests @long"
    echo "5) Install (npm ci + playwright)"
    echo "6) Smoke headed"
    echo "7) Start servers"
    echo "8) Clean artifacts"
    echo "0) Torna a MENU LIVELLO 1"
  fi

  echo -e "${CLR_BOLD}======================================================${CLR_RESET}"
}

menu_loop() {
  clear_screen
  while true; do
    print_header
    local choice
    choice="$(read_choice)"

    if [[ "$choice" == $'\e' ]]; then echo ""; echo "Bye 👋"; exit 0; fi

    if [[ "$choice" == "m" || "$choice" == "M" ]]; then MODE="MOCK"; clear_screen; continue; fi
    if [[ "$choice" == "r" || "$choice" == "R" ]]; then MODE="REAL"; clear_screen; continue; fi
    if [[ "$choice" == "s" || "$choice" == "S" ]]; then
      if [[ "${STRICT_ON}" == "1" ]]; then STRICT_ON=0; else STRICT_ON=1; fi
      clear_screen; continue
    fi

    if [[ "$choice" == "0" ]]; then
      if [[ $menu_level -eq 1 ]]; then menu_level=2; else menu_level=1; fi
      clear_screen; continue
    fi

    echo ""

    if [[ $menu_level -eq 1 ]]; then
      case "$choice" in
        1) run_level1 || true; wait_space_to_menu ;;
        2) run_smoke_local || true; wait_space_to_menu ;;
        3) run_unit || true; wait_space_to_menu ;;
        4) run_policy || true; wait_space_to_menu ;;
        5) status; wait_space_to_menu ;;
        6) open_report; wait_space_to_menu ;;
        7) start_new_session; wait_space_to_menu ;;
        8) analyze_with_claude; wait_space_to_menu ;;
        "h"|"H") status; wait_space_to_menu ;;
        *) warn "Scelta non valida."; wait_space_to_menu ;;
      esac
    else
      case "$choice" in
        1) run_level2 || true; wait_space_to_menu ;;
        2) run_regression_local || true; wait_space_to_menu ;;
        3) run_deployed || true; wait_space_to_menu ;;
        4) run_long_local || true; wait_space_to_menu ;;
        5) install_all || true; wait_space_to_menu ;;
        6) run_smoke_local_headed || true; wait_space_to_menu ;;
        7) ensure_all_servers_running || true; wait_space_to_menu ;;
        8) clean_artifacts; wait_space_to_menu ;;
        "h"|"H") status; wait_space_to_menu ;;
        *) warn "Scelta non valida."; wait_space_to_menu ;;
      esac
    fi
  done
}

# ---------------------- CLI entrypoint ----------------------
if [[ $# -eq 0 ]]; then
  menu_loop
else
  run_cmd "$1"
fi
