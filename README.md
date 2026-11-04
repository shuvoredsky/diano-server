# DIANO Server (Backend API)

DIANO is an enterprise-grade e-commerce backend platform built as a clean Modular Monolith using TypeScript, Express, Prisma ORM, Redis, and BullMQ.

---

## 🛠️ Technology Stack
- **Runtime:** Node.js (v20+ / v24 LTS)
- **Language:** TypeScript 5+ (Strict Mode)
- **Framework:** Express.js 5
- **ORM:** Prisma Client & Schema
- **Cache & Queues:** Redis (ioredis), BullMQ
- **Logging:** Pino with Pino-HTTP (Sensitive data redaction enabled)
- **Validation:** Zod
- **Testing:** Vitest & Supertest
- **Linting & Formatting:** ESLint (Flat Config) & Prettier

---

## 📁 Project Structure

```
diano-server/
├── prisma/               # Prisma schema & seed scripts
├── src/
│   ├── config/           # Validated env, DB client, Redis client
│   ├── constants/        # System & domain constants
│   ├── docs/             # API specifications & schema documentation
│   ├── jobs/             # BullMQ queue processors & background workers
│   ├── middlewares/      # Error handler, rate limiter, request-id, not-found
│   ├── modules/          # Modular domain slices (auth, products, orders, etc.)
│   ├── routes/           # Express routers (central rootRouter & health routes)
│   ├── services/         # Shared cross-cutting domain services
│   ├── sockets/          # Socket.io real-time event handlers
│   ├── types/            # Shared TypeScript type definitions
│   ├── utils/            # ApiResponse, AppError, date.util, currency.util, logger
│   ├── app.ts            # Express application setup
│   └── server.ts         # HTTP server entrypoint with graceful shutdown
├── tests/
│   ├── unit/             # Isolated unit tests
│   └── integration/      # API endpoint integration tests
├── .env.example          # Environment variable template
├── .gitignore            # Git ignore specification
├── eslint.config.mjs     # ESLint flat configuration
├── tsconfig.json         # Strict TypeScript configuration
└── vitest.config.ts      # Vitest configuration with path aliases
```

---

## 🚀 Quick Start (Local Setup)

### 1. Prerequisites
- Node.js `v20+` or `v24 LTS`
- npm `v10+`

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure strong secrets are defined for `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_RESET_PASSWORD_SECRET`, and `COOKIE_SECRET`.

### 4. Available Scripts

| Script | Description |
|:---|:---|
| `npm run dev` | Starts server with `tsx watch` for hot-reloading |
| `npm run build` | Compiles TypeScript into `dist/` |
| `npm start` | Runs compiled production server from `dist/server.js` |
| `npm run typecheck` | Validates TypeScript types across the codebase |
| `npm run lint` | Runs ESLint flat config |
| `npm test` | Runs all Vitest test suites |
| `npm run test:watch` | Runs Vitest in interactive watch mode |
| `npm run prisma:generate`| Generates Prisma client types |
| `npm run storage:check` | Diagnostics: Tests Cloudinary credentials, uploads a probe image, and verifies cleanup |

---

## ☁️ Storage Diagnostics (Cloudinary)

To safely verify Cloudinary signed upload and deletion without leaking credentials:
```bash
npm run storage:check
```
- **If configured:** Uploads a 1x1 probe image to `diano/diagnostics`, prints the generated secure URL and responsive variants, and immediately destroys the test asset.
- **If not configured:** Prints a clean diagnostic message and exits without error.
- **Security:** Secret keys and API secrets are never output or logged.

---

## 🩺 Health & Readiness Probes

- **Liveness Probe:** `GET /api/v1/health`
  - Returns `200 OK` if the HTTP server is alive. Works completely independently of external infrastructure.
- **Readiness Probe:** `GET /api/v1/ready`
  - Checks PostgreSQL database and Redis connectivity.
  - Returns `200 OK` when both dependencies are ready.
  - Returns `503 Service Unavailable` with details when any dependency is disconnected.

---

## 🔌 Database Configuration & Neon Migrations
 
