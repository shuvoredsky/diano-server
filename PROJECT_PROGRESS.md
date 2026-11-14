# DIANO Backend — Project Progress Tracker

## Project Overview
- **Repository:** `diano-ecommerce / diano-server`
- **Architecture:** Modular Monolith (Route -> Controller -> Service -> Repository -> Zod Validation)
- **Runtime:** Node.js v24.11.0
- **Language & Framework:** Strict TypeScript (ESM NodeNext), Express.js 5, Prisma ORM 7, Pino, Vitest
- **Execution Mode:** **DB Mode** (Live Neon PostgreSQL active, migrated, and seeded; 21/21 integration tests passing against TEST_DATABASE_URL; Redis offline gracefully handled with 503 readiness probe; zero test skipping)

---

## Milestone Progress

| Milestone | Description | Status | Notes |
|:---|:---|:---:|:---|
| **M1: Project Setup & Core Foundation** | Base project, strict TypeScript, ESLint flat config, Prettier, Pino logger with redaction, Zod env validation, AppError, ApiResponse, Date & Currency utils, Health/Readiness endpoints, Vitest test suite | ✅ Completed | Fully functional without requiring local DB/Redis running |
| **M2: Prisma Data Modeling** | Complete Prisma 7 schema (48 models, 19 enums), Decimal(12,2) money, cuid IDs, immutable order item snapshots, double-entry stock movement ledger, payment events, idempotency keys, safe idempotent seed script, docs/SCHEMA_SUMMARY.md | ✅ Completed | Schema validated & formatted; Client generated; Seed script ready |
| **M2b / DB-1: Database Migration & Verification** | Run migrations on live Neon database with 18 CHECK constraints, 2 partial unique indexes, pg_trgm + GIN trigram indexes, StockMovement append-only mutation trigger; idempotent seed with count verification (7 roles, 55 permissions, role-permissions, warehouse, shipping zones, fraud rules, super-admin, fashion spec template); 21/21 real DB integration tests passing (concurrent reserve, check violation, append-only trigger, opposite-direction transfer deadlock prevention); /ready 503 dependency probe; admin smoke test | ✅ Completed | Fully verified end-to-end on live Neon PostgreSQL databases |
| **M3: Auth & Identity** | JWT access tokens (15m), rotating opaque refresh tokens (SHA-256 hashed in DB), refresh token family reuse detection, account lockout, RBAC (`authorize`), permission middleware (`requirePermission`), anti-enumeration generic responses, single-use password reset, in-memory rate limiting, unified role identifiers, Swagger UI | ✅ Completed | DB verified (auth integration tests passing) |
| **M4: Users, Roles, Permissions & Customers** | Administrative user management, privilege escalation guards, role hierarchy levels, system role protection, in-memory cache invalidation, customer self-service (profile, address book CRUD, consents, export, PII anonymization), admin customer management & timeline | ✅ Completed | DB verified (users-roles-customers integration tests passing) |
| **M5: Catalog & Inventory** | Categories, products, variants, SKU, image storage | ✅ Completed | DB verified (catalog integration tests passing) |
| **M5b: Professional Product Creation + Cloudinary** | Slot-based image uploads, Cloudinary integration, pricing engine, specification templates, rich-text sanitization, admin form options, strict validation | ✅ Completed | Fully tested & verified |
| **M6: Inventory, Stock Ledger, Suppliers, Purchase Orders** | Multi-warehouse stock tracking, conditional atomic reservations, immutable StockMovement ledger, deadlock-free transfers, suppliers CRUD, purchase orders lifecycle & partial receiving, weighted average costing, stock audits & variance reconciliation | ✅ Completed | DB verified (inventory integration tests & deadlock tests passing) |
| **M7: Cart & Wishlist** | Guest cart with 32-byte opaque token (SHA-256 hashed in DB), logged-in cart, server pricing from variant.price, active catalog enforcement, stock clamping (onHand - reserved - damaged), pre-order rules, merge sum & clamp, validate issues (PRICE_CHANGED, OUT_OF_STOCK, INSUFFICIENT_STOCK, UNAVAILABLE), 30-day guest cart cleanup hook, customer wishlist with idempotent addition, move-to-cart, zero-leak DTOs | ✅ Completed | DB verified (cart-wishlist integration tests passing) |
| **M8: Checkout & Abandoned Checkout** | Server-side cart snapshot, 128-bit unguessable sessionId, IDOR protection (guest secret token hash, user ownership), 30m sliding expiry, BD phone validation, dynamic shipping fee calculation from ShippingZone/ShippingMethod (Inside 60 / Outside 120), CouponCalculator interface, strict telemetry allowlist (strictly NO PII), 90-day PII purge, auto-classification (30m boundary), RecoveryService with explicit ConsentRecord guard, NoopAdapter, max 2 attempts & cooldown, admin stats via SQL aggregation, audited customer PII viewing | ✅ Completed | DB verified (checkout-abandoned integration tests passing) |
| **M9: Orders, State Machine & Invoicing** | Atomic checkout session conversion, Idempotency-Key duplicate/race handling, server-side pricing recalculation, double-entry stock reservation ledger, collision-safe Dhaka order numbering (DN-YYMMDD-XXXXX), pure state machine with discrete transition permissions, customer cancellation guard, streaming PDF invoices with frozen snapshots and bundled Bengali font, real-order check in hasStockOrOrders | ✅ Completed | DB verified (16/16 unit + 8/8 real Neon DB integration tests passing) |
| **Site Settings & CMS** | Typed Zod configuration groups (store_profile, invoice, seo_defaults, contact), magic-byte logo/favicon uploads, safe public site-config with ETag/cache, visual banners with Dhaka scheduling window and URL safety, CMS pages with Zod discriminated union blocks JSON (AI landing page ready), immutable PageRevision ledger | ✅ Completed | DB verified (14/14 unit + 3/3 real Neon DB integration tests passing) |
| **M10a: Payments Core & SSLCOMMERZ v4 + COD** | Payment state machine, zero-trust server validation, MD5 IPN verification with timingSafeEqual, atomic stock commitment, idempotent webhook/redirect race handling, admin refund & COD collection, sandbox diagnostic tool | ✅ Completed | DB verified (17/17 unit + 5/5 real Neon DB integration tests passing) |
| **M10b: Mobile Financial Services (bKash & Nagad)** | bKash and Nagad direct merchant API integrations | 🚫 Out of Scope | Eliminated per project scope decisions (SSLCOMMERZ + COD only) |
| **M11: Fraud Detection & Risk Scoring** | Explainable rule-based heuristics, RiskScorer engine (score 0-100, LOW/MEDIUM/HIGH), non-blocking fail-open hook, review queue, OTP customer verification, append-only decision ledger | ✅ Completed | DB verified (16/16 unit + 3/3 real Neon DB integration tests passing) |
| **M12: Shipping, Coupons, Returns & Refunds** | DB-driven ShippingZone & methods, CourierAdapter interface, race-safe coupons & flash sales, customer return requests with return window, inspection & return restock, refund idempotency & proportional coupon refunds | ✅ Completed | DB verified (12/12 unit + 6/6 real Neon DB integration tests passing) |
| **M13: Advanced Analytics, Reports & Operating Expenses** | Financial KPIs, Asia/Dhaka periods, gap-filled time-series trends, gross profit & margin calculation with role-based masking (`analytics:view_finance`), sales/inventory/tax reports with streaming CSV/Excel export, operating expenses CRUD with category breakdown | ✅ Completed | DB verified (17/17 unit + 10/10 real Neon DB integration tests passing) |
| **M14: Postgres Outbox Notifications & Real-Time Event Bus** | Reliable PostgreSQL outbox queue (`SKIP LOCKED`), exponential backoff to `DEAD`, email adapters (SMTP/Resend/Brevo/Console), SMS adapter, in-app notifications with unread badge, user preferences & quiet hours (Dhaka 9PM-9AM), Socket.IO with JWT handshake and room isolation | ✅ Completed | DB verified (24/24 unit + 12/12 real Neon DB integration tests passing) |
| **M15: Security Hardening & Final API Documentation** | Helmet API-only CSP, HSTS in prod, prototype pollution guard, parameter pollution guard, request timeout & slow request logger, 272-route automated permission matrix audit (0 unprotected admin routes), sensitive data exposure scanner, load smoke benchmark (p95 < 4ms for health), complete OpenAPI export (`openapi.json`) | ✅ Completed | 38/38 security tests passing |
| **M16: Production Deployment Readiness** | Render Web Service + Neon PostgreSQL (Singapore) + Cloudinary architecture, runtime pooled vs direct migration URLs, production seed guard, native PostgreSQL `pg_dump -Fc` / `pg_restore` backup & restore (`npm run db:backup`, `docs/BACKUP_RESTORE_PROOF.md`), cron-job.org scheduler table (8 jobs), go-live checklist, production documentation | ✅ Completed | 100% Production Ready |

