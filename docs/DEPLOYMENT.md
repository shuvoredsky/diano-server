# Production Deployment Guide — Render + Neon + Cloudinary (M16)

This guide provides exhaustive, production-grade instructions for deploying the DIANO E-Commerce backend onto **Render (Web Service)**, **Neon (Serverless PostgreSQL)**, and **Cloudinary (Media Storage)** without Docker or container overhead.

---

## 1. Architecture & Region Selection

| Layer | Provider | Recommended Region | Technical Rationale |
| :--- | :--- | :--- | :--- |
| **Compute** | Render Web Service (Node.js) | `Singapore (ap-southeast-1)` | Lowest latency to Bangladesh (`~40–60ms` vs `~250ms` to US/EU). |
| **Database** | Neon Serverless PostgreSQL | `AWS Singapore (ap-southeast-1)` | Co-located in the same region as Render to minimize database round-trip times during transactions. |
| **Media CDN** | Cloudinary | Global Edge CDN | Handles image optimization, WebP compression, and fast asset delivery. |

> [!IMPORTANT]
> Always deploy Render and Neon in the same region (Singapore). Placing compute in US-East and database in Singapore (or vice versa) introduces a 200ms latency penalty on every database round-trip, degrading order creation transactions.

---

## 2. Neon PostgreSQL Configuration

### A. Connection Strings: Runtime Pooled vs Direct Migration URL
Neon provides two distinct connection strings:
1. **Pooled Connection (`DATABASE_URL`):**
   - Contains `-pooler` in the host (e.g. `ep-fancy-tree-b4sqgv04-pooler.singapore.aws.neon.tech`).
   - Uses PgBouncer in transaction mode.
   - **Used exclusively by runtime application server** to multiplex connections within the 5-connection free-tier limit.
2. **Direct Connection (`DIRECT_URL`):**
   - Unpooled direct connection (e.g. `ep-fancy-tree-b4sqgv04.singapore.aws.neon.tech`).
   - Supports DDL schema adjustments, advisory locks, and shadow databases.
   - **Used exclusively for schema migrations** (`prisma migrate deploy`).

### B. Applying Database Migrations
**NEVER execute automatic migrations on application startup in production.** Running migrations on startup causes race conditions when multiple worker processes spin up and exhausts connection limits.

Execute migrations manually from local CLI or CI/CD pipeline:
```bash
# Set DIRECT_URL to Neon unpooled connection string
export DATABASE_URL="postgresql://user:pass@ep-project.singapore.aws.neon.tech/neondb?sslmode=require"

# Apply all pending migrations safely
npx prisma migrate deploy
```

### C. Database Seeding in Production
Seeding is strictly blocked by default in production (`NODE_ENV=production`) to safeguard system state. To run the initial bootstrap seed in production:
```bash
ALLOW_PRODUCTION_SEED=true npm run db:seed
```
> [!CAUTION]
> **CRITICAL SECURITY REQUIREMENT:**
> **Immediately delete or unset `ALLOW_PRODUCTION_SEED` from Render environment variables / shell after initial seeding finishes. NEVER leave `ALLOW_PRODUCTION_SEED=true` persistent in Render environment configuration.**

---

## 3. Render Web Service Setup

