# DIANO E-Commerce — Database Schema Specification & Summary

## 1. Overview
The DIANO database is structured as a high-integrity relational model designed for enterprise e-commerce operations in Bangladesh (BDT currency, Asia/Dhaka operational timeline).

- **ORM:** Prisma 7 with `@prisma/adapter-pg` driver adapter.
- **Datasource:** PostgreSQL 16+.
- **Identifier Strategy:** `cuid()` strings (`String @id @default(cuid())`) for all entities (URL-safe, globally unique, sortable, prevents sequential enumeration).
- **Financial Precision:** `Decimal @db.Decimal(12, 2)` for prices and monetary values; `Decimal(18, 4)` for analytics aggregates.
- **Quantities:** Strictly `Int` (no floating-point rounding errors).
- **Temporal Alignment:** All timestamps stored in UTC (`DateTime @default(now())`), business display rendered in `Asia/Dhaka` (+06:00).

---

## 2. Model Groups & Functional Breakdown

### A. Authentication & RBAC (10 Models)
- **`User`**: Core identity table. Tracks verification flags, login locks, avatar, and soft deletion (`deletedAt`).
- **`Role`**: System and custom RBAC roles (`SUPER_ADMIN`, `ADMIN`, `MANAGER`, `ORDER_MANAGER`, `INVENTORY_MANAGER`, `SUPPORT_STAFF`, `CUSTOMER`).
- **`Permission`**: Granular resource:action capabilities (e.g. `order:update_status`, `refund:approve`).
- **`UserRole`**: Many-to-many junction between users and roles (`@@id([userId, roleId])`).
- **`RolePermission`**: Many-to-many junction between roles and permissions (`@@id([roleId, permissionId])`).
- **`Session`**: Active stateful user sessions storing IP, user-agent, device category, OS, browser, and revocation state.
- **`RefreshToken`**: Cryptographic token rotation table with `familyId` and `replacedByTokenId` for token reuse detection.
- **`LoginHistory`**: Security audit table recording successful and failed authentication attempts with client metadata.
- **`OtpCode`**: Hashed OTP storage for phone/email verification, login, and password resets with attempt tracking and expiration.
- **`EmailVerificationToken` & `PasswordResetToken`**: Single-use hashed cryptographic tokens for email verification and password resets.

### B. Customer Profiles, Addresses & Consent (3 Models)
- **`CustomerProfile`**: 1-to-1 extension of `User` tracking loyalty points, total spent, and lifetime order counts.
- **`CustomerAddress`**: Multi-address book (Shipping & Billing) supporting district-level validation and default flags.
- **`ConsentRecord`**: Legal compliance ledger capturing user or guest consent for SMS, Email, and WhatsApp communications with audit timestamps.

### C. Product Catalog (8 Models)
- **`Category`**: Hierarchical category tree (self-relation `parentId`), slugified, with soft deletion.
- **`Product`**: Top-level entity containing SEO metadata (title, description, keywords), publication status, and soft deletion.
- **`ProductVariant`**: Sellable SKU unit with `sku` (unique), `barcode`, `price`, `compareAtPrice`, `costPrice`, and JSON attributes.
- **`ProductImage`**: Product and variant visual assets with primary image indicator and sort ordering.
- **`ProductAttribute`**: Reusable attribute taxonomy (Color, Size, Material).
- **`Tag` & `ProductTag`**: Free-form tagging for merchandising and discovery.
- **`RelatedProduct`**: Cross-sell and up-sell associations (`@@id([productId, relatedProductId])`).

