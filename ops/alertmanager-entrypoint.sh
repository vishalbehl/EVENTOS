#!/bin/sh
set -eu

config=/tmp/alertmanager.yml

if [ -n "${ALERTMANAGER_WEBHOOK_URL:-}" ]; then
  case "$ALERTMANAGER_WEBHOOK_URL" in
    http://*|https://*) ;;
    *) echo "ALERTMANAGER_WEBHOOK_URL must use http:// or https://" >&2; exit 1 ;;
  esac
  cat > "$config" <<EOF
global:
  resolve_timeout: 5m
route:
  receiver: external-webhook
  group_by: [alertname, service]
  group_wait: 10s
  group_interval: 5m
  repeat_interval: 4h
receivers:
  - name: external-webhook
    webhook_configs:
      - url: "$ALERTMANAGER_WEBHOOK_URL"
        send_resolved: true
EOF
else
  cp /etc/alertmanager/alertmanager.yml "$config"
fi

exec /bin/alertmanager \
  --config.file="$config" \
  --storage.path=/alertmanager
