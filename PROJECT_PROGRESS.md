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
| **M5: Catalog & Inventory** | Categories, products, variants, SKU, image storage | ✅ Completed | Fully tested in No-DB mode |
| **M5b: Professional Product Creation + Cloudinary** | Slot-based image uploads, Cloudinary integration, pricing engine, specification templates, rich-text sanitization, admin form options, strict validation | ✅ Completed | Fully tested in No-DB mode |
| **M6: Inventory, Stock Ledger, Suppliers, Purchase Orders** | Multi-warehouse stock tracking, conditional atomic reservations, immutable StockMovement ledger, deadlock-free transfers, suppliers CRUD, purchase orders lifecycle & partial receiving, weighted average costing, stock audits & variance reconciliation | ✅ Completed | 305 unit tests passed, 16 DB integration tests skipped (DB required) |
| **M7: Orders, Cart & Checkout** | Cart sessions, checkout locks, order state machine, payment events, refunds | ⏳ Queued Next | Awaiting user instruction |

---

## Milestone M6: Inventory, Stock Ledger, Suppliers & Purchase Orders (Completed)
- **Status:** Completed (No-DB Mode)
- **Key Modules & Implementations:**
  1. **Core Transaction-Safe Stock Ledger (`src/modules/inventory`):**
     - **Stock Metrics Definition:**
       - `onHand`: Physical quantity in warehouse.
       - `reserved`: Active customer cart/checkout reservations.
       - `damaged`: Broken, spoiled, or quarantined stock.
       - `availableStock = onHand - reserved - damaged`.
     - **Conditional Atomic Operations:** Zero read-then-write race conditions. All updates enforce SQL conditional bounds (`WHERE ("onHand" - "reserved" - "damaged") >= $qty`) and fail immediately if affected rows = 0.
     - **Append-Only Ledger Guarantee:** Stock mutations and `StockMovement` creation occur strictly inside the same transaction. Public repository does not expose standalone inventory update without movement.
     - **Deterministic Lock Ordering in Transfers:** Multi-warehouse transfers sort warehouse IDs alphabetically before acquiring locks (`FOR UPDATE`), completely eliminating database deadlocks during concurrent bi-directional movements.
     - **Idempotency:** Reservations and commits check `referenceType + referenceId + action` to prevent double-booking.
     - **TTL Expiration Worker Hook:** `releaseExpiredReservations(before: Date)` batch-releases timed-out checkout reservations.
  2. **Inventory Admin Endpoints & Security:**
     - `GET /api/v1/inventory/summary`: Database-level SQL aggregations (`SUM(onHand * costPrice)`, `netStockValue`). Valuation figures stripped unless operator possesses `inventory:view_cost` or `super-admin` role.
     - `GET /api/v1/inventory/movements`: Paginated immutable audit ledger filterable by variant, warehouse, movement type, actor, and date.
     - `GET /api/v1/inventory/low-stock`: Returns variants where `availableStock <= reorderLevel`.
     - `GET /api/v1/inventory/variant/:variantId`: Multi-warehouse breakdown for a variant.
     - `POST /api/v1/inventory/receive`, `/adjust`, `/damage`, `/transfer`: Atomic stock mutations with actor attribution and audit logging.
     - Real inventory check replaces `hasStockOrOrders` placeholder in products repository to block soft-deletion of variants with active onHand or reserved units.
  3. **Suppliers Management (`src/modules/suppliers`):**
     - CRUD with soft deletion (`deletedAt`), unique name and phone number collision guards, and auto-generated `SUP-XXXXXX` supplier codes.
     - Endpoints: `GET /api/v1/suppliers`, `POST /api/v1/suppliers`, `GET /api/v1/suppliers/:id`, `PATCH /api/v1/suppliers/:id`, `DELETE /api/v1/suppliers/:id`.
  4. **Purchase Orders & Inbound Receiving (`src/modules/purchase-orders`):**
     - **PO State Machine:** `DRAFT -> ORDERED -> PARTIALLY_RECEIVED -> RECEIVED / CANCELLED`. Invalid transitions rejected with 400 Bad Request.
     - **Collision-Safe PO Number Generator:** Format `PO-YYYYMMDD-XXXX`.
     - **Partial Receiving & Over-Receive Block:** Verifies `receivedQuantity + qty <= orderedQuantity`. Blocks over-receiving at line item level.
     - **Weighted Average Costing Engine (`purchase-orders.costing.ts`):** Pure function `calculateWeightedAverageCost(currentOnHand, currentCostPrice, receivedQty, unitCost)`. Automatically recalculates variant `costPrice` upon goods receipt and logs `COST_PRICE_UPDATED` in `AuditLog`.
  5. **Stock Audit & Ledger-Backed Reconciliation (`StockAudit`):**
     - Physical count initiation (`POST /api/v1/inventory/audits`) sets audit status `IN_PROGRESS`.
     - Count entry records physical counts and calculates variances (`countedQuantity - systemQuantity`).
     - Audit approval reconciles all discrepancies strictly via `inventoryService.adjustStock` ledger entries (direct database mutation of inventory rows is completely blocked).
