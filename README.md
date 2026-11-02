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

