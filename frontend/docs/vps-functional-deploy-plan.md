# ai-memory UI: functional VPS deploy plan

## Current state

- Local branch: `ui-redesign`.
- VPS repo: `/home/ubuntu/repos/ai-memory-ui`, remote `devAndreotti/ai-memory`, branch `ui-redesign`.
- VPS app: `/home/ubuntu/apps/ai-memory`.
- VPS runtime: Docker container `ai-memory`, image `local/ai-memory:ui-redesign`, port `127.0.0.1:49374`.
- VPS command today: `/usr/local/bin/ai-memory serve --transport http --bind 0.0.0.0:49374 --enable-web`.
- Frontend status: React/Vite cockpit still reads mock data from `frontend/src/lib/api-contract.ts`.

Important: deploying `frontend/dist` as-is gives a good visual preview, but not a functional memory browser. Final functional deploy requires replacing mock calls with same-origin `/api/v1` calls first.

## Validation already run locally

Run these before every deploy candidate:

```bash
cd frontend
npm run build
npm run test:smoke
npm audit --json
```

```bash
cargo test -p ai-memory-core -p ai-memory-store -p ai-memory-wiki -p ai-memory-llm -p ai-memory-consolidate --jobs 1
cargo test -p ai-memory-hooks -p ai-memory-mcp -p ai-memory-web --jobs 1
cargo test -p ai-memory-cli --bin ai-memory --jobs 1
```

Known Windows caveat: full `cargo test --workspace` can OOM or hit Windows integration-test execution policy. Use the package slices above locally; run full workspace in Linux CI/VPS if needed.

## Phase 1: make frontend functional

Replace mock-only API adapter in `frontend/src/lib/api-contract.ts`.

- `listProjects()` should call `GET /api/v1/projects`.
- `listPages(project)` should call `GET /api/v1/pages?workspace=default&project=<project>`.
- `readPage(project, path)` should call the page endpoint and map markdown/body/frontmatter/links/backlinks into `ReaderPage`.
- `searchMemory(q)` and `listSearchResults(q)` should call `/api/v1/search?q=<q>`.
- `getProjectBriefing()` should call briefing/status endpoints where available, otherwise derive read-only stats from projects/pages.
- Keep `listApiScenarios()` and drift mock panels behind a local demo flag until real backend endpoints exist.
- Add `VITE_AI_MEMORY_DEMO=1` support so mock mode stays available for design work but is not default in production build.

Acceptance:

```bash
cd frontend
npm run build
npm run test:smoke
```

Manual smoke against live server:

```bash
AI_MEMORY_FRONTEND_URL=http://127.0.0.1:49374/web/ npm run test:smoke
```

## Phase 2: build static UI locally

Do not run Node build on the 1 GB VPS.

```bash
cd frontend
npm ci
npm run build
```

Create artifact:

```bash
tar -C frontend/dist -czf ../ai-memory-web-ui-dist.tgz .
```

Copy to VPS:

```bash
scp ../ai-memory-web-ui-dist.tgz ostg01-ts:/tmp/ai-memory-web-ui-dist.tgz
```

## Phase 3: backup VPS before deploy

Run on VPS:

```bash
TS="$(date -u +%Y%m%dT%H%M%SZ)"
APP=/home/ubuntu/apps/ai-memory
BK="$APP/backups/frontend-functional-$TS"
mkdir -p "$BK"
cp "$APP/docker-compose.yml" "$BK/docker-compose.yml"
cp "$APP/.env" "$BK/.env"
tar -C "$APP" -czf "$BK/data.tgz" data
if [ -d "$APP/web-ui" ]; then tar -C "$APP" -czf "$BK/web-ui.tgz" web-ui; fi
sha256sum "$BK"/* > "$BK/files.sha256"
```

Do not print `.env`.

## Phase 4: install UI artifact

Run on VPS:

```bash
APP=/home/ubuntu/apps/ai-memory
rm -rf "$APP/web-ui.next"
mkdir -p "$APP/web-ui.next"
tar -C "$APP/web-ui.next" -xzf /tmp/ai-memory-web-ui-dist.tgz
test -f "$APP/web-ui.next/index.html"
rm -rf "$APP/web-ui.prev"
if [ -d "$APP/web-ui" ]; then mv "$APP/web-ui" "$APP/web-ui.prev"; fi
mv "$APP/web-ui.next" "$APP/web-ui"
```

Update compose to mount the SPA:

```yaml
services:
  ai-memory:
    volumes:
      - ./data:/data
      - ./web-ui:/web-ui:ro
    command:
      - serve
      - --transport
      - http
      - --bind
      - 0.0.0.0:49374
      - --enable-web
      - --web-ui-dir
      - /web-ui
```

Then:

```bash
cd /home/ubuntu/apps/ai-memory
docker compose up -d
docker compose ps
curl -fsS http://127.0.0.1:49374/web/ >/dev/null
curl -fsS http://127.0.0.1:49374/api/v1/projects >/dev/null
```

## Phase 5: deploy backend fixes

This branch contains small Rust fixes for Windows/path safety in hooks/CLI tests. To deploy them on VPS, rebuild image from the repo after pulling GitHub.

Run on VPS:

```bash
cd /home/ubuntu/repos/ai-memory-ui
git fetch origin
git switch ui-redesign
git pull --ff-only origin ui-redesign
TAILWIND_SKIP=1 cargo test -p ai-memory-hooks -p ai-memory-mcp -p ai-memory-web --jobs 1
TAILWIND_SKIP=1 cargo test -p ai-memory-cli --bin ai-memory --jobs 1
DOCKER_BUILDKIT=1 docker build \
  --target runtime-source \
  --build-arg CARGO_PROFILE_RELEASE_LTO=false \
  --build-arg CARGO_PROFILE_RELEASE_CODEGEN_UNITS=16 \
  -t local/ai-memory:ui-redesign \
  -f docker/Dockerfile .
cd /home/ubuntu/apps/ai-memory
docker compose up -d
```

The VPS has 1 GB RAM but large swap. Build may be slow; do not run parallel deploy work during image build.

## Phase 6: post-deploy checks

Run on VPS:

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep ai-memory
docker inspect --format '{{json .State.Health}}' ai-memory
curl -fsS http://127.0.0.1:49374/web/ | head
curl -fsS http://127.0.0.1:49374/api/v1/projects | head
tail -n 80 /home/ubuntu/apps/ai-memory/data/logs/ai-memory.log."$(date -u +%Y-%m-%d)"
```

Then from local:

```bash
cd frontend
AI_MEMORY_FRONTEND_URL=http://127.0.0.1:49374/web/ npm run test:smoke
```

## Rollback

Run on VPS:

```bash
APP=/home/ubuntu/apps/ai-memory
cd "$APP"
docker compose down
rm -rf web-ui
if [ -d web-ui.prev ]; then mv web-ui.prev web-ui; fi
cp backups/<backup-dir>/docker-compose.yml docker-compose.yml
docker compose up -d
docker compose ps
curl -fsS http://127.0.0.1:49374/web/ >/dev/null
```

If image rebuild caused the issue:

```bash
docker image ls local/ai-memory
docker tag <previous-image-id> local/ai-memory:ui-redesign
docker compose up -d
```
