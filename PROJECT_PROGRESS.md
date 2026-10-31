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
| **M3: Auth & Identity (No-DB Mode)** | JWT access tokens (15m), rotating opaque refresh tokens (SHA-256 hashed in DB), refresh token family reuse detection, account lockout, RBAC (`authorize`), permission middleware (`requirePermission`), anti-enumeration generic responses, single-use password reset, in-memory rate limiting, unified role identifiers, Swagger UI | ✅ Completed | Verified and locked; bidirectional portal login separation enforced |
| **M4: Users, Roles, Permissions & Customers** | Administrative user management, privilege escalation guards, role hierarchy levels, system role protection, in-memory cache invalidation, customer self-service (profile, address book CRUD, consents, export, PII anonymization), admin customer management & timeline | ✅ Completed | 114 unit tests passed, 9 DB integration tests skipped (DB required) |
| **M5: Catalog & Inventory** | Categories, products, variants, SKU, stock movement ledger | ⏳ Queued Next | Awaiting user instruction |
| **M6: Cart & Checkout** | Cart sessions, abandoned cart tracking, atomic stock reservations | ⏳ Queued | Planned |
| **M7: Orders & Payments** | Order state machine, payment events, idempotency keys, refunds | ⏳ Queued | Planned |

---

## M4 Implementation Specification (No-DB Mode)

### 1. Endpoints Implemented

#### A. Users Management (`/api/v1/users`)
- `GET /api/v1/users`: List users with pagination, search (name, email, phone), role, and status filtering (`user:read`).
- `GET /api/v1/users/:id`: Get user details by ID (`user:read`).
- `POST /api/v1/users`: Create administrative account with role hierarchy escalation checks (`user:create`).
- `PATCH /api/v1/users/:id`: Update user profile and role; revokes all active sessions upon role transition (`user:update`).
- `PATCH /api/v1/users/:id/status`: Update status (`ACTIVE` / `SUSPENDED`); self-suspension blocked; revokes sessions on suspension (`user:manage`).
- `DELETE /api/v1/users/:id`: Soft-delete user; self-deletion blocked; last active Super Admin blocked; revokes sessions (`user:delete`).
- `POST /api/v1/users/:id/revoke-sessions`: Terminate all active sessions of a specified user (`user:manage`).

#### B. Roles & Permissions Management (`/api/v1/roles`, `/api/v1/permissions`)
- `GET /api/v1/roles`: List all system and custom roles (`role:read`).
- `GET /api/v1/roles/:id`: Get role details with granular permissions (`role:read`).
- `POST /api/v1/roles`: Create custom role with permission escalation verification (`role:create`).
- `PATCH /api/v1/roles/:id`: Update custom role; system roles cannot be renamed or altered (`role:update`).
- `DELETE /api/v1/roles/:id`: Delete custom role; system roles cannot be deleted; roles with active user assignments blocked (`role:delete`).
- `PUT /api/v1/roles/:id/permissions`: Assign permissions to role; invalidates `PermissionsCache`; escalation guards enforced (`role:update`).
- `GET /api/v1/permissions`: Read-only grouped list of all permissions by resource (`role:read`).

#### C. Customer Self-Service (`/api/v1/customers/me`)
- `GET /api/v1/customers/me/profile`: Retrieve customer profile and summary statistics.
- `PATCH /api/v1/customers/me/profile`: Update name, phone, avatarUrl, gender, and dateOfBirth.
- `GET /api/v1/customers/me/addresses`: List customer addresses.
- `POST /api/v1/customers/me/addresses`: Add new address (enforces 10 address limit, automatic default address switching).
- `PATCH /api/v1/customers/me/addresses/:addressId`: Update address (enforces customer ownership protection).
- `DELETE /api/v1/customers/me/addresses/:addressId`: Delete address (enforces customer ownership protection).
- `GET /api/v1/customers/me/consents`: Retrieve latest marketing & recovery consent preferences.
- `PATCH /api/v1/customers/me/consents`: Update consent preferences with audit trail in `ConsentRecord`.
- `GET /api/v1/customers/me/data-export`: Download comprehensive personal data JSON export.
- `POST /api/v1/customers/me/delete-account`: Request account deletion (soft-deletes, anonymizes PII, revokes all sessions).

#### D. Customer Admin Management (`/api/v1/customers`)
- `GET /api/v1/customers`: Paginated customer directory with search and status filtering (`customer:read`).
- `GET /api/v1/customers/:id`: Customer detail with addresses, consents, and initial order summary (`customer:read`).
- `PATCH /api/v1/customers/:id/status`: Update status (`ACTIVE` / `SUSPENDED`); revokes sessions on suspension (`customer:manage`).
- `POST /api/v1/customers/:id/notes`: Add administrative note to customer profile (`customer:manage`).
- `GET /api/v1/customers/:id/notes`: Retrieve customer notes history (`customer:read`).
- `GET /api/v1/customers/:id/timeline`: Aggregated activity timeline from logins, notes, and status changes (`customer:read`).

