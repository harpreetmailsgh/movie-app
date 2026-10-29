#!/usr/bin/env bash
#
# maestro-run.sh — run the Movie Deck directed journey's Maestro flows
# in stage order with FAIL-FAST, for .github/workflows/maestro.yml (D1).
#
# CONTRACT (do not break without updating the workflow + VERDICT-GUIDE):
#   - Run from the repo root (the workflow runs ./maestro-run.sh from the
#     workspace root); the script also cd's to its own directory, so an
#     absolute-path invocation from elsewhere still resolves the flows.
#   - Assumes the emulator is already booted and the APK already
#     installed (the workflow does that). This script installs NOTHING.
#   - Invokes flows 01-a through 10-k IN ORDER, skipping none.
#   - FAIL-FAST: stops at the first failed flow. Later stages are
#     reported NOT RUN, never FAIL — a broken stage invalidates
#     downstream assertions because the journey is stateful (plan §1.3).
#   - Prints a summary naming every flow PASS / FAIL / NOT RUN and exits
#     non-zero if any flow failed, zero if all passed. The workflow
#     redirects this output to maestro-output.txt, which IS the log the
#     verdict is read from (plus the Maestro report dir, below).
#   - Directs Maestro screenshots/artifacts to maestro-report/ via the
#     CLI's --test-output-dir flag (docs.maestro.dev, "Maestro CLI
#     commands and options": --test-output-dir configures the test
#     output directory for screenshots and other test artifacts). The
#     workflow uploads that directory with if-no-files-found: warn.
#
# FAIL-FAST + `bash -e` SAFETY (read before editing):
#   The workflow's emulator step runs under `set +e`, but this script
#   must ALSO survive being invoked as `bash -e maestro-run.sh`: it
#   therefore starts with an explicit `set +e` and captures every
#   per-flow exit code by hand (maestro is invoked in a `|| code=$?`
#   form, which is exempt from errexit even where `set +e` is
#   somehow undone). NEVER let `set -e` (or a bare `maestro ...` line
#   whose failure aborts the script) swallow a per-flow code: a swallowed
#   code would abort the run without the summary log, and the workflow
#   could not tell which stage broke.
#
# TESTING WITHOUT AN EMULATOR:
#   MAESTRO_BIN=<fake-maestro> ./maestro-run.sh — the fake binary only
#   needs to accept `test --test-output-dir <dir> <flow>` and exit 0/1.
#   This is how the fail-fast logic itself is verified (see the D6
#   report); it does NOT verify the flows, which need the T1 dry run
#   and the real emulator run.
#
# EXIT CODES: 0 = all flows passed. 1 = at least one flow failed, a flow
#   file was missing, or the maestro binary was not found.

# Explicit: per-flow exit codes are captured by hand, never by errexit.
set +e

cd "$(dirname "$0")" || { echo "ERROR: cannot cd to script directory" >&2; exit 1; }

MAESTRO_BIN="${MAESTRO_BIN:-maestro}"
REPORT_DIR="maestro-report"

# Ordered stage flows — every stage, skipping none. Flows 03-09 land via
# D3-D5; until they exist, a missing file FAILS that stage (fail-fast)
# rather than being silently skipped — a skipped stage would invalidate
# every downstream assertion without a trace.
FLOWS=(
  "01-a-launch.yaml"
  "02-b-tabs.yaml"
  "03-c-trending.yaml"
  "04-d-search-add.yaml"
  "05-e-save-typed.yaml"
  "06-f-rapid3.yaml"
  "07-g-mixed.yaml"
  "08-h-watchlist-seen.yaml"
  "09-i-errors.yaml"
  "10-k-stagek.yaml"
)

# Status per flow, in FLOWS order: PASS, FAIL, or NOT RUN.
declare -a STATUS=()
OVERALL=0

print_summary() {
  echo ""
  echo "===== MAESTRO RUN SUMMARY ====="
  local i
  for i in "${!FLOWS[@]}"; do
    echo "${FLOWS[$i]}: ${STATUS[$i]}"
  done
  if [ "$OVERALL" -eq 0 ]; then
    echo "OVERALL: PASS (all ${#FLOWS[@]} flows passed)"
  else
    echo "OVERALL: FAIL (see first FAIL above; later stages NOT RUN)"
  fi
  echo "==============================="
}

if ! command -v "$MAESTRO_BIN" >/dev/null 2>&1; then
  echo "ERROR: maestro binary not found: $MAESTRO_BIN" >&2
  echo "The workflow installs it before this script runs; a local run needs" >&2
  echo "'maestro' on PATH (or MAESTRO_BIN=<path> ./maestro-run.sh)." >&2
  for _flow in "${FLOWS[@]}"; do
    STATUS+=("NOT RUN")
  done
  OVERALL=1
  print_summary
  exit 1
fi

mkdir -p "$REPORT_DIR" || true

FAILED=0
for flow in "${FLOWS[@]}"; do
  flow_path="maestro/flows/$flow"
  echo ""
  echo "===== RUN $flow ====="
  if [ ! -f "$flow_path" ]; then
    # Missing file is a FAIL, not a skip: the ordered journey cannot
    # proceed past a stage that does not exist, and fail-fast marks the
    # rest NOT RUN so no downstream verdict is invented.
    echo "FAIL: flow file missing: $flow_path (D3-D5 deliver flows 03-09)"
    STATUS+=("FAIL")
    OVERALL=1
    FAILED=1
    break
  fi
  # Exit code captured via `||` (errexit-exempt) — never a bare call
  # whose failure could abort the script before the summary prints.
  code=0
  "$MAESTRO_BIN" test --test-output-dir "$REPORT_DIR" "$flow_path" || code=$?
  if [ "$code" -eq 0 ]; then
    echo "PASS: $flow"
    STATUS+=("PASS")
  else
    echo "FAIL: $flow (maestro exit code: $code)"
    STATUS+=("FAIL")
    OVERALL=1
    FAILED=1
    break
  fi
done

# Fail-fast: every stage after the failed one is NOT RUN, never FAIL.
if [ "$FAILED" -eq 1 ]; then
  while [ "${#STATUS[@]}" -lt "${#FLOWS[@]}" ]; do
    STATUS+=("NOT RUN")
  done
fi

print_summary
exit "$OVERALL"