---

## Milestone M9: Orders, State Machine & Invoicing (Completed)
- **Status:** Completed (DB Mode Verified on Neon PostgreSQL)
- **Key Modules & Implementations:**
  1. **Atomic Order Placement Engine (`src/modules/orders`):**
     - **Session Locking & Idempotency:** Atomic PostgreSQL transaction with `Idempotency-Key` verification before session conversion. Identical payload replay returns existing order (`200 OK`); divergent payload with same key returns `409 Conflict`.
     - **Server Recomputation:** Variant prices re-queried directly from database; shipping charge calculated via `ShippingCalculator`; coupon discounts applied via `CouponCalculator`; taxes computed. Client-provided totals are strictly ignored.
     - **Stock Ledger Integration:** Physical inventory reserved atomically (`referenceType: 'ORDER'`) using `inventoryService.reserveStock(..., tx)`. Failure triggers complete transaction rollback.
     - **Collision-Safe Dhaka Order Numbering:** Deterministic `AppSequence` counter generating human-friendly numbers formatted as `DN-YYMMDD-XXXXX` according to Asia/Dhaka (+06:00) business time.
     - **Immutable Snapshots:** `OrderItem` captures snapshot of product name, variant title, SKU, cost price, and unit price. Customer, shipping address, and billing address frozen into immutable JSON snapshots.
  2. **Pure State Machine (`orders.state-machine.ts`):**
     - Forward fulfillment flow: `PENDING -> CONFIRMED -> PROCESSING -> PACKED -> SHIPPED -> DELIVERED`.
     - Pre-fulfillment cancellation: `PENDING / CONFIRMED / PROCESSING / PACKED -> CANCELLED` releases reserved stock back to active inventory with double-entry `RELEASE` movement ledger entry.
     - Post-fulfillment returns: `DELIVERED -> RETURNED -> REFUNDED`.
     - Customer cancellation restricted to own `PENDING` orders.
     - Status updates emit immutable `OrderStatusHistory` entries and `AuditLog` records.
  3. **PDFKit Invoice Generation & Freezing (`invoice.service.ts`):**
     - **Frozen Snapshot:** `OrderInvoiceSnapshot` (`INV-YYMM-XXXXX`) freezes active store branding, invoice notes, and customer data at creation time. Historical invoices remain legally constant even if store settings change later.
     - **Unicode Bengali Typography:** Bundled SIL OFL font `HindSiliguri-Regular.ttf` in `assets/fonts/` for proper Bengali script rendering in PDFKit.
     - **SSRF-Safe Logo Fetching:** Cloudinary logo fetch strictly restricted to allowlisted host `res.cloudinary.com` with a 4000ms timeout and 2MB size limit. Network failures degrade gracefully to clean typographic header without crashing.
     - **Streaming Output:** Streams `application/pdf` with `no-store` cache headers.
  4. **Public & Admin Order Management:**
     - `POST /orders/track`: Public phone + order number tracking with rate limiting and generic error responses (zero PII enumeration).
     - Customer: `GET /orders`, `GET /orders/:id` (IDOR verified), `POST /orders/:id/cancel`.
     - Admin: `GET /admin/orders` (filtering, search, pagination), `GET /admin/orders/:id`, `PATCH /admin/orders/:id/status`, `POST /admin/orders/:id/notes`, `GET /admin/orders/:id/timeline`. Cost prices masked unless operator has `order:view_cost` permission.
  5. **Real Catalog Deletion Guard:**
     - Replaced `hasStockOrOrders` placeholder in `products.repository.ts` with real `orderItem.count` check, permanently blocking deletion of variants associated with historical orders.

