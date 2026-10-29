#!/usr/bin/env bash
set +e
adb wait-for-device
# Readiness gate: boot_completed is necessary but NOT sufficient (run #1
# passed the runner's boot gate while boot broadcasts still took ~8 min).
# Wait for boot_completed, then for the emulator to actually settle:
# two consecutive 1-min loadavg samples below the core count (4), 15 s apart.
GATE_OK=0
for i in $(seq 1 60); do
  BOOT=$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')
  if [ "$BOOT" = "1" ]; then GATE_OK=1; break; fi
  sleep 5
done
if [ "$GATE_OK" != "1" ]; then echo "ERROR: sys.boot_completed never reached 1" >&2; exit 1; fi
LOW=0
for i in $(seq 1 40); do
  LOAD=$(adb shell cat /proc/loadavg 2>/dev/null | awk '{print $1}')
  if [ -n "$LOAD" ] && awk -v l="$LOAD" 'BEGIN{exit !(l < 4.0)}'; then LOW=$((LOW+1)); else LOW=0; fi
  if [ "$LOW" -ge 2 ]; then break; fi
  sleep 15
done
if [ "$LOW" -lt 2 ]; then echo "ERROR: emulator never settled (loadavg) before Maestro" >&2; exit 1; fi
adb logcat -c
adb install ./app.apk
adb logcat -v time > logcat.txt &
LOGCAT_PID=$!
timeout 2400 ./maestro-run.sh > maestro-output.txt 2>&1
MAESTRO_EXIT=$?
kill $LOGCAT_PID || true
exit $MAESTRO_EXIT
