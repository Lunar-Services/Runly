#!/bin/sh
set -eu

for hostname in "$RUNLY_APP_DOMAIN" "$RUNLY_RUNTIME_DOMAIN" "$RUNLY_PREVIEW_DOMAIN"; do
  if ! printf '%s\n' "$hostname" | grep -Eq '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'; then
    printf '%s\n' 'Configure valid lowercase DNS hostnames for the Docker proxy.' >&2
    exit 1
  fi
done

# Limit substitution to deployment variables; leave nginx's $host, $uri etc.
envsubst '${RUNLY_APP_DOMAIN} ${RUNLY_RUNTIME_DOMAIN} ${RUNLY_PREVIEW_DOMAIN}' \
  < /etc/nginx/runly.conf.template > /tmp/nginx.conf
exec nginx -c /tmp/nginx.conf -g 'daemon off;'