- **DB Verification Pending List (To be executed when Neon PostgreSQL is connected):**
  1. Real concurrent reservations race condition test with `Promise.all` (e.g. stock 5, 10 concurrent requests of 1 unit -> exactly 5 succeed, 5 fail).
  2. Database CHECK constraint enforcement (`chk_inventory_available_stock_non_negative`, `chk_inventory_on_hand_non_negative`, `chk_inventory_reserved_non_negative`).
  3. PostgreSQL append-only trigger `trg_block_stock_movement_mutation` blocking direct `UPDATE` or `DELETE` on `StockMovement`.
  4. Real PostgreSQL SQL aggregation performance for `SUM(onHand * costPrice)`.

---

## Milestone M5b: Professional Product Creation + Cloudinary (Completed)
- **Status:** Completed (No-DB Mode)
- **Key Modules & Implementations:**
  1. **Route Ordering & View Count Deduplication:**
     - Parameter routes (`/:id`, `/:slug`) strictly ordered after static segments (`/admin/all`, `/admin/form-options`, `/featured`, `/reorder`).
     - Public product view count increment protected by `viewDeduplicator` (IP + productId SHA-256 hash in 15-minute sliding window with periodic memory cleanup).
  2. **Schema Extensions:**
     - Enums: `ProductImageSlot` (`THUMBNAIL`, `BACKVIEW`, `GALLERY`), `InventoryType` (`READY_STOCK`, `PRE_ORDER`, `MADE_TO_ORDER`), `DiscountType` (`NONE`, `PERCENTAGE`, `FIXED`).
     - `Category.specificationTemplate` (JSON definitions for dynamic fields).
     - `Product` extended with `videoUrl`, `freeShipping`, `inventoryType`, `specifications`, `discountType`, `discountValue`, `specialOffer`, `mrp`.
     - `ProductImage` extended with `slot`, `publicId`, `width`, `height`, `format`, `bytes`.
  3. **Pure Pricing Calculation Engine (`src/modules/products/products.pricing.ts`):**
     - Pure function `calculatePricing({ mrp, discountType, discountValue })` using `Decimal.js` and half-up 2-decimal rounding.
     - Enforces `mrp > 0`, `0 < PERCENTAGE < 100`, `0 < FIXED < mrp`, `sellingPrice > 0`.
     - Strictly ignores client-submitted `sellingPrice`. Non-blocking warning if `sellingPrice < costPrice`.
  4. **Dynamic Specification Templates & Sanitization:**
     - Inherited template resolution (`GET /api/v1/categories/:id/product-form-schema`) walking category hierarchy.
     - `sanitize-html` strict allowlist (`p, br, strong, em, u, ul, ol, li, a, h2-h4, blockquote`) blocking scripts, SVGs, buttons, and `javascript:` URIs.
     - Video URL normalization for YouTube (`watch` and `youtu.be` to `embed`) and Vimeo (to `player.vimeo.com`), blocking non-HTTPS and unauthorized hosts.
  5. **Cloudinary Slot-Based Storage:**
     - Server-side signed uploads with metadata and EXIF stripping (`image_metadata: false`, `flags: 'strip_profile'`).
     - Slot endpoints: `POST /products/:id/images/thumbnail` (replaces old), `POST /products/:id/images/backview` (replaces old), `POST /products/:id/images/gallery` (max 4).
     - Deletion: DB row deleted first; Cloudinary destroy attempted. Failures emit structured log `{ event: 'pendingStorageCleanup' }` without blocking admin operations.
     - Responsive image preset helper `getResponsiveImageUrls` (200w, 400w, 900w, 1600w with `f_auto, q_auto`).
     - Publishing rule: Transitioning to `ACTIVE` status strictly requires a thumbnail image, active category, active variant with SKU, and valid price > 0.
     - Diagnostic script `npm run storage:check` (`scripts/storage-check.ts`).
  6. **Admin Form Support & Strict Zod Validation:**
     - `GET /api/v1/products/admin/form-options`: Returns category tree, inventoryTypes, discountTypes, upload limits, required fields for DRAFT vs ACTIVE, video allowlist, and hint.
     - `createProductSchema` and `updateProductSchema` enforce `.strict()` (unknown keys rejected).
     - Subcategory validation (must be active child of categoryId).
     - Specification validation against category/subcategory template.
     - DTO security: `PublicProductDto` strips `costPrice` and internal metrics; `AdminProductDto` includes pricing breakdown and restricts `costPrice` to operators with `product:view_cost`.