### Connection Modes: Pooled vs. Direct
Neon PostgreSQL provides two distinct connection URLs:
1. **`DATABASE_URL` (Pooled):** Contains `-pooler` in the host (e.g. `ep-xyz-pooler.eastus2.azure.neon.tech`). Connects via PgBouncer transaction mode. **Used at application runtime** by Express to handle high-concurrency requests without exhausting connection limits.
2. **`DIRECT_URL` (Unpooled):** Direct connection to the compute endpoint without `-pooler`. **Used by Prisma CLI for migrations and schema introspection**.

### Why Prisma Migrate Requires a Direct Connection (Shadow DB)
During `npx prisma migrate dev`, Prisma automatically spins up a temporary **Shadow Database** to detect schema drift and validate new migrations.
Because PgBouncer in transaction mode does not support session-level PostgreSQL operations (`CREATE DATABASE`, advisory locks, session variables), running migrations against a pooled connection will fail or hang.

To handle this cleanly:
- **Approach 1 (Recommended):** Set `DIRECT_URL` in `.env` pointing to your Neon unpooled connection. `prisma.config.ts` automatically uses `DIRECT_URL` for migration commands.
- **Approach 2 (Automatic Fallback):** If `DIRECT_URL` is omitted, `prisma.config.ts` automatically strips `-pooler` from `DATABASE_URL` to derive the direct compute endpoint.
- **Approach 3 (Dedicated Shadow DB):** If using a cloud provider with restricted database creation privileges, configure a separate existing database URL in `SHADOW_DATABASE_URL`.

```env
# Runtime pooled connection (PgBouncer)
DATABASE_URL="postgresql://user:pass@ep-xyz-pooler.eastus2.azure.neon.tech/neondb?sslmode=require"

# Direct unpooled connection for Prisma migrations & DDL
DIRECT_URL="postgresql://user:pass@ep-xyz.eastus2.azure.neon.tech/neondb?sslmode=require"

# Dedicated test database for integration testing (never main DB)
TEST_DATABASE_URL="postgresql://user:pass@ep-test-pooler.eastus2.azure.neon.tech/neondb_test?sslmode=require"
```

---

## 💳 Payment Gateway (SSLCOMMERZ & COD)

### 1. Diagnostic Sandbox Check
To test your SSLCOMMERZ sandbox session initiation safely without printing secrets:
```bash
npm run payment:sandbox-check
```
- Calls `https://sandbox.sslcommerz.com/gwprocess/v4/api.php` with sandbox credentials.
- Prints the generated `GatewayPageURL` and `sessionkey`.
- Secret passwords and API keys are strictly redacted and never output.