### D. Inventory & Supply Chain (7 Models)
- **`Warehouse`**: Physical storage and fulfillment centers with Dhaka default facility.
- **`Inventory`**: Stock level tracking per variant per warehouse: `onHand`, `reserved`, `damaged`, and `safetyStock`.
- **`StockMovement`**: **Immutable double-entry stock ledger**. Every quantity change records before/after balance, reference type (`ORDER`, `PURCHASE_ORDER`, `AUDIT`, `RETURN`, `MANUAL`), and actor. Updates and deletes are prohibited.
- **`Supplier`**: Vendor directory with soft deletion.
- **`PurchaseOrder`**: Inbound procurement orders with status lifecycle (`DRAFT`, `ORDERED`, `PARTIALLY_RECEIVED`, `RECEIVED`, `CANCELLED`).
- **`PurchaseOrderItem`**: Line-item details of purchase orders with unit cost and received quantity tracking.
- **`StockAudit`**: Periodic stock counting records and discrepancy tracking.

### E. Shopping Cart & Wishlist (4 Models)
- **`Cart`**: Unified cart supporting authenticated users and guest sessions via `guestToken`.
- **`CartItem`**: Unique variant association per cart with price snapshot at addition time.
- **`Wishlist` & `WishlistItem`**: Saved items bookmarked by authenticated customers.

### F. Checkout & Abandoned Cart Recovery (3 Models)
- **`CheckoutSession`**: Multi-step checkout funnel state machine (`ACTIVE`, `ABANDONED`, `RECOVERED`, `CONVERTED`, `EXPIRED`) storing cart snapshots and abandonment timestamps.
- **`CheckoutEvent`**: Granular behavioral funnel analytics tracking steps completed (contains strictly non-PII metadata).
- **`RecoveryAttempt`**: Multi-channel outreach records (SMS, Email) linked to customer consent.

### G. Orders & Fulfillment (4 Models)
- **`Order`**: Master transaction order entity with status lifecycle, idempotency key, financial totals, and immutable customer/address snapshots. **Never deleted**.
- **`OrderItem`**: **Immutable snapshot** storing product name, variant title, SKU, cost price, and unit price captured at checkout. Protects historical financials from catalog edits.
- **`OrderStatusHistory`**: Chronological audit trail of all order transitions.
- **`OrderNote`**: Internal operational notes and customer-facing updates.

### H. Payments & Gateway Events (3 Models)
- **`Payment`**: Financial transaction record supporting SSLCOMMERZ, bKash, Nagad, and Cash-on-Delivery (COD). Unique constraint on `[provider, transactionId]`.
- **`PaymentEvent`**: Raw IPN/webhook callback ledger with signature validity check and `[provider, eventId]` unique constraint to eliminate replay attacks.
- **`Refund`**: Reverse-transaction record tracking partial and full refunds.

### I. Fraud Detection (3 Models)
- **`FraudRule`**: Configurable risk-scoring heuristics (order velocity, high value, address mismatch).
- **`FraudAssessment`**: Automated scoring engine result (0–100 score, Low/Medium/High risk level) with human review status.
- **`FraudDecisionHistory`**: Audit trail of human decisions altering fraud review outcomes.

### J. Shipping & Logistics (5 Models)
- **`ShippingZone`**: Geographic groupings based on districts (e.g. Inside Dhaka, Outside Dhaka).
- **`ShippingMethod`**: Courier delivery configurations with base charge and per-kg incremental rates.
- **`Shipment`**: Fulfillment tracking per order with courier tracking numbers and lifecycle states.
- **`ShipmentEvent`**: Courier milestone events (picked up, in transit, out for delivery).
- **`DeliveryAttempt`**: Recorded delivery visits with failure reasons.

### K. Coupons, Discounts & Flash Sales (4 Models)
- **`Coupon`**: Promotional voucher with percentage or fixed discount, minimum spend, expiry, and user limits.
- **`CouponUsage`**: Prevents coupon abuse with unique constraint on `[couponId, orderId]`.
- **`FlashSale` & `FlashSaleItem`**: Time-boxed product promotions with dedicated stock allocations.

### L. Returns & Refunds (3 Models)
- **`ReturnReason`**: Controlled reason codes (defective, wrong size, changed mind).
- **`ReturnRequest`**: Customer return lifecycle (`REQUESTED`, `APPROVED`, `ITEM_RECEIVED`, `INSPECTED`, `REFUNDED`).
- **`ReturnItem`**: Return inspection outcomes (refund, replace, reject) per order item.

