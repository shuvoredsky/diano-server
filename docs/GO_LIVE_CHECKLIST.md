# DIANO Production Go-Live Operational Checklist (M16)

Use this checklist as the final gatekeeper prior to launching the DIANO platform into public production.

---

## Pre-Launch Verification Matrix

### 1. Domain, Network & TLS
- [ ] Custom domain connected to Render Web Service (`api.diano.com` or `diano.com`).
- [ ] TLS certificate issued and active (Render managed Let's Encrypt with auto-renewal).
- [ ] HSTS enabled with `max-age=31536000; includeSubDomains; preload`.
- [ ] `trust proxy: 1` active in `src/app.ts` so client IP is accurately forwarded to rate limiters.

### 2. Database & Connection Management (Neon Singapore)
- [ ] Neon database created in Singapore (`ap-southeast-1`) matching Render web service region.
- [ ] Runtime `DATABASE_URL` uses PgBouncer pooled connection (`-pooler`).
- [ ] Migration `DIRECT_URL` points to direct unpooled connection.
- [ ] All 6 migrations applied via `npx prisma migrate deploy` (zero pending migrations).
- [ ] Initial system seed executed with `ALLOW_PRODUCTION_SEED=true`.
- [ ] `SEED_ADMIN_PASSWORD` removed from production environment variables.
- [ ] `DB_POOL_MAX` set to `5` (concurrency-safe for Neon free tier).
- [ ] `ORDER_TX_TIMEOUT_MS` set to `15000` (15s timeout for high-concurrency order creation).

### 3. Security & Access Control
- [ ] All `*_SECRET` values (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `COOKIE_SECRET`, `JOBS_SECRET`) generated with 64-character cryptographic randomness (`crypto.randomBytes(32)`).
- [ ] CORS origins restricted strictly to `CLIENT_URL` and `ADMIN_URL` (`*` wildcard strictly forbidden in production).
- [ ] Cookies configured with `SameSite=None; Secure; HttpOnly` in production.
- [ ] Route permission matrix verified (`npm run audit:routes` shows 0 unprotected admin routes).
- [ ] Local disk upload adapter disabled; Cloudinary credentials active and verified.

### 4. Payments (SSLCOMMERZ Live Integration)
- [ ] `SSLCOMMERZ_IS_SANDBOX` set to `false`.
- [ ] Live `SSLCOMMERZ_STORE_ID` and `SSLCOMMERZ_STORE_PASSWORD` verified.
- [ ] SSLCOMMERZ Merchant Portal IPN callback URL configured to:
  `https://api.diano.com/api/v1/payments/sslcommerz/ipn`
- [ ] Test live transaction executed with nominal amount (10 BDT) and refunded.

### 5. Scheduled Maintenance Jobs (cron-job.org)
- [ ] 8 internal jobs configured on [cron-job.org](https://cron-job.org) with header `x-jobs-secret: <SECRET>`:
  - `process-notifications` (every 2 mins)
  - `reconcile-pending-payments` (every 5 mins)
  - `cleanup-expired-orders` (every 15 mins)
  - `trigger-abandoned-recovery` (every 30 mins)
  - `sync-inventory-aggregates` (hourly)
  - `purge-old-notifications` (daily at 3:00 AM)
  - `archive-stale-drafts` (daily at 4:00 AM)
  - `cleanup-expired-tokens` (daily at 5:00 AM)
- [ ] Ping frequency ensures Render web service never sleeps during peak business hours.

### 6. Notifications & Communications
- [ ] Production email provider configured (`Resend`, `Brevo`, or `SMTP`).
- [ ] Email templates verified in both English and Bengali (`en` and `bn`).
- [ ] Unsubscribe links (`/api/v1/notifications/unsubscribe`) working with HMAC signature tokens.
- [ ] Quiet hours guard verified (no non-essential marketing SMS between 9:00 PM and 9:00 AM Asia/Dhaka).

### 7. Observability & Monitoring
- [ ] Health check probe configured at `/api/v1/health` in Render dashboard.
- [ ] External uptime monitor active (UptimeRobot, BetterStack) pinging `/api/v1/health` every 5 minutes.
- [ ] Slow request logger verified (>1000ms logs warnings in stdout).
- [ ] Uncaught exception and unhandled rejection handlers active with graceful shutdown.

### 8. Backup & Disaster Recovery
- [ ] Baseline database backup generated via `npm run db:backup`.
- [ ] Neon Point-in-Time Recovery (PITR) verified in Neon Console.
- [ ] Escalation contact list established for system administrators.

