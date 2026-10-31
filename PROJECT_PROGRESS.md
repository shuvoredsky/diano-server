# DIANO Backend — Project Progress Tracker

## Project Overview
- **Repository:** `diano-ecommerce / diano-server`
- **Architecture:** Modular Monolith (Route -> Controller -> Service -> Repository -> Zod Validation)
- **Runtime:** Node.js v24.11.0
- **Language & Framework:** Strict TypeScript (ESM NodeNext), Express.js 5, Prisma ORM 7, Pino, Vitest
- **Execution Mode:** **No-DB Mode** (PostgreSQL/Neon & Redis connections deferred; all business logic validated via isolated repository mocking and strict unit testing)

---

## Milestone Progress

| Milestone | Description | Status | Notes |
|:---|:---|:---:|:---|
| **M1: Project Setup & Core Foundation** | Base project, strict TypeScript, ESLint flat config, Prettier, Pino logger with redaction, Zod env validation, AppError, ApiResponse, Date & Currency utils, Health/Readiness endpoints, Vitest test suite | ✅ Completed | Fully functional without requiring local DB/Redis running |
| **M2: Prisma Data Modeling** | Complete Prisma 7 schema (48 models, 19 enums), Decimal(12,2) money, cuid IDs, immutable order item snapshots, double-entry stock movement ledger, payment events, idempotency keys, safe idempotent seed script, docs/SCHEMA_SUMMARY.md | ✅ Completed | Schema validated & formatted; Client generated; Seed script ready |
| **M2b: Database Migration & Seed** | Run migrations on live Neon database, apply SQL CHECK constraints, run idempotent seed | ⏸️ Deferred | Deferred by user request until DB connectivity is re-established |
| **M3: Auth & Identity (No-DB Mode)** | JWT access tokens (15m), rotating opaque refresh tokens (SHA-256 hashed in DB), refresh token family reuse detection, account lockout, RBAC (`authorize`), permission middleware (`requirePermission`), anti-enumeration generic responses, single-use password reset, in-memory rate limiting, Swagger UI | ✅ Completed | 68 unit tests passed, 5 DB integration tests skipped (DB required) |
| **M4: Catalog & Inventory** | Categories, products, variants, SKU, stock movement ledger | ⏳ Queued Next | Awaiting user instruction |
| **M5: Cart & Checkout** | Cart sessions, abandoned cart tracking, atomic stock reservations | ⏳ Queued | Planned |
| **M6: Orders & Payments** | Order state machine, payment events, idempotency keys, refunds | ⏳ Queued | Planned |

---

## M3 Authentication & Authorization Specification (No-DB Mode)

### 1. Endpoints Implemented

| Method | Endpoint | Protection / Middlewares | Description |
|:---|:---|:---|:---|
| `POST` | `/api/v1/auth/register` | `authRateLimiter` | Register customer account with email/phone & Zod password policy |
| `POST` | `/api/v1/auth/login` | `authRateLimiter` | Universal credential authentication (resets failed count, checks lockout) |
| `POST` | `/api/v1/auth/admin/login` | `authRateLimiter` | Dedicated admin portal login (requires administrative/staff role) |
| `POST` | `/api/v1/auth/refresh` | `refreshRateLimiter`, `verifyCookieOrigin` | Rotate refresh token; detects token reuse and revokes entire family |
| `POST` | `/api/v1/auth/logout` | `optionalAuthenticate` | Revoke active refresh token family and invalidate session |
| `POST` | `/api/v1/auth/logout-all` | `authenticate` | Terminate all active sessions across all devices for current user |
| `POST` | `/api/v1/auth/forgot-password` | `authRateLimiter` | Request password reset link (anti-enumeration generic response) |
| `POST` | `/api/v1/auth/reset-password` | `authRateLimiter` | Reset password using single-use token; terminates all active sessions |
| `POST` | `/api/v1/auth/verify-email` | None | Verify customer email address with single-use token |
| `POST` | `/api/v1/auth/otp/send` | `authRateLimiter` | Send 6-digit numeric OTP |
| `POST` | `/api/v1/auth/otp/verify` | `authRateLimiter` | Verify 6-digit numeric OTP with attempt limits (3 max) |
| `POST` | `/api/v1/auth/change-password` | `authenticate` | Change account password; revokes all existing sessions |
| `GET` | `/api/v1/auth/me` | `authenticate` | Retrieve current user profile and role slugs |
| `PATCH` | `/api/v1/auth/me` | `authenticate` | Update current user profile (name, phone, avatarUrl) |
| `GET` | `/api/v1/auth/login-history` | `authenticate` | Retrieve recent login history (status, IP, userAgent, timestamp) |
| `GET` | `/api/docs` | Non-production | Interactive Swagger / OpenAPI 3.0 API documentation |