## Milestone M8: Checkout & Abandoned Checkout (Completed)
- **Status:** Completed (No-DB Mode)
- **Key Modules & Implementations:**
  1. **Checkout Session Engine (`src/modules/checkout`):**
     - **Session Snapshot:** Server creates snapshot from active cart. Client prices are strictly ignored.
     - **Session Identifiers & IDOR Defense:** 128-bit unguessable public `sessionId` (16 bytes hex). Guest sessions enforce a 256-bit `sessionSecretToken` (stored as SHA-256 hash). Logged-in sessions enforce `userId` ownership. Cross-user access returns 403 Forbidden.
     - **Sliding Expiry:** 30-minute sliding TTL. Inactive/expired sessions block writes.
     - **Dynamic Shipping Calculation (`ShippingCalculator`):** Inspects `ShippingZone` & `ShippingMethod` tables (Inside Dhaka 60 BDT, Outside Dhaka 120 BDT based on district).
     - **Zero-Discount Coupon Calculator (`CouponCalculator`):** Placeholder interface cleanly extendable for M12 coupons.
     - **Telemetry & Event Tracking:** `POST /checkout/sessions/:id/events` strictly allowlists event types and metadata keys (`step`, `method`, `deviceCategory`). Free-text and PII are strictly rejected.
  2. **Abandoned Checkout & Recovery (`src/modules/abandoned-checkout`):**
     - **Inactivity Classification:** `classifyAbandonedSessions(now, 30)` auto-classifies active sessions inactive >= 30 mins into `ABANDONED` with `abandonedAt = now` and `CHECKOUT_ABANDONED` event. Sessions inactive < 30m remain `ACTIVE`.
     - **Explicit Consent Guard:** Recovery message dispatch requires active `ConsentRecord` row (`purpose: 'RECOVERY'`). Without explicit consent, recovery dispatch is refused.
     - **Anti-Spam Controls:** Capped at maximum 2 attempts per session with a 2-hour cooldown.
     - **NoopAdapter:** Safe console recovery dispatch without third-party network dependencies.
     - **Admin Funnel Analytics:** `GET /abandoned-checkouts/stats` executes pure SQL `groupBy` aggregation directly on PostgreSQL (zero Node-memory table loads) with Asia/Dhaka windowing and prior period comparison.
     - **Audited Customer PII Access:** Viewing customer PII emits `VIEW_CUSTOMER_PII` in `AuditLog`.
     - **Privacy Retention:** `purgeExpiredCheckoutPii(olderThan)` anonymizes customer PII after 90 days.
