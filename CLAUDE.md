# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Minimal Express API that acts as a pure streaming bridge: receives raw binary audio via HTTP POST body, pipes it through `ffmpeg` stdin→stdout, and returns an MP3. No file storage, no volumes, no multipart parsing.

## Commands

```bash
# Build and start
docker compose up -d --build

# Stop
docker compose down

# Health check
curl http://localhost:3000/health

# Test conversion (replace audio.opus with any ffmpeg-readable format)
curl -X POST http://localhost:3000/convert \
  -H "Content-Type: audio/ogg" \
  --data-binary "@audio.opus" \
  --output audio.mp3

# Run locally (requires ffmpeg installed on host)
npm install
npm start
```

## Architecture

All logic lives in `server.js`. There are two routes:

- `GET /health` — liveness probe, returns `{ ok: true }`.
- `POST /convert` — the core route. It:
  1. Rejects `multipart/form-data` with a 415.
  2. Spawns `ffmpeg` with `pipe:0` as input and `pipe:1` as output.
  3. Pipes `req` → `ffmpeg.stdin` and `ffmpeg.stdout` → `res`.
  4. Tracks `bytesReceived` on the `data` event; kills ffmpeg and returns 413 if `MAX_BYTES` is exceeded.
  5. On `ffmpeg.close`, returns 400 (no data), 422 (ffmpeg error), or lets the piped response finish normally.

The `finished` flag prevents double-responses after the size limit is hit or on aborted requests.

## Environment variables

| Variable    | Default       | Description                        |
|-------------|---------------|------------------------------------|
| `PORT`      | `3000`        | Listening port                     |
| `MAX_BYTES` | `26214400`    | Max input size in bytes (25 MB)    |
| `BITRATE`   | `128k`        | MP3 output bitrate                 |

## Docker security posture

The container runs as `USER node` (non-root), drops all Linux capabilities, mounts the filesystem read-only, and uses a tmpfs at `/tmp` (64 MB, noexec). `ffmpeg` uses only pipes — no disk I/O needed.

## Calling from n8n

In an **HTTP Request** node:
- Method: `POST`
- URL: `http://audio-converter-api:3000/convert` (same compose network) or `http://HOST:3000/convert` (external)
- Body Content Type: `Binary`
- Input Binary Field: `data`
- Response Format: `File`
