# DIANO Security Audit Checklist & Verification Report (M15)

This document provides a systematic security audit covering all critical vulnerability vectors, proof references (integration tests and source code implementations), and production hardening status.

---

## 1. Security Vectors & Verification Matrix

| Vulnerability Vector | Status | Proof / Reference | Mechanism & Enforcement |
| :--- | :--- | :--- | :--- |
| **1. Auth Abuse & Credential Stuffing** | **PASS** | `src/middlewares/auth-rate-limiter.middleware.ts`<br>`tests/unit/auth.middleware.test.ts` | 5 failed attempts lockout (15-min window), exponential backoff, rate limit per IP and identifier. |
| **2. Broken Access Control (RBAC)** | **PASS** | `scripts/generate-route-matrix.ts`<br>`tests/integration/security-route-matrix.integration.test.ts` | Automated script checks all 272 routes. Zero unprotected admin routes. Granular RBAC (`requirePermission`) on all admin controllers. |
| **3. Insecure Direct Object References (IDOR)** | **PASS** | `src/modules/orders/orders.service.ts`<br>`src/modules/returns/returns.service.ts`<br>`src/modules/cart/cart.service.ts` | Scoped by `customerId` / `userId`. Non-owners receive 403 Forbidden. Guest checkout validated using cryptographically signed `checkoutSecret`. |
| **4. SQL Injection (SQLi)** | **PASS** | `src/config/database.ts`<br>`prisma/schema.prisma` | Zero string-interpolated raw SQL. All dynamic queries use Prisma ORM or parameterized `$1, $2` via pgPool (`src/modules/internal/internal-jobs.service.ts`). |
| **5. Cross-Site Scripting (XSS)** | **PASS** | `src/utils/sanitizer.ts`<br>`tests/unit/specifications-sanitizer.test.ts` | Strict HTML sanitization using `sanitize-html`. Disallows executable scripts, inline event handlers, `javascript:` and `data:` URIs. |
| **6. Cross-Site Request Forgery (CSRF) & CORS** | **PASS** | `src/app.ts`<br>`src/middlewares/csrf.middleware.ts`<br>`tests/unit/render-readiness.unit.test.ts` | Strict CORS origin allowlist (`CLIENT_URL`, `ADMIN_URL`). HttpOnly cookies with `SameSite=None; Secure` in production (`SameSite=Lax` in dev). Origin header validation on mutations. |
| **7. Brute Force & Rate Limiting** | **PASS** | `src/middlewares/rate-limiter.middleware.ts`<br>`src/modules/products/products.routes.ts`<br>`src/modules/orders/orders.routes.ts` | Rate limits across all entry points: base limiter (100 req/15min), auth (5 req/15min), search (60 req/min), order tracking (10 req/15min), checkout (30 req/15min). |
| **8. Refresh Token Theft & Reuse Detection** | **PASS** | `src/modules/auth/auth.service.ts`<br>`tests/unit/auth.session-revocation.test.ts` | Rotating refresh tokens with SHA-256 token hashing. Reuse detection immediately revokes the entire user token family and logs security alerts. |
| **9. Webhook Spoofing & Replay (SSLCOMMERZ)** | **PASS** | `src/modules/payments/gateways/sslcommerz.gateway.ts`<br>`tests/integration/payments.integration.test.ts` | Server-to-server validation query (`validateOrder`) directly with SSLCOMMERZ gateway. Stores validation payload; idempotent IPN deduplication blocks replay attacks. |
| **10. Concurrency & Race Conditions** | **PASS** | `tests/integration/orders.integration.test.ts`<br>`tests/integration/order-ops.integration.test.ts` | Atomic stock reservation with `pg_try_advisory_xact_lock` and SELECT FOR UPDATE. Coupon max-usage race condition (5 parallel requests => exactly 1 success). |
| **11. File Upload Security** | **PASS** | `src/middlewares/upload.middleware.ts`<br>`tests/unit/cloudinary-slots.test.ts` | Strict MIME type allowlist (`image/jpeg`, `image/png`, `image/webp`). Max file size limit (2MB/5MB). Magic bytes validation. Local storage disabled in production (Cloudinary only). |
| **12. Sensitive Data Exposure** | **PASS** | `src/modules/products/products.controller.ts`<br>`tests/integration/security-route-matrix.integration.test.ts` | Scanned responses for `passwordHash`, `tokenHash`, `costPrice`, `clientSecret`. Non-admin users never receive `costPrice` or margin information. |
| **13. Privilege Escalation** | **PASS** | `src/modules/roles/roles.service.ts`<br>`tests/unit/roles.service.test.ts` | SUPER_ADMIN role immutability. Users cannot grant permissions higher than their own hierarchy. Self-role modification blocked. |
| **14. Log Redaction & PII Leakage** | **PASS** | `src/utils/logger.ts`<br>`tests/integration/notifications.integration.test.ts` | Pino logger redacts `password`, `token`, `authorization`, `cookie`, and `cvv`. Phone and email masked in audit logs. |
| **15. Prototype Pollution & Payload DoS** | **PASS** | `src/middlewares/security-guard.middleware.ts`<br>`tests/integration/security-route-matrix.integration.test.ts` | Recursive inspection rejects `__proto__`, `constructor`, `prototype`. JSON nesting depth capped at 10. JSON request body capped at 1MB. |

---

## 2. Dependency Vulnerability Audit (`npm audit`)
- **Critical Severity:** 0
- **High Severity:** 0
- **Moderate Severity:** 20 (All transitive inside development tooling: `eslint`/`minimatch` and `exceljs` internal `uuid`).
  - *Justification:* Dev dependencies (`eslint`, `@typescript-eslint`) are not shipped to production (`npm prune --production`). `exceljs` is used exclusively for server-side administrative report exports with internally sanitized strings, with no exposed user-controlled buffer operations.

---

## 3. Production Secrets & Startup Guardrails
- **JWT & Cookie Secrets:** Must be ≥ 32 characters in length. Validated at boot by Zod schema and `validateEnv()`.
- **Production Seed Block:** Seeding is blocked if `NODE_ENV === 'production'` unless explicitly overridden with `ALLOW_PRODUCTION_SEED=true`.
- **Seed Password Guard:** If `SEED_ADMIN_PASSWORD` is present in a production environment, a warning is emitted at boot.
- **Render Single-Instance Rate Limiter Note:** The current rate limiter uses an in-memory sliding window store suitable for Render single-instance deployments. For multi-instance scaling, swap to Redis or Upstash rate-limit store.