- **DB Verification Pending List (To be executed when Neon PostgreSQL is connected):**
  1. Real concurrent checkout session initialization for the same cart.
  2. Postgres partial index uniqueness and IDOR secret token hash lookup.
  3. Real cron execution of `classifyAbandonedSessions` against live PostgreSQL timestamps.
  4. Database-level SQL groupBy performance for checkout funnel metrics.
  5. Privacy PII purge query performance on high-volume session tables.

---

## Milestone M7: Cart & Wishlist (Completed)
- **Status:** Completed (No-DB Mode)
- **Key Modules & Implementations:**
  1. **Cart Lifecycle & Strict Server Pricing (`src/modules/cart`):**
     - **Guest Token Security:** Server generates 32-byte cryptographically random token via HttpOnly cookie `diano_cart_token` / `x-cart-token` header. DB stores only SHA-256 hash.
     - **Server Pricing Source of Truth:** Item prices strictly snapshot from DB `variant.price`. Client-submitted price fields rejected by Zod (`.strict()`).
     - **Active Catalog Verification:** Rejects deactivated/deleted products, variants, or categories.
     - **Stock Clamping:** Limits quantities to available stock `(onHand - reserved - damaged)`. Zero stock reservation at cart level.
     - **Merge Engine:** Combines guest cart into user cart on login, summing quantities, clamping to limits (`CART_MAX_ITEM_QTY = 10`), deleting guest cart idempotently, and reporting clamped items.
     - **Validation (`POST /cart/validate`):** Flags `PRICE_CHANGED` (auto-applied), `OUT_OF_STOCK`, `INSUFFICIENT_STOCK`, `UNAVAILABLE` with recalculated totals.
     - **30-Day Cleanup:** `cleanupExpiredGuestCarts(before)` hook for scheduled worker.
  2. **Customer Wishlist (`src/modules/wishlist`):**
     - Authenticated customer wishlist.
     - Idempotent additions.
     - `POST /wishlist/items/:variantId/move-to-cart`: Transfers item to active cart and removes from wishlist.
     - Public DTOs strictly omit `costPrice` or internal costing metadata.
