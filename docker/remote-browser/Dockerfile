# BrowserOS neo in a container for agents: the Linux .deb on a virtual X display,
# viewable in the browser at http://localhost:3000 (noVNC, password protected).
FROM ubuntu:24.04

ARG BROWSEROS_DEB_URL=https://cdn.browseros.com/download/BrowserOS_neo.deb
ENV DEBIAN_FRONTEND=noninteractive \
    DISPLAY=:99 \
    SCREEN_GEOMETRY=1920x1080x24 \
    NOVNC_PORT=3000 \
    CDP_PORT=9222 \
    BROWSER_DATA_DIR=/home/agent/browser-data

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates curl xvfb x11vnc novnc websockify dbus-x11 \
        fonts-liberation fonts-noto-color-emoji v4l-utils alsa-utils \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL "${BROWSEROS_DEB_URL}" -o /tmp/browseros.deb \
    && apt-get update \
    && apt-get install -y --no-install-recommends /tmp/browseros.deb \
    && rm -rf /tmp/browseros.deb /var/lib/apt/lists/*

COPY docker/browseros/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 0755 /usr/local/bin/entrypoint.sh \
    && useradd -m -s /bin/bash agent \
    && mkdir -p "${BROWSER_DATA_DIR}" \
    && chown agent:agent "${BROWSER_DATA_DIR}"

# Camera and microphone: the host's /dev/video* and /dev/snd devices are passed in at run time
# (--device), and the container user needs the host's `video` and `audio` groups (--group-add).
# Checks inside the container: `v4l2-ctl --list-devices` (camera), `arecord -l` (microphone).

# Browser profile (logins, cookies, history). Mount a host directory here to persist it.
VOLUME ["/home/agent/browser-data"]

USER agent
WORKDIR /home/agent
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