### Step-by-Step Configuration:
1. Log in to [dashboard.render.com](https://dashboard.render.com).
2. Click **New +** -> **Web Service**.
3. Connect your GitHub repository (`diano-ecommerce/diano-server`).
4. Configure service parameters:
   - **Name:** `diano-server`
   - **Region:** `Singapore`
   - **Branch:** `main`
   - **Root Directory:** `diano-server` (or repository root)
   - **Runtime:** `Node`
   - **Build Command:** `npm run build` *(executes `prisma generate && tsc && tsc-alias`)*
   - **Start Command:** `npm start` *(executes `node dist/server.js`)*
   - **Plan:** `Free` or `Starter`
5. **Health Check Path:** `/api/v1/health`
   *(Lightweight liveness probe that verifies HTTP responsiveness without opening database connections).*

---

## 4. Production Environment Variables Checklist

Configure all environment variables in Render Dashboard (**Environment** tab):

| Variable Name | Required | Default / Format | Description & Security Guidelines |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | **Yes** | `production` | Enables production security policies, HSTS, and error masking. |
| `PORT` | **Yes** | `10000` (Render sets) | Server listen port. |
| `API_PREFIX` | **Yes** | `/api/v1` | URL prefix for all REST endpoints. |
| `APP_NAME` | No | `diano-server` | Application display identifier. |
| `DATABASE_URL` | **Yes** | `postgresql://...-pooler...` | Neon **pooled** connection string (PgBouncer mode). |
| `DIRECT_URL` | **Yes** | `postgresql://...` | Neon **unpooled** direct connection string. |
| `DB_POOL_MAX` | No | `5` | Maximum database connection pool size (safe for free tier). |
| `JWT_ACCESS_SECRET` | **Yes** | 64-char hex string | Minimum 32 characters. Used to sign access tokens. |
| `JWT_REFRESH_SECRET` | **Yes** | 64-char hex string | Minimum 32 characters. Used to sign rotating refresh tokens. |
| `JWT_RESET_PASSWORD_SECRET` | **Yes** | 64-char hex string | Minimum 32 characters. Used for password reset tokens. |
| `COOKIE_SECRET` | **Yes** | 64-char hex string | Minimum 32 characters. Used to sign secure cookies. |
| `JOBS_SECRET` | **Yes** | 64-char hex string | Secret required in `x-jobs-secret` header for internal jobs. |
| `CLIENT_URL` | **Yes** | `https://diano.com` | Primary storefront web domain for CORS and cookies. |
| `ADMIN_URL` | **Yes** | `https://admin.diano.com` | Administrative dashboard domain for CORS and cookies. |
| `CORS_ORIGINS` | **Yes** | Comma-separated URLs | Strict allowlist of domains permitted for cross-origin API calls. |
| `BACKEND_PUBLIC_URL` | **Yes** | `https://diano-server.onrender.com` | Publicly accessible Render URL (for SSLCOMMERZ callbacks & IPN). |
| `STORAGE_DRIVER` | **Yes** | `cloudinary` | Must be `cloudinary` in production (local disk is disabled). |
| `CLOUDINARY_CLOUD_NAME` | **Yes** | Cloud name string | Cloudinary account identifier. |
| `CLOUDINARY_API_KEY` | **Yes** | API key string | Cloudinary public API key. |
| `CLOUDINARY_API_SECRET` | **Yes** | Secret string | Cloudinary private API secret. |
| `PAYMENT_ENABLED_PROVIDERS` | **Yes** | `COD,SSLCOMMERZ` | Allowed gateways (`COD,SSLCOMMERZ` only). |
| `SSLCOMMERZ_IS_SANDBOX` | **Yes** | `false` (in live production) | `true` for testing; `false` for live bank transactions. |
| `SSLCOMMERZ_STORE_ID` | **Yes** | Live Store ID | Provided by SSLCOMMERZ merchant account manager. |
| `SSLCOMMERZ_STORE_PASSWORD` | **Yes** | Live Store Password | Provided by SSLCOMMERZ merchant account manager. |
| `NOTIFICATION_EMAIL_PROVIDER` | No | `smtp` / `resend` / `brevo` | Active email transport provider. |
| `ORDER_TX_TIMEOUT_MS` | No | `15000` | Database transaction timeout (15s safe for remote DB). |

### Secret Generation Command:
Generate cryptographically strong 64-character secrets for all `*_SECRET` variables:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 5. SSLCOMMERZ Go-Live Checklist
1. Change `SSLCOMMERZ_IS_SANDBOX=false` in Render environment variables.
2. Replace sandbox Store ID and Password with official live credentials.
3. Configure the SSLCOMMERZ Merchant Portal IPN URL to:
   ```text
   https://<your-render-domain>.onrender.com/api/v1/payments/sslcommerz/ipn
   ```
4. Verify HTTP callbacks point to:
   - Success: `https://<your-render-domain>.onrender.com/api/v1/payments/sslcommerz/success`
   - Fail: `https://<your-render-domain>.onrender.com/api/v1/payments/sslcommerz/fail`
   - Cancel: `https://<your-render-domain>.onrender.com/api/v1/payments/sslcommerz/cancel`

---

## 6. Scheduled Maintenance Jobs (cron-job.org)

Render free tier lacks a built-in cron scheduler. Use [cron-job.org](https://cron-job.org) (free) to trigger internal jobs via HTTP POST with `x-jobs-secret` header.

| Job Name | Frequency | Target URL | HTTP Header | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **`process-notifications`** | Every 2 mins | `POST /api/v1/internal/jobs/process-notifications` | `x-jobs-secret: <SECRET>` | Dispatches outbox emails & SMS with exponential backoff. |
| **`reconcile-pending-payments`** | Every 5 mins | `POST /api/v1/internal/jobs/reconcile-pending-payments` | `x-jobs-secret: <SECRET>` | Verifies stranded SSLCOMMERZ sessions and marks orders paid. |
| **`cleanup-expired-orders`** | Every 15 mins | `POST /api/v1/internal/jobs/cleanup-expired-orders` | `x-jobs-secret: <SECRET>` | Cancels orders unpaid after 24h and restores reserved stock. |
| **`trigger-abandoned-recovery`** | Every 30 mins | `POST /api/v1/internal/jobs/trigger-abandoned-recovery` | `x-jobs-secret: <SECRET>` | Sends recovery notifications (respecting Dhaka quiet hours). |
| **`sync-inventory-aggregates`** | Every 1 hour | `POST /api/v1/internal/jobs/sync-inventory-aggregates` | `x-jobs-secret: <SECRET>` | Reconciles on-hand vs ledger balances across warehouses. |
| **`purge-old-notifications`** | Daily (3:00 AM) | `POST /api/v1/internal/jobs/purge-old-notifications` | `x-jobs-secret: <SECRET>` | Archives sent/dead notifications older than 90 days. |
| **`archive-stale-drafts`** | Daily (4:00 AM) | `POST /api/v1/internal/jobs/archive-stale-drafts` | `x-jobs-secret: <SECRET>` | Purges abandoned checkout sessions older than 30 days. |
| **`cleanup-expired-tokens`** | Daily (5:00 AM) | `POST /api/v1/internal/jobs/cleanup-expired-tokens` | `x-jobs-secret: <SECRET>` | Cleans up revoked auth sessions and expired refresh tokens. |

---

## 7. Render Free Tier Sleep Mitigation
Render free web services enter sleep mode after 15 minutes of inactivity. Cold starts can take `30–50 seconds`.
- **Mitigation:** Setting up `process-notifications` (every 2 minutes) on `cron-job.org` automatically keeps the Render web service warm 24/7 without extra costs.
- The `/api/v1/health` endpoint responds in `< 5ms` without touching the database, making it ideal for continuous uptime monitors (e.g. UptimeRobot or BetterStack).

---

## 8. Backup & Disaster Recovery

### Creating a Database Backup:
```bash
npm run db:backup
```
- Dumps all tables to `backups/diano-db-backup-<timestamp>.json` with complete row integrity.
- Never prints or logs connection strings or credentials.

### Neon Point-in-Time Recovery (PITR) & Instant Branching:
Neon provides automated continuous point-in-time recovery for up to 7 days:
1. In the Neon Console, navigate to **Project** -> **Branches**.
2. Select **Create Branch** -> **Restore to Point in Time**.
3. Select the exact minute prior to an incident to instantly create an isolated, fully functional database clone.