### M. Customer Reviews (2 Models)
- **`Review`**: Product rating (1–5) and commentary restricted to verified purchasers, protected by unique `[userId, productId]`.
- **`ReviewImage`**: Customer-uploaded proof images.

### N. Notifications & Audit Logs (5 Models)
- **`Notification`**: Outbox for Email, SMS, In-App, and Push with unique `dedupeKey` to prevent spamming.
- **`NotificationPreference`**: Opt-in/opt-out toggles per user.
- **`AuditLog`**: **Immutable append-only system ledger** recording all privileged actions (actor, IP, user-agent, target).
- **`Setting`**: Key-value system configurations.
- **`AnalyticsDailySummary`**: Pre-computed daily aggregate rollups (GMV, orders, conversion).
- **`ProductView`**: Product engagement tracking for analytics.

---

## 3. Data Integrity & Constraints (Raw SQL Migration Requirements)

Prisma Schema Language (PSL) cannot express arbitrary relational `CHECK` constraints. When generating the first database migration via `npx prisma migrate dev`, the following `CHECK` constraints **must be appended to the migration SQL script**:

```sql
-- 1. Inventory Integrity
ALTER TABLE "Inventory"
  ADD CONSTRAINT "chk_inventory_on_hand_non_negative" CHECK ("onHand" >= 0),
  ADD CONSTRAINT "chk_inventory_reserved_non_negative" CHECK ("reserved" >= 0),
  ADD CONSTRAINT "chk_inventory_damaged_non_negative" CHECK ("damaged" >= 0),
  ADD CONSTRAINT "chk_inventory_safety_stock_non_negative" CHECK ("safetyStock" >= 0),
  ADD CONSTRAINT "chk_inventory_reserved_within_on_hand" CHECK ("reserved" <= "onHand");

-- 2. Review Rating Boundaries
ALTER TABLE "Review"
  ADD CONSTRAINT "chk_review_rating_1_to_5" CHECK ("rating" >= 1 AND "rating" <= 5);

-- 3. Fraud Scoring Boundaries
ALTER TABLE "FraudAssessment"
  ADD CONSTRAINT "chk_fraud_risk_score_0_to_100" CHECK ("riskScore" >= 0 AND "riskScore" <= 100);

-- 4. Monetary Positivity
ALTER TABLE "ProductVariant"
  ADD CONSTRAINT "chk_variant_price_positive" CHECK ("price" >= 0),
  ADD CONSTRAINT "chk_variant_cost_price_positive" CHECK ("costPrice" IS NULL OR "costPrice" >= 0);

ALTER TABLE "Order"
  ADD CONSTRAINT "chk_order_grand_total_positive" CHECK ("grandTotal" >= 0);

ALTER TABLE "Payment"
  ADD CONSTRAINT "chk_payment_amount_positive" CHECK ("amount" > 0);

-- 5. Product Image Slot Constraints (Partial Unique Indexes for 1 THUMBNAIL and 1 BACKVIEW per product)
-- Note: Max 4 GALLERY slots are enforced in application service layer; raw SQL partial unique indexes enforce database-level single-slot exclusivity.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_product_single_thumbnail"
  ON "ProductImage" ("productId")
  WHERE "slot" = 'THUMBNAIL';

CREATE UNIQUE INDEX IF NOT EXISTS "idx_product_single_backview"
  ON "ProductImage" ("productId")
  WHERE "slot" = 'BACKVIEW';

-- 6. Full-Text & Trigram Fuzzy Search (pg_trgm extension for catalog ILIKE search acceleration)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "idx_product_name_trgm" ON "Product" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_product_description_trgm" ON "Product" USING gin ("description" gin_trgm_ops);
```

---

## 4. Pricing & MRP Architecture (M5b Clear Field Mapping)