- **DB Verification Pending List (To be executed when Neon PostgreSQL is connected):**
  1. Guest token hash unique constraint and index lookup performance in PostgreSQL.
  2. Concurrent guest cart merge under simultaneous login requests.
  3. Bulk deletion performance for 30-day expired guest carts.

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
---

## Milestone M11: Fraud Detection & Risk Scoring (Completed)
- **Status:** Completed (DB Mode Verified on Neon PostgreSQL)
- **Key Modules & Implementations:**
  1. **Rule-Based Heuristic Risk Engine (`src/modules/fraud-detection`):**
     - Pure evaluation functions implementing 9 distinct risk rules: Order Velocity (hourly/daily), High Value Orders (>৳10,000 / >৳25,000), First-Time Customer High-Value COD (>৳5,000), Address Mismatch (delivery district vs customer address history), Disposable Email Domains, Phone Carrier/Formatting Anomaly, Rapid Checkout Velocity (<30s between creation and order), High Cancellation/RTO History, and IP Geolocation District Mismatch.
     - Additive scoring capped strictly at 100 with explainable triggered factors array.
     - Categorization: `LOW` (0-29), `MEDIUM` (30-69), `HIGH` (70-100).
  2. **Non-Blocking Fail-Open Policy:**
     - Order placement hook runs asynchronously/safely without blocking checkout flow if evaluation errors.
     - High-risk orders are placed on manual review hold (`PENDING_REVIEW`), strictly blocking progression to `CONFIRMED` or `SHIPPED` via state machine hook until reviewed by staff.
  3. **Admin Review Queue & OTP Verification:**
     - Review queue endpoints: `GET /admin/fraud/review-queue`, `GET /admin/fraud/assessments/:orderId`, `PATCH /admin/fraud/assessments/:orderId/review`.
     - Append-only `FraudDecisionHistory` ledger capturing operator notes and decisions (`APPROVE`, `REJECT`, `REQUEST_OTP`).
     - OTP Challenge: `POST /admin/fraud/assessments/:orderId/request-otp` and customer verification `POST /admin/fraud/assessments/:orderId/verify-otp`.
- **Test Suite Results:**
  - **16/16 Unit Tests Passed** across all heuristics, boundary capping, and factor explainability.
  - **3/3 Integration Tests Passed** on live Neon PostgreSQL (auto-assessment on order creation, order hold hook blocking dispatch, admin review approval).

---

## Milestone M12: Shipping, Coupons, Returns & Refunds (Completed)
- **Status:** Completed (DB Mode Verified on Neon PostgreSQL)
- **Key Modules & Implementations:**
  1. **Shipping & Logistics (`src/modules/shipping`):**
     - Geographic `ShippingZone` management with district matching and fallback resolution.
     - DB-driven `ShippingMethod` rates: base fee, per-kg weight charges, and free shipping thresholds.
     - `CourierAdapter` interface with `ManualCourierAdapter` mock implementation generating tracking numbers.
     - Shipment lifecycle state machine (`PENDING -> PICKED_UP -> IN_TRANSIT -> DELIVERED / FAILED_ATTEMPT`) with delivery attempt logs and state machine hooks automatically advancing order to `SHIPPED` and `DELIVERED`.
  2. **Coupons, Discounts & Flash Sales (`src/modules/coupons`):**
     - Promotional vouchers supporting `PERCENTAGE` (with `maxDiscount` cap), `FIXED`, and `FREE_SHIPPING`.
     - Pure validation rules: date validity windows, minimum purchase spend, on-sale item exclusion, and global & per-user usage limits.
     - Atomic race-safe usage increments using conditional SQL: `UPDATE "Coupon" SET "usedCount" = "usedCount" + 1 WHERE id = ... AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")`.
     - Idempotent application and removal to checkout sessions (`/checkout/sessions/:id/coupon`).
     - Flash sales with product-level price overrides and time-boxed schedules.
  3. **Customer Returns & Restock Ledger (`src/modules/returns`):**
     - Customer return requests (`POST /orders/:id/returns`) with 7-day delivery return window enforcement and item quantity validation.
     - Admin inspection workflow (`/admin/returns/:id/receive`): grading condition (`GOOD`, `DEFECTIVE`, `DAMAGED`) and restock action.
     - **Ledger Consistency:** Return restock atomically invokes `inventoryService.restock` recording immutable `StockMovement` of type `RETURN_RESTOCK` referencing the return request.
  4. **Proportional Refunds Engine (`src/modules/refunds`):**
     - Pure mathematical calculation dividing applied coupon discounts proportionally across returned items based on line total value.
     - Strict refund ceiling: total order refunds cannot exceed `paidAmount - totalRefunded`.
     - Idempotency key protection and automatic order payment status synchronization (`PARTIALLY_REFUNDED` / `REFUNDED`).
