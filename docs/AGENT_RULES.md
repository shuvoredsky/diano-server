# Agent Working Rules — DIANO Backend (diano-server)

This document establishes the binding architectural, operational, and development rules for all AI agents working on the `diano-server` codebase. Read and follow these rules prior to starting every milestone.

---

### 1. Scope & Security
- **Workspace Boundary:** Work is strictly confined to `diano-server`. Never search, read, or execute commands outside this directory.
- **Environment & Secrets:** Never print, log, or inspect values in `.env` or any secret files. Verify with `git status` before every commit that no `.env` or sensitive artifact is staged.

### 2. Database Modes & DB Mode Rules (Active: DB Mode)
- **Active State:** Real Neon PostgreSQL is connected and active.
- **Schema Migrations:**
  - When Prisma schema changes: Run `npx prisma migrate dev --name <name>` against `DATABASE_URL`.
  - Next, apply to test database: `npx prisma migrate deploy` with `TEST_DATABASE_URL`.
  - Commit all generated migration files to Git.
  - NEVER execute destructive commands (`migrate reset`, `drop`, `truncate`) on `DATABASE_URL`. Destructive actions are strictly restricted to `TEST_DATABASE_URL`.
- **Testing Standard:**
  - New features require both Unit Tests (with repository mocking) and Integration Tests (against real `TEST_DATABASE_URL`).
  - During development, run ONLY the relevant test file(s) to save round-trip time. Run the full test suite only at the end of each Part/Milestone.
  - Test data belongs strictly in `TEST_DATABASE_URL`.
  - Targeted cleanup only: Never run global `deleteMany()` on tables with foreign keys linked to immutable ledgers (`StockMovement` append-only trigger).
- **Environment & Secrets:** Never print, log, or inspect `.env` values or database connection strings.
- **Reuse First:** Always reuse existing StorageAdapter, HTML sanitizer, auditService, pagination utilities, ApiResponse, date/currency utilities, and test-auth-helper. Never duplicate logic.

### 3. Layered Architecture
- **Flow:** `Route -> Middleware -> Controller -> Service -> Repository (Interface) -> Database/ORM`.
- **Controllers:** Responsible only for request parsing, schema validation, invoking services, and sending responses via `ApiResponse`. Zero business logic, zero direct Prisma queries.
- **Repositories:** Implement strict TypeScript interfaces (`IXxxRepository`). Expose domain entities and atomic operations.
- **Validation:** Every input must be validated using Zod schemas (`.strict()` where appropriate).

### 4. Reuse First Policy
- Always search existing utilities before writing new logic:
  - `ApiResponse` (`src/utils/api-response.ts`)
  - `getPaginationMeta` / `paginationQuerySchema` (`src/utils/pagination.ts`)
  - `AppError` (`src/utils/app-error.ts`)
  - `auditService` (`src/services/audit.service.ts`)
  - Date & Currency helpers (`src/utils/date.util.ts`, `src/utils/currency.util.ts`)
- Avoid code duplication. If a pattern repeats 3 or more times, extract it to a shared helper.

### 5. Money & Timezone Integrity
- **Financial Calculations:** All monetary values must be calculated server-side using Decimal math. Never trust client-supplied prices, discounts, shipping charges, or grand totals.
- **Timezone:** Timestamps stored in UTC, business day / SLA boundaries calculated in `Asia/Dhaka`.

### 6. Git & Commit Protocol
- **Conventional Commits:** Use standard prefixes: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
- **Commit Frequency:** Commit locally per logical module/sub-part.
- **Push Protocol:** Push to `origin main` only once at the end of the milestone, after `npm run typecheck`, `npm run lint`, and `npm test` pass with zero errors.
- **Safety:** Never use force push or rewrite Git history. If a push fails, stop and notify the user.

### 7. Schema Evolution
- Keep schema adjustments minimal and backward-compatible.
- Execute `npx prisma validate`, `npx prisma format`, and `npx prisma generate`.
- Do NOT generate migration files in No-DB mode. Document raw SQL constraints and triggers in `docs/SCHEMA_SUMMARY.md`.

### 8. Milestone Report Format
- Maximum 60 lines. Concise and structured in English/Banglish:
  1. Endpoint summary (succinct table or bullet points).
  2. Schema changes summary.
  3. Security & consistency rules enforced.
  4. Test results: `"X unit passed, Y integration SKIPPED"`.
  5. Commit hashes + push status.
  6. DB verification pending list.
  7. Decisions requiring user confirmation.