| Scope | Field | Purpose | Notes |
|:---|:---|:---|:---|
| **Product Level** | `Product.mrp` | Catalog Base Maximum Retail Price | Top-level baseline reference price. |
| **Product Level** | `Product.discountType` | Discount Engine Method (`NONE`, `PERCENTAGE`, `FIXED`) | Applied at product catalog level. |
| **Product Level** | `Product.discountValue` | Discount Quantum (Decimal) | Percentage (e.g. 15%) or Fixed BDT (e.g. 200 BDT). |
| **Product Level** | *(Dynamic)* `sellingPrice` | Effective Product Base Price | Computed server-side via `calculatePricing({ mrp, discountType, discountValue })`. Never stored directly to avoid stale state. |
| **Variant Level** | `ProductVariant.compareAtPrice` | Variant-Specific MRP Override | Optional strike-through price if variant differs from base `Product.mrp`. |
| **Variant Level** | `ProductVariant.price` | Variant Effective Selling Price | The actual checkout selling price for this specific SKU unit. |
| **Variant Level** | `ProductVariant.costPrice` | Cost of Goods Sold (Internal / COGS) | Strictly hidden from public DTOs; visible only to admins with `product:view_cost`. |

---

## 5. Deletion & Data Retention Policies

| Category | Policy | Models | Rationale |
|:---|:---:|:---|:---|
| **Soft Delete** | `deletedAt DateTime?` | `User`, `Product`, `ProductVariant`, `Category`, `Coupon`, `Supplier` | Preserves referential integrity for historical orders while hiding entries from active catalogs and auth. |
| **Cascade Delete** | `onDelete: Cascade` | `CartItem`, `WishlistItem`, `Session`, `RefreshToken`, `UserRole`, `RolePermission`, `ProductTag`, `RelatedProduct`, `ReviewImage`, `ReturnItem`, `ShipmentEvent`, `DeliveryAttempt`, `FlashSaleItem`, `ProductImage` | Ephemeral, dependent sub-items that have no business purpose if parent entity is deleted. |
| **Strict Restrict** | `onDelete: Restrict` | `Order`, `OrderItem`, `Payment`, `PaymentEvent`, `StockMovement`, `Warehouse`, `Category` (parent), `Supplier` (purchase orders) | Prevents accidental deletion of financial records, stock ledgers, and catalog hierarchies with linked orders. |
| **Immutable Append-Only** | Prohibit Update/Delete | `StockMovement`, `Order`, `OrderItem`, `Payment`, `PaymentEvent`, `AuditLog` | Legal, audit, and tax compliance. Historical transactions must never be modified. |

---

## 6. Architectural Assumptions & Decisions Awaiting Confirmation

1. **`InventoryType` Enum Assumption:**
   - Values: `READY_STOCK` (default in-warehouse items), `PRE_ORDER` (sourced after order), `MADE_TO_ORDER` (custom tailoring / fashion manufacturing on order). Confirmation needed whether backorder tracking needs distinct flags.
2. **Discount Precedence Rule (Product vs Flash-Sale vs Coupon):**
   - **Level 1 (Highest): Flash Sale.** Active flash sale campaign price overrides product base discount and variant price during active window.
   - **Level 2: Product Discount.** Applied to calculate catalog `sellingPrice` via `calculatePricing({ mrp, discountType, discountValue })` when no flash sale is active.
   - **Level 3: Checkout Coupon Code.** Applied on top of item `sellingPrice` or subtotal unless the coupon has `excludeSaleItems: true`.
3. **Guest Checkout Strategy:**
   - Unregistered guests generate a `CheckoutSession` with guest email and phone. When the order is placed, an unactivated `User` account is provisioned with status `PENDING_VERIFICATION` to anchor the `Order.customerId`, enabling seamless account claim later.
4. **Double-Entry Stock Ledger:**
   - Every reservation and release during checkout writes to `StockMovement` as `ORDER_RESERVATION` and updates `Inventory.reserved`. Fulfillment writes `ORDER_FULFILLMENT` and decrements both `onHand` and `reserved`.
5. **Multi-District Shipping Zones:**
   - Instead of separate zone tables for every district, `ShippingZone.districts` stores a JSON array of district names, allowing admins to reassign districts through the admin UI without database migrations.