- **Test Suite Results:**
  - **12/12 Unit Tests Passed** covering proportional discount calculation, rounding accuracy, ceiling caps, free shipping, percentage caps, expiry, and exclusions.
  - **6/6 Integration Tests Passed** on live Neon PostgreSQL covering shipping zone/method calculation, shipment booking & delivery state transitions, coupon checkout application & atomic usage, return request creation, warehouse inspection & `RETURN_RESTOCK` stock movement, and proportional refund execution.

---

## Milestone M13: Analytics, Reports & Operating Expenses (Completed)
- **Status:** Completed (DB Mode Verified on Neon PostgreSQL)
- **Key Modules & Implementations:**
  1. **Analytics Engine (`src/modules/analytics`):**
     - Financial calculations strictly relative to Asia/Dhaka (+06:00) business days. Periods: `today`, `yesterday`, `last_7_days`, `last_30_days`, `this_week` (Saturday start), `last_week`, `this_month`, `last_month`, `custom`.
     - Gap-filled time-series sales trends using PostgreSQL `generate_series`.
     - Gross Profit and Profit Margin calculations: `Revenue - Product Cost Price - Discounts - Tax - Refunds`.
     - Sensitive financial metric stripping for non-financial viewers lacking `analytics:view_finance`.
  2. **Multi-Format Reporting Engine (`src/modules/reports`):**
     - Sales Reports, Product Performance Reports, Inventory Valuation, and Tax Summaries.
     - Streaming CSV (`csv-stringify`) and stylized Excel (`exceljs`) workbook exports.
  3. **Operating Expenses Module (`src/modules/expenses`):**
     - CRUD management with categories (`RENT`, `SALARIES`, `MARKETING`, `PACKAGING`, `UTILITIES`, `COURIER_FEES`, `SOFTWARE`, `OTHER`).
     - Expense breakdown aggregation feeding directly into net profit calculations.

---

## Milestone M14: Postgres Outbox Notifications & Real-Time Event Bus (Completed)
- **Status:** Completed (DB Mode Verified on Neon PostgreSQL)
- **Key Modules & Implementations:**
  1. **PostgreSQL Outbox Queue (`src/modules/notifications`):**
     - Decoupled from external broker (zero Redis / BullMQ dependency).
     - Concurrent worker polling using `SELECT ... FOR UPDATE SKIP LOCKED`.
     - Exponential backoff retry with transition to `DEAD` status after 5 failed attempts.
     - Deduping key enforcement (`dedupeKey` unique constraint).
  2. **Channel Adapters & Templates:**
     - Modular adapters for Email (`SMTP`, `Resend`, `Brevo`, `Console`), SMS (`ConsoleAdapter`), and In-App notifications.
     - Typed multilingual templates (`en` and `bn`) for orders, payments, refunds, and returns.
     - Customer preference enforcement and Dhaka quiet hours (9:00 PM - 9:00 AM) protection for marketing SMS.
  3. **Real-Time Socket.IO Bus (`src/sockets`):**
     - JWT handshake authentication and automatic session revocation checks.
     - Server-assigned room isolation (`user:<id>`, `admin:all`, `admin:perm:<slug>`). Arbitrary client room joins strictly blocked.
     - Minimal broadcast payloads preventing data leakage over websockets.

---

