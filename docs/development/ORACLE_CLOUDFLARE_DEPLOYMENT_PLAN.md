# Oracle Backend + Cloudflare Frontend Deployment Plan

Date: 2026-06-08

## Target Architecture

- Frontend: Cloudflare Pages serves the Vite-built `apps/web` static app.
- Backend: Oracle Cloud runs the Node/Express/Socket.IO server from `apps/server`.
- Auth: Firebase Authentication remains the OAuth provider for browser login and Firebase ID token issuance.
- Server auth: Firebase Admin verifies Firebase ID tokens for HTTP API and Socket.IO connections.
- Persistence: MongoDB remains the database and GridFS storage for original images and result images.
- Secrets and external console changes are user-owned. Secret values must never be written to repo docs, logs, commits, or chat output.

## Cloudflare Pages Frontend Environment

Set these Cloudflare Pages variables by name and purpose only:

| Name | Purpose | Notes |
| --- | --- | --- |
| `VITE_API_BASE_URL` | Public HTTPS origin for the Oracle backend API | Must include scheme and host. Do not end with a slash if possible. |
| `VITE_SOCKET_URL` | Public HTTPS origin for the Oracle Socket.IO server | Can match `VITE_API_BASE_URL` unless Socket.IO is routed through a different origin. |
| `VITE_FIREBASE_API_KEY` | Firebase web client API key | Public Firebase web config value, but still avoid committing it. |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth domain used by the web client | Must match the Firebase project auth domain. |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project id for the web client | Must match backend Firebase project. |
| `VITE_FIREBASE_APP_ID` | Firebase web app id | Must match the Firebase web app. |
| `VITE_ENABLE_UI_PREVIEW` | Optional local/mock UI preview toggle | Keep unset or `false` for production unless explicitly testing preview modes. |

Current code behavior:

- `apps/web/src/App.tsx` reads `VITE_API_BASE_URL` and `VITE_SOCKET_URL`.
- In production, missing `VITE_API_BASE_URL` falls back to the current page origin. On Cloudflare Pages this would point API calls at Cloudflare, not Oracle, so it must be configured.
- `apps/web/src/auth/firebase.ts` requires the Firebase Vite variables at runtime startup.

## Oracle Backend Environment

Set these Oracle backend variables by name and purpose only:

| Name | Purpose | Notes |
| --- | --- | --- |
| `NODE_ENV` | Runtime mode | Use `production` for deployed Oracle backend. |
| `PORT` | HTTP port for Express and Socket.IO | Must match the process manager / reverse proxy target. |
| `CLIENT_URL` | Allowed frontend origin for HTTP CORS | Use the Cloudflare production frontend origin. |
| `SOCKET_CORS_ORIGIN` | Allowed frontend origin for Socket.IO CORS | Use the Cloudflare production frontend origin. |
| `MONGODB_URI` | MongoDB connection string | Secret. User-owned. Never print or store. |
| `MONGODB_DB_NAME` | MongoDB database name | Non-secret name, but still document only intended purpose. |
| `FIREBASE_PROJECT_ID` | Firebase Admin project id | Must match frontend Firebase project. |
| `FIREBASE_CLIENT_EMAIL` | Firebase Admin service account email | Credential metadata. Do not commit. |
| `FIREBASE_PRIVATE_KEY` | Firebase Admin private key | Secret. User-owned. Never print or store. |

Current code behavior:

- `apps/server/src/config/env.ts` validates all required backend env names on startup.
- `apps/server/src/server.ts` starts the HTTP server and Socket.IO on the same port.
- `apps/server/src/bootstrap.ts` wires Firebase Admin verification, MongoDB repositories, GridFS image/result storage, startup cleanup, HTTP CORS, and optional static frontend serving.
- Oracle backend does not need to serve the frontend when Cloudflare Pages serves `apps/web`, but static serving can remain harmless if no `apps/web/dist` is present.

## Firebase OAuth Checklist

User-owned Firebase Console checks:

- Add the Cloudflare Pages production frontend domain to Firebase Authentication authorized domains.
- Add any custom frontend domain to Firebase Authentication authorized domains before using it.
- Confirm the Firebase web app config used by Cloudflare Pages belongs to the same Firebase project as the backend Admin credentials.
- Confirm Google sign-in provider is enabled.
- Avoid adding Oracle backend-only domains as OAuth login origins unless the frontend will be served from that domain.

## CORS, Socket.IO, And URL Risks

- HTTP API CORS currently allows one configured `CLIENT_URL` origin, with localhost dev origins only outside production.
- Socket.IO CORS currently allows one configured `SOCKET_CORS_ORIGIN` origin in production.
- Cloudflare Pages preview deployments use different origins from the production domain. Initial production deployment should use one stable Cloudflare production/custom domain.
- If preview deployment QA is required, the next code task should add explicit multi-origin CORS support for `CLIENT_URL` and `SOCKET_CORS_ORIGIN` without broad wildcard origins.
- Browser clients authenticate Socket.IO with a Firebase ID token. Socket failures in deployment should check token presence, allowed origin, and reverse proxy WebSocket support first.
- Oracle ingress or reverse proxy must support WebSocket upgrade traffic for `/socket.io`.
- Cloudflare Pages must be configured with Oracle backend HTTPS URLs. A missing API URL will route production API calls to the Cloudflare Pages origin and fail.

## Health, Storage, And Runtime Risks

- Backend health endpoint: `GET /health`.
- Smoke QA should check `/health` before login/API/socket testing.
- MongoDB GridFS remains authoritative for uploaded originals and result downloads.
- Do not use Oracle local filesystem for persistent uploaded images or result images.
- Oracle startup must be able to reach MongoDB and Firebase Admin verification dependencies.
- The server performs room cleanup on boot; operational logs should remain secret-safe and avoid raw credential values.
- Large image/result generation can be CPU and memory sensitive. Oracle shape sizing should be checked with upload, round-end, gallery, and download QA.

## AI-Ready Work

AI can safely prepare:

- Multi-origin CORS support for Cloudflare production, custom, and preview domains.
- Deployment smoke scripts that check health, API auth failure behavior, and Socket.IO handshake behavior without printing tokens.
- Documentation for Oracle process manager, reverse proxy, HTTPS, and WebSocket routing.
- Cloudflare Pages build setting documentation.
- Secret-safe operational logging and health/diagnostic improvements.

User must perform:

- Oracle Cloud instance/network/security-list setup.
- Domain/DNS/HTTPS setup for Oracle backend and Cloudflare frontend.
- Firebase authorized domain registration.
- Firebase Admin service account key management and secret rotation.
- MongoDB URI creation/registration.
- Cloudflare Pages and Oracle environment variable value entry.
- Push/deploy approval and actual deployment.

## Recommended Next Implementation

First implementation task: add backend multi-origin CORS configuration support for HTTP and Socket.IO so the Oracle backend can safely allow the Cloudflare production domain and, when needed, Cloudflare preview/custom domains without using wildcard origins.

This should be done before deployed QA if the team expects to test both Cloudflare production and preview URLs. If only a single production/custom Cloudflare URL will be used at first, the current one-origin code is acceptable for initial smoke deployment.

