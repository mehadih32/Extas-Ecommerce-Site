# shellcheck shell=bash
# PR 5 follow-up (31 Oct 2026) — PostgreSQL's own tools inside the database container, found by their real folder.
# `docker exec extas-postgres psql` relied on the image's PATH reaching /usr/lib/postgresql/<n>/bin; after the containerd
# store moved (PR 4, 31 Oct) the call found Debian's /usr/bin wrapper instead ("You must install at least one
# postgresql-client-<version> package"), the append-only check read nothing and three deploys rolled back. pg_exec puts
# the newest /usr/lib/postgresql/*/bin first itself, so the tools run whatever PATH the exec gets.
#   pg_exec [-i] [-u <user>] <tool> [args…]      e.g.  pg_exec -i psql -qtAX -U extas -d extas  (SQL on stdin)
#   pg_exec_diag                                  one line on why the tools cannot run (for a report; never a secret)
PG_CONTAINER="${PG_CONTAINER:-extas-postgres}"

pg_exec() {
  local opts=()
  while [ $# -gt 0 ]; do
    case "$1" in
      -i) opts+=(-i); shift ;;
      -u) opts+=(-u "$2"); shift 2 ;;
      *) break ;;
    esac
  done
  # shellcheck disable=SC2016  # expanded inside the container, not here
  docker exec "${opts[@]}" "$PG_CONTAINER" sh -c \
    'for d in /usr/lib/postgresql/*/bin; do [ -x "$d/psql" ] && PATH="$d:$PATH"; done; export PATH; exec "$@"' pg "$@"
}

pg_exec_diag() {
  local state bins path
  state="$(docker inspect -f '{{.Config.Image}} {{.State.Status}} since {{.State.StartedAt}}' "$PG_CONTAINER" </dev/null 2>/dev/null || echo 'no container')"
  # Only the PATH entry of the container's environment: the rest holds the database password.
  path="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$PG_CONTAINER" </dev/null 2>/dev/null | grep '^PATH=' | head -1)"
  # shellcheck disable=SC2016
  bins="$(docker exec "$PG_CONTAINER" sh -c 'ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tr "\n" " "; echo "exec PATH=$PATH"' </dev/null 2>&1 | head -2 | tr '\n' ' ')"
  printf '%s; %s; %s\n' "$state" "${path:-PATH not set}" "${bins:-no answer}"
}
