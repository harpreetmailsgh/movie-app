#!/usr/bin/env bash
set +e
adb wait-for-device
# Phase 1: boot (unchanged)
GATE_OK=0
for i in $(seq 1 60); do
  BOOT=$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')
  echo "GATE boot i=$i ts=$(date -u +%FT%TZ) boot_completed='${BOOT}'"
  if [ "$BOOT" = "1" ]; then GATE_OK=1; break; fi
  sleep 5
done
if [ "$GATE_OK" != "1" ]; then echo "ERROR: sys.boot_completed never reached 1 after 60 samples (300s)" >&2; exit 1; fi
# Phase 2: pm readiness — REPLACES loadavg. Pass = non-empty pm output.
# Loadavg is logged as a diagnostic only, never as pass/fail.
PASS=0; LAST_OUT=""
for i in $(seq 1 40); do
  PM_RAW=$(adb shell pm path android 2>/dev/null); PM_EXIT=$?
  PM_OUT=$(printf '%s' "$PM_RAW" | tr -d '\r')
  LOAD_DIAG=$(adb shell cat /proc/loadavg 2>/dev/null | awk '{print $1}')
  if [ -n "$PM_OUT" ]; then PASS=$((PASS+1)); else PASS=0; fi
  LAST_OUT="$PM_OUT"
  echo "GATE pm i=$i ts=$(date -u +%FT%TZ) boot_completed=1 pm_exit=$PM_EXIT pm_out='${PM_OUT:-EMPTY}' loadavg_diag='${LOAD_DIAG:-EMPTY}' consecutive_passes=$PASS"
  if [ "$PASS" -ge 2 ]; then break; fi
  sleep 15
done
if [ "$PASS" -lt 2 ]; then echo "ERROR: package manager never responsive (pm path android) after 40 samples (600s): last_pm_out='${LAST_OUT:-EMPTY}' consecutive_passes=$PASS" >&2; exit 1; fi
echo "GATE VERDICT: pm-ready after settle (consecutive_passes=$PASS)"
# Phase 3: logcat BEFORE install, then install as proving step
adb logcat -c
adb logcat -v time > logcat.txt &
LOGCAT_PID=$!
timeout 300 adb install ./app.apk; INSTALL_EXIT=$?
echo "GATE install ts=$(date -u +%FT%TZ) install_exit=$INSTALL_EXIT"
if [ "$INSTALL_EXIT" -ne 0 ]; then echo "ERROR: adb install failed or timed out (exit=$INSTALL_EXIT, 300s cap)" >&2; kill $LOGCAT_PID || true; exit 1; fi
# Phase 4: fixed post-install settle
echo "GATE settle ts=$(date -u +%FT%TZ) sleeping 60s post-install"
sleep 60
echo "GATE VERDICT: PASS (pm-ready, install ok) — starting Maestro"
# Phase 5: Maestro (unchanged invocation)
timeout 2400 ./maestro-run.sh > maestro-output.txt 2>&1
MAESTRO_EXIT=$?
kill $LOGCAT_PID || true
exit $MAESTRO_EXIT
