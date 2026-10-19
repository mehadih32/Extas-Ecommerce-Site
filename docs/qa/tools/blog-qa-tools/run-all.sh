#!/bin/bash
# usage: run-all.sh <html> <modules: sweep,journeys,ads,popup,backend> [devices...]   (max 2 browsers at a time)
cd "$(dirname "$0")"
export QA_HTML=$(readlink -f "$1"); MODS=$2; shift 2
DEVS="$@"; [ -z "$DEVS" ] && DEVS=$(node -e "console.log(require('./lib').DEVICES.map(d=>d.name).join(' '))")
LOG=../logs; mkdir -p $LOG
JOBS=()
for d in $DEVS; do for m in ${MODS//,/ }; do
  if [ "$m" = backend ] && ! [[ "$d" =~ ^(d1280x800|p393x852|t820x1180p)$ ]]; then continue; fi
  extra=""; [ "$m" = popup ] && [[ "$d" =~ ^(p393x852|t820x1180p|d1440x900)$ ]] && extra=full
  JOBS+=("$m $d $extra")
done; done
printf '%s\n' "${JOBS[@]}" | xargs -P 2 -I{} bash -c 'set -- {}; timeout 600 node $1.js $2 $3 > '"$LOG"'/$1-$2.log 2>&1; echo "$(date +%T) done $1 $2 exit=$? $(grep -c "  FAIL" '"$LOG"'/$1-$2.log) fails"'
