# DIANO Backend — Project Progress Tracker

## Project Overview
- **Repository:** `diano-ecommerce / diano-server`
- **Architecture:** Modular Monolith (Route -> Controller -> Service -> Repository)
- **Runtime:** Node.js v24.11.0
- **Language & Framework:** Strict TypeScript, Express.js, Prisma ORM, Redis (ioredis), BullMQ, Pino

---

## Milestone Progress

| Milestone | Description | Status | Notes |
|:---|:---|:---:|:---|
| **M1: Project Setup & Core Foundation** | Base project, strict TypeScript, ESLint flat config, Prettier, Pino logger with redaction, Zod env validation, AppError, ApiResponse, Date & Currency utils, Health/Readiness endpoints, Vitest test suite | ✅ Completed | Fully functional without requiring local DB/Redis running |
| **M2: Prisma Data Modeling** | Complete Prisma 7 schema (48 models, 19 enums), Decimal(12,2) money, cuid IDs, immutable order item snapshots, double-entry stock movement ledger, payment events, idempotency keys, safe idempotent seed script, docs/SCHEMA_SUMMARY.md | ✅ Completed | Schema validated & formatted; Client generated; Seed ready (DB migration pending) |
| **M3: Auth & Identity** | JWT auth, refresh token rotation, RBAC, session management, secure cookie, rate-limited auth endpoints | ⏳ Pending Next | Awaiting Phase / User "continue M3" signal |
| **M4: Catalog & Inventory** | Categories, products, variants, SKU, stock movement ledger | ⏳ Queued | Planned |
| **M5: Cart & Checkout** | Cart sessions, abandoned cart tracking, atomic stock reservations | ⏳ Queued | Planned |
| **M6: Orders & Payments** | Order state machine, payment events, idempotency keys, refunds | ⏳ Queued | Planned |

---

## M1 Core Architectural Decisions

1. **Monetary Precision:**
   - All financial numbers use `Decimal.js` (`precision: 20`, `ROUND_HALF_UP`).
   - Default currency is set to `BDT` with standard two-decimal formatted outputs (`BDT 1,250.00`).
2. **Timezone Uniformity:**
   - Default business timezone is locked to `Asia/Dhaka` (+06:00) using `date-fns-tz`.
3. **Resilience without Infrastructure (DB & Redis):**
   - The application does not crash if PostgreSQL or Redis are unreachable.
   - `GET /api/v1/health` acts as a liveness probe (returns 200).
   - `GET /api/v1/ready` acts as a readiness probe (returns 503 if DB or Redis are disconnected, returns 200 when ready).
4. **Security & Redaction:**
   - Pino automatically redacts passwords, tokens, secret keys, authorization headers, cookies, and credit card numbers from all log streams.
   - Helmet provides HTTP security headers.
   - Centralized error middleware strips stack traces in production.
5. **Request Tracing:**
   - Every incoming request is assigned a unique UUID `x-request-id` header for distributed tracing.

---

## Outstanding Items / Known Environment Constraints
- **Docker / PostgreSQL / Redis:** Currently not installed on local host machine. Development and unit tests operate in DB-isolated mode. When Docker is installed, Postgres 16 and Redis 7 can be brought up to transition readiness status from 503 to 200.