---

### 2. Security Rules & Guard Rails Implemented

1. **Role Hierarchy & Privilege Escalation:**
   - Unified role constants in `src/constants/roles.ts` establish strict tiers (`SUPER_ADMIN: 100`, `ADMIN: 80`, `MANAGER: 60`, `ORDER_MANAGER / INVENTORY_MANAGER: 40`, `SUPPORT_STAFF: 20`, `CUSTOMER: 0`).
   - Actors cannot assign, elevate, or delete roles at or above their tier (unless Super Admin).
   - Actors cannot grant permissions they do not possess.
2. **Last Active Super Admin Protection:**
   - The system queries `countActiveSuperAdmins()` before any delete, suspend, or demote action on a Super Admin.
   - If only 1 remains, the operation is blocked to prevent administrative lockout.
3. **Super Admin Modification Guard:**
   - Only a Super Administrator can modify, update, or delete another Super Administrator account.
4. **Self-Suspension & Self-Deletion Block:**
   - An actor cannot delete or suspend their own account (`actor.userId === targetUserId`).
5. **System Role Protection:**
   - Seeded system roles (`super-admin`, `admin`, `manager`, `order-manager`, `inventory-manager`, `support-staff`, `customer`) have `isSystem: true`.
   - Any attempt to delete or rename system roles throws `403 Forbidden`.
6. **Session Invalidation on Security Transitions:**
   - When user status is updated to `SUSPENDED`, or when a user's role is modified, or when an account is deleted, all active sessions and refresh tokens for that user are immediately revoked.
7. **Address Book Limits & Ownership Check:**
   - Maximum 10 addresses per customer.
   - Ownership is strictly validated (`address.userId === req.user.userId`).
   - Automatic default address switching: Setting an address as default clears existing defaults of that type.
8. **PII Anonymization Policy:**
   - Account deletion anonymizes customer PII (email converted to `anonymized_<id>@deleted.diano.internal`, phone set to null, name to `Anonymized Customer`), while preserving database referential integrity for past transactions.
9. **Cache Invalidation:**
   - In-memory `PermissionsCache` is automatically invalidated whenever role permissions are reassigned or custom roles are deleted.
10. **Audit Logging:**
    - Every administrative operation (user creation, updates, status changes, soft-deletions, role creation, permission updates, customer notes, status updates) logs an entry to `AuditLog`.

---

## DB Verification Pending (To be executed once Neon / Database is active)

The following items are implemented according to Prisma models and interfaces, but have **not yet been executed against a live database instance**:

1. **Database Migrations:** Running `npx prisma migrate dev --name init` and applying SQL CHECK constraints (`onHand >= 0`, `reserved <= onHand`, `rating 1..5`, etc.).
2. **Database Seeding:** Running `npm run db:seed` to verify 7 system roles, permissions, warehouse, and shipping zones.
3. **Integration Test Suites:**
   - `tests/integration/auth.integration.test.ts` (5 tests)
   - `tests/integration/users-roles-customers.integration.test.ts` (4 tests)
4. **Constraints & Indexes:**
   - Unique constraints on `User.email`, `User.phone`, `Role.name`, `Role.slug`.
   - Foreign key cascade deletions on `UserRole`, `RolePermission`, `CustomerAddress`.
   - Transactional isolation of `assignRole` and `setRolePermissions`.

---

## Test Verification Summary
- **Unit Tests Passed:** 114 passed (100% of non-DB unit tests)
  - `password.util.test.ts`: 3 passed
  - `token.util.test.ts`: 3 passed
  - `jwt.util.test.ts`: 5 passed
  - `auth.service.test.ts`: 20 passed
  - `auth.middleware.test.ts`: 14 passed
  - `roles.constant.test.ts`: 4 passed
  - `pagination.util.test.ts`: 5 passed
  - `users.service.test.ts`: 13 passed
  - `roles.service.test.ts`: 13 passed
  - `customers.service.test.ts`: 10 passed
  - `currency.util.test.ts`: 8 passed
  - `date.util.test.ts`: 5 passed
  - `env.config.test.ts`: 3 passed
  - `api-response.test.ts`: 4 passed
  - `health.test.ts`: 4 passed
- **Integration Tests Skipped:** 9 skipped (`tests/integration/auth.integration.test.ts` [5] + `tests/integration/users-roles-customers.integration.test.ts` [4]). **No skipped test was marked as passed.**
