#!/bin/sh
# Starts a virtual display, a VNC server on it, noVNC on $NOVNC_PORT (web viewer),
# then BrowserOS neo with its profile in $BROWSER_DATA_DIR and a remote-debugging port for agents.
# --no-sandbox is needed inside containers without the user namespaces Chromium's sandbox uses.
set -eu

# Virtual display.
Xvfb "${DISPLAY}" -screen 0 "${SCREEN_GEOMETRY}" -nolisten tcp &
i=0
until [ -S "/tmp/.X11-unix/X${DISPLAY#:}" ] || [ "$i" -ge 50 ]; do i=$((i + 1)); sleep 0.1; done

# VNC password. The browser is logged into accounts, so never run without one.
if [ -z "${VNC_PASSWORD:-}" ]; then
  VNC_PASSWORD=$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 16)
  echo "entrypoint: VNC_PASSWORD not set, generated one for this run: ${VNC_PASSWORD}"
fi
x11vnc -storepasswd "${VNC_PASSWORD}" /tmp/vnc.pass >/dev/null 2>&1

# VNC stays on localhost; websockify serves noVNC and proxies it to VNC on the published port.
x11vnc -display "${DISPLAY}" -rfbport 5900 -localhost -rfbauth /tmp/vnc.pass \
  -forever -shared -noxdamage -quiet &
websockify --web /usr/share/novnc "0.0.0.0:${NOVNC_PORT}" localhost:5900 &

# The .deb ships the binary as `browserclaw`; fall back to `browseros-neo` if a future build renames it.
BIN="${BROWSEROS_BIN:-$(command -v browserclaw || command -v browseros-neo || true)}"
if [ -z "${BIN}" ]; then
  echo "entrypoint: BrowserOS binary not found" >&2
  exit 1
fi

# Stop the background services when the container stops (docker stop sends SIGTERM to PID 1).
trap 'kill 0' TERM INT

"${BIN}" \
  --no-sandbox \
  --user-data-dir="${BROWSER_DATA_DIR}" \
  --remote-debugging-port="${CDP_PORT}" \
  --disable-dev-shm-usage \
  "$@"