### 2. Security Decisions & Implementation
- **Password Security:** Salt rounds configurable via `BCRYPT_ROUNDS` (default 12). Rehash-on-login detects outdated hashes and upgrades them dynamically upon successful login.
- **Token Security:** Short-lived access token (15m) containing `{ userId, sessionId, roles, email }`. Refresh tokens are random opaque strings stored **only as SHA-256 hashes** in the database.
- **Refresh Token Rotation & Reuse Detection:** New refresh token issued on every refresh; old token marked `usedAt`. If an already used token is submitted, the entire token family (`familyId`) is immediately revoked, all sessions killed, and an audit alert logged.
- **Cookie Security:** Refresh token delivered via `HttpOnly`, `SameSite: 'lax'`, `path: '/api/v1/auth'`, and `Secure: true` in production. Protected against CSRF via `verifyCookieOrigin` middleware.
- **Account Lockout & Anti-Enumeration:** Account locked for `LOCKOUT_DURATION_MINUTES` after `MAX_LOGIN_ATTEMPTS` consecutive failed attempts. Generic error messages prevent user enumeration.
- **RBAC & Permissions:** Role check via `authorize(...roles)`. Granular permission check via `requirePermission('resource:action')` backed by `PermissionsCache` (5-minute TTL). `super-admin` unconditionally bypasses checks.
- **Audit Logging:** Admin logins, password resets, logout-all, and token reuse attacks are logged to `AuditLog` with sanitized metadata (secrets, passwords, and tokens stripped).
- **Email Service Adapter:** Console / Dev adapter active (`ConsoleEmailService`), redacting tokens in production logs.

---

## DB Verification Pending (To be executed once Neon / Database is active)

The following items have been fully written and architected according to Prisma schemas and interfaces, but have **not yet been executed against a live database instance**:

1. **Database Migrations:**
   - Execute `npx prisma migrate dev --name init` on Neon database.
   - Verify raw SQL CHECK constraints (`onHand >= 0`, `reserved >= 0`, `damaged >= 0`, `reserved <= onHand`, `rating >= 1 AND rating <= 5`, `riskScore >= 0 AND riskScore <= 100`, non-negative financial decimals, positive quantities).
2. **Database Seeding:**
   - Run `npm run db:seed` to verify creation of 7 standard roles (`super-admin`, `admin`, `manager`, `order-manager`, `inventory-manager`, `support-staff`, `customer`), system permissions, super-admin account, primary warehouse, and shipping zones.
3. **Integration Tests Execution:**
   - Run `npm test -- tests/integration/auth.integration.test.ts` against a dedicated test database (`TEST_DATABASE_URL`).
   - Validate live HTTP cookie setting, session row creation, refresh token rotation row updates, and cascaded revocation.
4. **Database Indexes & Constraints:**
   - Verify unique constraint on `User.email` and `User.phone`.
   - Verify index lookups on `Session.tokenHash`, `RefreshToken.tokenHash`, and `RefreshToken.familyId`.
   - Verify foreign key cascades when a user or session is deleted.

---

## Test Verification Summary
- **Unit Tests Passed:** 68 passed (100% of non-DB unit tests)
  - `password.util.test.ts`: 3 passed
  - `token.util.test.ts`: 3 passed
  - `jwt.util.test.ts`: 5 passed
  - `auth.service.test.ts`: 19 passed
  - `auth.middleware.test.ts`: 14 passed
  - `currency.util.test.ts`: 8 passed
  - `date.util.test.ts`: 5 passed
  - `env.config.test.ts`: 3 passed
  - `api-response.test.ts`: 4 passed
  - `health.test.ts`: 4 passed
- **Integration Tests Skipped:** 5 skipped (`tests/integration/auth.integration.test.ts` skipped via `describe.skipIf(!process.env.TEST_DATABASE_URL)`). **No skipped test was marked as passed.**