### 2. Official SSLCOMMERZ Sandbox Test Cards
Use these sandbox cards from the [official SSLCOMMERZ developer docs](https://developer.sslcommerz.com/doc/v4/):

| Card Brand | Card Number | Expiry | CVV | OTP |
| :--- | :--- | :--- | :--- | :--- |
| **VISA** | `4111 1111 1111 1111` | `12/26` | `111` | `111111` |
| **Mastercard** | `5111 1111 1111 1111` | `12/26` | `111` | `111111` |
| **AMEX** | `3711 1111 1111 111` | `12/26` | `111` | `111111` |

### 3. Local Webhook & IPN Testing via Tunnel
Because SSLCOMMERZ IPN notifications are server-to-server POST webhooks, SSLCOMMERZ must be able to reach your local backend.
1. Start an HTTPS tunnel using **ngrok** or **cloudflared**:
   ```bash
   # Option A: ngrok
   ngrok http 5000

   # Option B: Cloudflare Tunnel
   cloudflared tunnel --url http://localhost:5000
   ```
2. Set your public tunnel URL in `.env`:
   ```env
   BACKEND_PUBLIC_URL="https://your-tunnel-subdomain.ngrok-free.app"
   ```
3. SSLCOMMERZ session initialization will automatically register `${BACKEND_PUBLIC_URL}/api/v1/payments/sslcommerz/ipn` as the IPN listener.
4. When testing in the sandbox browser page, successful test payments trigger both customer redirect and asynchronous server-to-server IPN callbacks.

### 4. Zero-Trust Security Model
- **Zero Client Trust:** Browser redirect callbacks (`/payments/sslcommerz/success`) are never trusted on payload status alone. The server invokes SSLCOMMERZ Order Validation API (`validationserverAPI.php`) with `val_id` to verify amount, currency, and status.
- **Cryptographic IPN Signature:** Incoming IPN requests verify MD5 hash over sorted `verify_key` parameter list concatenated with `MD5(store_passwd)`.
- **Replay Protection:** `PaymentEvent` enforces a unique database constraint on `(provider, eventId)` to eliminate duplicate processing.
- **Strict Stock Commitment:** Stock reservation is committed exactly once upon payment confirmation within an atomic PostgreSQL transaction.

---

## 🚀 Production Deployment (Render + Neon + Cloudinary)

### 1. Render Blueprint & Setup
This repository includes a [`render.yaml`](./render.yaml) blueprint for one-click deployment as a Render Web Service.

- **Service Type:** Web Service
- **Runtime:** Node.js (`>=20.0.0`)
- **Build Command:** `npm run build` (`prisma generate && tsc && tsc-alias`)
- **Start Command:** `npm run start` (`node dist/server.js`)
- **Health Check Path:** `/api/v1/health` (also available at `/health` for root liveness probes)
- **Proxy Configuration:** `app.set('trust proxy', 1)` is enabled by default to trust Render's reverse proxy and capture real client IPs in rate limiters and logs.

### 2. Database Migration Strategy (Strictly Manual/CI — Never on Startup)
> [!IMPORTANT]
> **Prisma migrations must NEVER run automatically on application startup in production.**
> Render free-tier instances sleep after 15 minutes of inactivity. Running `prisma migrate deploy` at runtime can cause race conditions during horizontal scaling, increase cold-start latency, and exhaust pooled database connection limits.

To deploy schema migrations to your Neon database:
1. Run migrations manually from your local terminal or CI/CD pipeline using the unpooled `DIRECT_URL`:
   ```bash
   DIRECT_URL="postgresql://user:pass@ep-xyz.eastus2.azure.neon.tech/neondb?sslmode=require" npx prisma migrate deploy
   ```
2. Verify migration status:
   ```bash
   DIRECT_URL="postgresql://user:pass@ep-xyz.eastus2.azure.neon.tech/neondb?sslmode=require" npx prisma migrate status
   ```

### 3. Render Free Tier Limitations & Neon Cold Starts
- **Render Free Tier Spin-Down:** Free web services sleep after 15 minutes of zero traffic. When an incoming request arrives, Render takes 30–60 seconds to spin up the container.
- **Neon Serverless Cold Starts:** Neon free compute branches suspend after 5 minutes of inactivity. When resuming, connection handshakes may take 1–3 seconds.
- **Connection Retry & Pool Sizing:**
  - `DB_POOL_MAX` is configured to `5` by default to prevent exhausting Neon connection limits on free-tier instances.
  - `DB_CONNECTION_TIMEOUT_MS` defaults to `30000` (30s).
  - `checkDatabaseHealth` implements automatic exponential backoff retry to gracefully survive Neon cold-start wakeups.

### 4. Cloud Region Co-location (Neon & Render in Singapore Recommended)
> [!TIP]
> **Always co-locate your Render Web Service and Neon PostgreSQL database in the same geographical region (Singapore `ap-southeast-1` / `singapore` recommended for Bangladesh audience).**
>
> - **The Latency Problem:** PostgreSQL interactive transactions (`prisma.$transaction`) execute multiple queries sequentially within an active backend connection. If Render is hosted in Singapore and Neon is in US-East (`eastus2`), every single database query incurs a cross-continent network roundtrip of 200–300ms. A transaction with 6 sequential queries will spend 1.5–2.0 seconds purely in transatlantic wire latency, holding database locks and risking timeouts.
> - **The Co-location Solution:** Co-locating both services in Singapore drops inter-service ping to < 5ms. The entire atomic order placement transaction finishes in under 50–100ms, freeing database connection pool slots immediately and eliminating timeouts.

### 4. SSLCOMMERZ Public URLs & The Critical Need for Reconcile Jobs
- **`BACKEND_PUBLIC_URL`:** In production, set this to your Render service URL (e.g. `https://diano-server.onrender.com`). SSLCOMMERZ will use this domain for success, fail, cancel redirects and asynchronous IPN callbacks.
- **Why the Reconcile Job is Critical on Free Tier:**
  If a customer completes payment while the Render container is sleeping or during a cold start, incoming SSLCOMMERZ IPN callbacks might time out or fail.
  The internal maintenance job `POST /api/v1/internal/jobs/reconcile-payments` queries SSLCOMMERZ's order validation API for orphan pending transactions and synchronizes payment states reliably, ensuring zero lost orders.

### 5. Scheduled Maintenance Jobs via External Cron (e.g. cron-job.org)
Because Render free tier does not support persistent background daemons, scheduled tasks are triggered via HTTP using external cron services such as [cron-job.org](https://cron-job.org).

- **Endpoint:** `POST https://diano-server.onrender.com/api/v1/internal/jobs/:name`
- **Authentication Header:** `x-jobs-secret: <JOBS_SECRET>` (or `Authorization: Bearer <JOBS_SECRET>`)
- **Security:** Requires a strong secret (`JOBS_SECRET` ≥ 32 characters) compared with constant-time equality. Fails closed (401) if unconfigured.
- **Concurrency & Idempotency:** Guarded by PostgreSQL advisory locks (`pg_try_advisory_lock`). Overlapping triggers return `SKIPPED_ALREADY_RUNNING` without error.

#### Recommended Schedule:
| Job Name | Frequency | Recommended Provider | Purpose |
| :--- | :--- | :--- | :--- |
| `reconcile-payments` | Every 10–15 mins | cron-job.org | Resolves pending/stalled SSLCOMMERZ transactions, handles cold-start missed IPNs |
| `cancel-expired-orders` | Every 30 mins | cron-job.org | Cancels unpaid orders past payment deadline and releases reserved inventory |
| `classify-abandoned` | Every 15 mins | cron-job.org | Marks inactive checkout funnels (>30 min) as abandoned for analytics and recovery |
| `release-expired-reservations` | Every 10 mins | cron-job.org | Releases expired variant stock reservations back into available inventory |
| `cleanup-guest-carts` | Once daily (e.g. 03:00 UTC) | cron-job.org | Purges orphan guest carts older than 30 days |
| `purge-checkout-pii` | Once daily (e.g. 04:00 UTC) | cron-job.org | Anonymizes customer PII from expired checkout sessions older than 90 days |
| `process-notifications` | Every 2-5 mins | cron-job.org | Drains pending Postgres notification outbox queue with exponential backoff & dead-letter tracking |
| `purge-old-notifications` | Once daily (e.g. 05:00 UTC) | cron-job.org | Purges sent/delivered/dead notifications older than 180 days |

### 6. Real-Time Socket.IO & Render Free-Tier Sleep Handling
Diano uses an in-memory single-instance Socket.IO server connected to an internal decoupled `eventBus`.
- **Authentication Handshake:** Pass JWT access token via `auth: { token: "<access_token>" }` or standard Authorization header. Revoked/expired sessions are rejected at the handshake.
- **Server-Controlled Rooms:**
  - `user:<id>`: Automatically assigned to customer for their private order and in-app notifications.
  - `admin:all`: Joined by administrative staff.
  - `admin:perm:<slug>`: Dynamically joined based on assigned permissions (e.g., `admin:perm:order:read`, `admin:perm:fraud:manage`, `admin:perm:inventory:manage`).
  - Client-initiated arbitrary room joins (`socket.emit('join')`) are strictly forbidden and rejected.
- **Render Sleep & Reconnection Guide:**
  When Render free web services sleep after 15 minutes of idle time, active WebSocket connections disconnect. Frontend clients must configure automatic reconnection with exponential backoff:
  ```typescript
  import { io } from 'socket.io-client';

  const socket = io(process.env.NEXT_PUBLIC_API_URL, {
    auth: { token: userAccessToken },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
    transports: ['websocket', 'polling'],
  });
  ```
  When the Render container wakes upon incoming user interaction, the client automatically reconnects, re-runs the handshake verification, and rejoins all authorized rooms seamlessly.