## Milestone M15: Security Hardening & Final API Docs (Completed)
- **Status:** Completed (Verified with Automated Security Matrix)
- **Key Implementations:**
  1. **Security Guardrails (`src/middlewares/security-guard.middleware.ts`):**
     - Helmet API-only CSP, HSTS in production, and `X-Powered-By` suppression.
     - Recursive Prototype Pollution guard rejecting `__proto__`, `constructor`, `prototype`.
     - Payload nesting depth limit (max 10 levels) and 1MB request body limit.
     - Parameter pollution guard deduplicating query arguments.
     - Socket request timeout (30s) and slow request warning logger (>1000ms).
  2. **Automated Route Permission Matrix (`scripts/generate-route-matrix.ts`):**
     - Traverses all 272 Express routes.
     - Verified zero unprotected administrative endpoints.
     - Automated test `security-route-matrix.integration.test.ts` (38 tests) verifying unauthenticated request rejection.
  3. **Sensitive Data Exposure Prevention:**
     - Response scanner verifies `passwordHash`, `tokenHash`, `costPrice`, and `clientSecret` are never exposed in public endpoints.
  4. **OpenAPI Specification (`openapi.json`):**
     - Exported complete OpenAPI 3.0.3 specification covering 148 public and administrative endpoints. Available via `npm run openapi:export` and `/api/docs/openapi.json`.

---

## Milestone M16: Production Deployment Readiness (Completed)
- **Status:** Completed (Render + Neon + Cloudinary Architecture)
- **Key Deliverables:**
  1. **Production Deployment Documentation (`docs/DEPLOYMENT.md`):** Comprehensive guide for deploying on Render Web Service and Neon PostgreSQL co-located in Singapore.
  2. **Go-Live Operational Checklist (`docs/GO_LIVE_CHECKLIST.md`):** Complete verification checklist covering DNS, SSL, SSLCOMMERZ live keys, Cloudinary, and cron schedulers.
  3. **Database Backup & Recovery Tool (`scripts/db-backup.ts`, `scripts/db-restore.ts`):** Native PostgreSQL custom-format archive (`pg_dump -Fc`) and restore (`pg_restore`) with production refusal guard and zero credential leakage, verified in `docs/BACKUP_RESTORE_PROOF.md`.
  4. **Scheduled Job Automation:** Documented cron-job.org configuration for all 8 internal jobs to maintain system integrity and prevent Render sleep.

---

## Post-M16 Hardening: Inventory Race & Atomicity Fixes (BG-22, BG-23)
- **Status:** Completed & Verified (Live Neon PostgreSQL Integration Tests Passing)
- **Key Fixes & Deliverables:**
  1. **Atomic Purchase Order Receiving (`purchase-orders.service.ts`):**
     - Single `prisma.$transaction` wrapping entire goods receipt flow.
     - Row locking via `SELECT id FROM "PurchaseOrder" WHERE id = ${id} FOR UPDATE` serializing concurrent requests.
     - Re-verification of order status (`ORDERED` / `PARTIALLY_RECEIVED`) and per-item remaining quantities within the transaction, completely blocking over-receiving and duplicate receipts.
     - Atomic stock increments and double-entry ledger movements (`StockMovement`) via `inventoryService.receiveStock(..., tx)`.
     - Atomic weighted average cost recomputation and status updates. Mid-way failure guarantees full rollback of all lines.
  2. **Atomic Stock Audit Approval (`stock-audit.service.ts`):**
     - Single `prisma.$transaction` wrapping reconciliation adjustments.
     - Row locking via `SELECT id FROM "StockAudit" WHERE id = ${id} FOR UPDATE` preventing simultaneous double-approvals.
     - Status re-check ensuring strictly `IN_PROGRESS` audits can be approved; second concurrent approve cleanly fails with 400 Bad Request.
     - Atomic variance adjustments recorded directly to ledger via `inventoryService.adjustStock(..., tx)` and audit marked `APPROVED`.
  3. **Concurrency & Rollback Integration Suite (`tests/integration/inventory-concurrency.integration.test.ts`):**
     - 5/5 real DB integration scenarios passing against Neon PostgreSQL:
       1. Concurrent PO receive serialization (Promise.all): exactly one succeeds, stock increases once, no over-receipt.
       2. Mid-way failure rollback: simulated failure on line 2 rolls back line 1 stock and ledger entries.
       3. Sequential partial receiving: 5 units then 5 units smoothly transitions to `RECEIVED`.
       4. Terminal status guard: receives rejected on `RECEIVED` or `CANCELLED` POs (400 Bad Request).
       5. Concurrent audit approve serialization: exactly one succeeds, duplicate approve rejected with 400, exactly one set of ledger adjustments created.




