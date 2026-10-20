# CN-016 — the smoke test's browser image (infra/deploy/smoke.sh builds it once per Playwright version on the VM).
# The official Playwright image has Chromium and its system libraries; the matching npm package goes on top.
ARG PLAYWRIGHT_VERSION
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble
ARG PLAYWRIGHT_VERSION
RUN npm install -g --no-audit --no-fund "playwright@${PLAYWRIGHT_VERSION}"
ENV NODE_PATH=/usr/lib/node_modules
WORKDIR /w
