#!/bin/bash
# R2 runner: ONE browser at a time (other agents test in parallel). usage: run-r2.sh <html> <modules> <outdir> [devices...]
cd "$(dirname "$0")"
export QA_HTML=$(readlink -f "$1") QA_OUT=$3/out QA_SHOTS=$3/shots; MODS=$2; LOG=$3/logs; shift 3; mkdir -p $LOG $QA_OUT $QA_SHOTS
DEVS="$@"; [ -z "$DEVS" ] && DEVS=$(node -e "console.log(require('./lib').DEVICES.map(d=>d.name).join(' '))")
for d in $DEVS; do for m in ${MODS//,/ }; do
  if [ "$m" = backend ] && ! [[ "$d" =~ ^(d1280x800|p393x852|t820x1180p)$ ]]; then continue; fi
  extra=""; [ "$m" = popup ] && [[ "$d" =~ ^(p393x852|t820x1180p|d1440x900)$ ]] && extra=full
  timeout 600 node $m.js $d $extra > $LOG/$m-$d.log 2>&1; echo "$(date +%T) done $m $d exit=$? $(grep -c '  FAIL' $LOG/$m-$d.log) fails"
done; done