- **DB Verification Pending List (To be verified once Neon PostgreSQL is connected):**
  1. Partial unique index for single thumbnail per product (`idx_product_single_thumbnail`).
  2. Partial unique index for single backview per product (`idx_product_single_backview`).
  3. Database constraint checks for non-negative money and quantity values.
  4. Seed verification with default fashion apparel specification template.
  5. Live integration testing with `TEST_DATABASE_URL`.

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

---

## Milestone M5: Catalog, Categories, Products, Variants & Image Storage (Completed)
- **Status:** Completed (No-DB Mode)
- **Architecture:** Layered design across `src/modules/categories`, `src/modules/products`, and `src/services/storage.service.ts`.
- **Key Modules & Implementations:**
  1. **Categories Module (`src/modules/categories`):**
     - Slug auto-generation with collision suffix avoidance.
     - Parent-child cycle detection (blocks setting any descendant as parent).
     - Maximum depth limit of 3 strictly enforced.
     - Public category tree construction with active product counts.
     - Parent-inactive cascade protection (inactive ancestors hide entire sub-tree from public views).
     - Soft-delete with safe reassign options for active products and subcategories.
  2. **Products & Variants Module (`src/modules/products`):**
     - Atomic creation of product + multiple variants via transaction.
     - SKU and Barcode uniqueness validation with clear descriptive errors.
     - Status management (`DRAFT`, `ACTIVE`, `ARCHIVED`) and featured toggle.
     - Variant soft-deletion with dependency protection (`hasStockOrOrders`).
     - Price change auditing: any change to `price`, `compareAtPrice`, or `costPrice` is logged to `AuditLog`.
     - **DTO Separation:** `PublicProductDto` strips `costPrice`, `status`, `deletedAt`, and `viewCount`. `costPrice` is only visible to operators with `product:view_cost` permission in `AdminProductDto`.
     - Money fields formatted strictly as 2-decimal string (`"1250.00"`), never float.
     - Public catalog search with bounded limits (max 100), ILIKE search, category inheritance expansion, and sort filters (`newest`, `price_asc`, `price_desc`, `name_asc`, `name_desc`, `popular`).
  3. **Storage & Image Upload (`src/services/storage.service.ts` + `upload.middleware.ts`):**
     - `IStorageAdapter` interface with `LocalDiskAdapter` (stores in gitignored `/uploads`) and `CloudinaryAdapter`.
     - Multer memory storage with 5MB max file size and 10 files max batch limit.
     - **Magic-Byte Signature Verification:** Buffers inspected for JPEG (`FF D8 FF`), PNG (`89 50 4E 47`), and WebP (`RIFF...WEBP`). SVGs and fake file extensions are strictly blocked to prevent XSS and code execution.
     - Path traversal neutralized by cryptographically generating UUID filenames.
     - Product and category gallery upload, primary image switching, alt text update, and reordering.
- **Test Suite Results:**
  - **155 Unit Tests Passed (0 failed)** across 19 test files.
  - **13 Integration Tests SKIPPED (Database Verification Required)** across 3 test files (`tests/integration/auth.integration.test.ts` [5], `tests/integration/users-roles-customers.integration.test.ts` [4], `tests/integration/catalog.integration.test.ts` [4]).
- **DB Verification Pending List (To be verified once Neon PostgreSQL is connected):**
  1. Verify `Category` recursive CTE / parent-child queries against live PostgreSQL.
  2. Verify `Product` + `ProductVariant` multi-row atomic transaction rollback on failure.
  3. Verify unique constraints on `sku` and `barcode` in `ProductVariant` table.
  4. Verify PostgreSQL CHECK constraints (`price >= 0`, `costPrice >= 0`).
  5. Apply `pg_trgm` extension and create GIN trigram indexes (`idx_product_name_trgm`, `idx_product_description_trgm`) for accelerated search.
  6. Verify soft-delete composite index performance (`[status, deletedAt]`, `[isActive, deletedAt]`).
  7. Verify `AuditLog` persistence on price adjustments.
  8. Run complete integration test suite with `TEST_DATABASE_URL` against live PostgreSQL.

