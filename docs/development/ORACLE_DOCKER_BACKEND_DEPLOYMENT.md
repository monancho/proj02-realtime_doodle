# Oracle Docker Backend Deployment

Date: 2026-06-08

## Scope

This guide prepares the Realtime Doodle Relay backend for an Oracle Cloud Docker deployment while the frontend is served by Cloudflare Pages.

- Backend container: `apps/server`
- Shared workspace dependency: `packages/shared`
- Frontend: Cloudflare Pages, not served by this container
- Auth: Firebase Authentication in the browser and Firebase Admin verification on the backend
- Storage: MongoDB and GridFS

Secret values are intentionally not documented here.

## Docker Image

Build from the repository root:

```bash
docker build -f apps/server/Dockerfile -t realtime-doodle-server:local .
```

The Dockerfile copies the workspace root manifests, `apps/server`, and `packages/shared` so the backend can resolve `@doodle/shared`.

The current server runtime uses `tsx` through the package script:

```bash
pnpm --filter @doodle/server start
```

That means the first Docker version installs the dependencies needed to run TypeScript source directly. A future optimization can compile server output to JavaScript and remove runtime TypeScript tooling from the image.

## Runtime Environment

Inject runtime environment variables when the container starts. Use names and purposes only in documentation:

| Name | Purpose |
| --- | --- |
| `NODE_ENV` | Runtime mode. Use `production`. |
| `PORT` | Container HTTP port for API, health, and Socket.IO. |
| `CLIENT_URL` | Allowed Cloudflare frontend origin or comma-separated origin list for HTTP CORS. |
| `SOCKET_CORS_ORIGIN` | Allowed Cloudflare frontend origin or comma-separated origin list for Socket.IO CORS. |
| `MONGODB_URI` | MongoDB connection string. Secret. |
| `MONGODB_DB_NAME` | MongoDB database name. |
| `FIREBASE_PROJECT_ID` | Firebase project id used by Firebase Admin. |
| `FIREBASE_CLIENT_EMAIL` | Firebase Admin service account email. Credential metadata. |
| `FIREBASE_PRIVATE_KEY` | Firebase Admin private key. Secret. |

Do not bake runtime env values into the image. Pass them through Oracle container runtime configuration, a secret manager, or a host-managed env file that is never committed.

## Local Smoke Shape

After starting the container with valid runtime env values, check:

```bash
curl -f http://localhost:4000/health
```

Expected result: HTTP 200 with service status JSON.

The Docker image also includes a container `HEALTHCHECK` that calls `/health` on the configured `PORT`.

## Local Validation Result

Latest local validation on 2026-06-08:

- `docker build -f apps/server/Dockerfile -t realtime-doodle-server:local .`: PASS
- Image exclusion check for `.env`, root `package-lock.json`, known local logs, and `.codex/server-local.log`: PASS
- Runtime start without required environment values: expected failure. The container starts the server command and exits after reporting missing required env names only.

Full `/health` smoke requires user-provided runtime environment values for MongoDB and Firebase Admin. Those values must be injected at container runtime and must not be committed or written to documentation.

## Oracle Cloud Checklist

- Open only the required public port at the Oracle network/security-list layer.
- Terminate HTTPS in a reverse proxy or load balancer before production use.
- Forward WebSocket upgrade requests for `/socket.io`.
- Forward HTTP API requests under `/api`.
- Keep `/health` reachable for smoke checks and container health checks.
- Set `CLIENT_URL` and `SOCKET_CORS_ORIGIN` to the Cloudflare production/custom/preview origins that should be allowed.
- Do not use wildcard CORS origins.
- Do not store uploaded originals or generated results on Oracle local disk; MongoDB GridFS remains authoritative.
- Ensure the Oracle runtime can reach MongoDB and Firebase Admin verification dependencies.
- Keep secret rotation user-owned after deployment and QA are complete.

## Cloudflare Pages Pairing

Cloudflare Pages must set:

- `VITE_API_BASE_URL`: Oracle backend public HTTPS origin.
- `VITE_SOCKET_URL`: Oracle backend public HTTPS origin, unless Socket.IO uses a distinct route/origin.
- Firebase web config variables for the same Firebase project used by the backend.

Firebase Authentication authorized domains must include the Cloudflare production/custom frontend domain used by users.
