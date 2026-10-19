# PgBouncer from Alpine's own package — small, pinned by the Alpine release.
FROM alpine:3.22
RUN apk add --no-cache pgbouncer netcat-openbsd \
 && (id pgbouncer >/dev/null 2>&1 || adduser -S -D -H -u 6432 pgbouncer) \
 && mkdir -p /var/run/pgbouncer && chown pgbouncer /var/run/pgbouncer
USER pgbouncer
EXPOSE 6432
CMD ["pgbouncer", "/etc/pgbouncer/pgbouncer.ini"]
