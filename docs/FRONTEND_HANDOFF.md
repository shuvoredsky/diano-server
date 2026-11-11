# DIANO Admin Panel & Frontend Handoff Guide

This document is the comprehensive integration reference for frontend engineers building the administrative dashboard and client web applications for the **DIANO E-Commerce Platform**.

---

## 1. Architectural & Integration Standards

### A. Base URLs & Communication Protocols
- **API Base URL:** `http://localhost:5000/api/v1` (Dev) / `https://diano-server.onrender.com/api/v1` (Prod)
- **API Specification (OpenAPI / Swagger):**
  - Interactive UI: `/api/docs`
  - JSON Spec: `/api/v1/openapi.json`
- **Real-Time WebSocket Server:** Connected via Socket.IO directly to the root server origin with transports `['websocket', 'polling']`.

### B. Standard API Response Structure (`ApiResponse<T>`)
Every JSON response from the server strictly adheres to this envelope:
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Resource retrieved successfully",
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 128,
    "totalPages": 7,
    "hasNextPage": true,
    "hasPrevPage": false,
    "requestId": "req_cuid_12345",
    "timestamp": "2026-11-07T12:00:00.000Z"
  }
}
```

### C. Authentication & Session Lifecycles
- **Access Token:** Short-lived JWT (15 minutes). Send in the standard HTTP header:
  `Authorization: Bearer <accessToken>`
- **Refresh Token:** Long-lived rotating token (7 days). Stored in an `HttpOnly`, `SameSite=None`, `Secure` cookie named `diano_refresh_token`.
- **Axios / Fetch Setup:** Always enable `withCredentials: true` (or `credentials: 'include'`). On 401 response, trigger silent refresh via `POST /api/v1/auth/refresh`, update memory token, and replay queued requests.
- **CSRF Protection:** Cookie-authenticating state mutations check the incoming request origin against allowlisted frontends (`CLIENT_URL`, `ADMIN_URL`).

### D. Currency, Numbers & Date Standard
- **Currency:** Bangladeshi Taka (BDT ৳). Always calculated on server using Decimal arithmetic. Frontend renders using formatted numbers (`Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT' })`).
- **Timezone:** All backend timestamps are UTC ISO-8601 strings. Frontend converts and displays in Bangladesh Standard Time (`Asia/Dhaka`, UTC+6).

---

## 2. Global Sidebar Navigation & RBAC Permission Matrix

| Sidebar Menu Label | Frontend URL Route | Required Permission Slugs | Icon / Group |
|:---|:---|:---|:---|
| **Dashboard** | `/admin/dashboard` | `order:read` or `inventory:read` | Overview |
| **Catalog: Products** | `/admin/products` | `product:read` | Catalog |
| **Catalog: Categories**| `/admin/categories` | `category:read` | Catalog |
| **Inventory: Overview**| `/admin/inventory` | `inventory:read` | Warehouse |
| **Inventory: Audits** | `/admin/inventory/audits` | `inventory:audit` | Warehouse |
| **Suppliers & PO** | `/admin/procurement` | `supplier:read` | Procurement |
| **Orders** | `/admin/orders` | `order:read` | Sales |
| **Payments & Refunds**| `/admin/payments` | `payment:read` | Finance |
| **Returns** | `/admin/returns` | `return:read` | Customer Care |
| **Shipping Logistics**| `/admin/shipping` | `shipping:manage` | Logistics |
| **Marketing: Coupons**| `/admin/marketing/coupons` | `coupon:manage` | Marketing |
| **Marketing: Flash** | `/admin/marketing/flash-sales`| `coupon:manage` | Marketing |
| **Fraud Review Queue**| `/admin/fraud` | `fraud:manage` | Security |
| **Abandoned Funnels** | `/admin/abandoned` | `order:read` | Retention |
| **Customers** | `/admin/customers` | `customer:read` | Users |
| **CMS: Pages & Banners**| `/admin/cms` | `cms:manage` | Storefront |
| **Reports & BI** | `/admin/reports` | `reports:read` | Analytics |
| **Notifications Queue**| `/admin/notifications` | `notification:read`, `notification:manage` | System |
| **Expenses** | `/admin/expenses` | `expense:manage` | Finance |
| **Reviews Moderation** | `/admin/reviews` | `review:read`, `review:moderate` | Customer Care |
| **Audit Logs** | `/admin/audit-logs` | `audit:view` | Security |
| **Staff & Roles** | `/admin/users` | `user:read`, `role:read` | Administration |

---

## 3. Screen-by-Screen Detailed Integration Guide

### Screen 1: Admin Login & Session Management
- **Route:** `/admin/login`
- **Permissions:** Public (rejects non-staff customer accounts)
- **Primary Endpoints:**
  - `POST /api/v1/auth/admin/login`: `{ email, password }` -> returns `{ user, accessToken }` + sets refresh cookie.
  - `POST /api/v1/auth/refresh`: Rotates refresh token and issues new `accessToken`.
  - `POST /api/v1/auth/logout`: Revokes active refresh token and clears session cookie.
  - `POST /api/v1/auth/logout-all`: Revokes all active sessions across devices.
  - `GET /api/v1/auth/me`: Fetches current user profile and RBAC permissions list.
- **States:**
  - *Error 403:* "Access denied. Only administrative users can log in to the portal."
  - *Rate Limit 429:* Display countdown timer ("Too many login attempts. Retry in X seconds").

---

### Screen 2: Dashboard & Real-Time KPIs
- **Route:** `/admin/dashboard`
- **Permissions:** `analytics:view`, `analytics:view_finance`, `inventory:read`, `inventory:view_cost`
- **Primary Endpoints:**
  - `GET /api/v1/admin/analytics/overview?period=today|yesterday|last_7_days|last_30_days|this_week|last_week|this_month|last_month|this_year|last_year|custom`:
    Returns KPI cards (`grossSales`, `netSales`, `deliveredSales`, `totalOrders`, `aov`, `itemsSold`, `cancellationRate`, `returnRate`, `customerCount`, `repeatCustomerRate`, `grossProfit`, `netProfit`, `undeliveredOrdersCount`) with period comparison.
  - `GET /api/v1/admin/analytics/revenue?period=...`: Returns `grossSales`, `discounts`, `refunds`, `netSales`, `cogs`, `grossProfit`, `expenses` (`total` + `byCategory`), `paymentFees`, and `netProfit`.
  - `GET /api/v1/inventory/summary`: Returns inventory stock & valuation KPIs (`totalProducts`, `totalStockUnits`, `stockValue`, `damaged`, `damageValue`, `netStockValue`). Note: Inventory KPIs are intentionally served from `/api/v1/inventory/summary` and are not duplicated inside `/api/v1/admin/analytics/overview`.
  - `GET /api/v1/admin/analytics/charts/:type`: Supports `sales-trend`, `orders-trend`, `profit-trend`, `payment-method-pie`, `order-status-pie`, `top-categories-bar`, `hourly-heatmap`, `district-choropleth-data`, `shipment-status`, and `stock-by-subcategory`.

#### Dashboard 12 KPIs — Endpoint & Permission Mapping Table

| # | Dashboard KPI Card | Source Endpoint | Response Field Path | Required Permission(s) |
|:--|:---|:---|:---|:---|
| 1 | **Total Products** | `GET /api/v1/inventory/summary` | `data.totalProducts` | `inventory:read` |
| 2 | **Total Stock Units** | `GET /api/v1/inventory/summary` | `data.totalStockUnits` | `inventory:read` |
| 3 | **Stock Value** | `GET /api/v1/inventory/summary` | `data.stockValue` | `inventory:read` + `inventory:view_cost` |
| 4 | **Damaged Units** | `GET /api/v1/inventory/summary` | `data.damaged` | `inventory:read` |
| 5 | **Damage Value** | `GET /api/v1/inventory/summary` | `data.damageValue` | `inventory:read` + `inventory:view_cost` |
| 6 | **Net Stock Value** | `GET /api/v1/inventory/summary` | `data.netStockValue` | `inventory:read` + `inventory:view_cost` |
| 7 | **Gross Sales / Total Sales** | `GET /api/v1/admin/analytics/overview` | `data.cards.grossSales` (or `netSales`) | `analytics:view` |
| 8 | **Delivered Sales** | `GET /api/v1/admin/analytics/overview` | `data.cards.deliveredSales` | `analytics:view` |
| 9 | **Total Orders** | `GET /api/v1/admin/analytics/overview` | `data.cards.totalOrders` | `analytics:view` |
| 10 | **Undelivered Orders** | `GET /api/v1/admin/analytics/overview` | `data.cards.undeliveredOrdersCount` | `analytics:view` |
| 11 | **Total Expenses** | `GET /api/v1/admin/analytics/revenue` | `data.expenses.total` | `analytics:view` + `analytics:view_finance` |
| 12 | **Gross / Net Profit** | `GET /api/v1/admin/analytics/overview` | `data.cards.grossProfit` / `data.cards.netProfit` | `analytics:view` + `analytics:view_finance` |

- **Socket.IO Real-Time Events:**
  - Room: `admin:perm:order:read`
  - Event: `order:created` -> Updates live orders counter badge and latest orders table.
  - Event: `payment:collected` -> Increments today's revenue widget.

---

### Screen 3: Products Management & Cloudinary Image Slots
- **Route:** `/admin/products`, `/admin/products/new`, `/admin/products/:id/edit`
- **Permissions:** `product:read`, `product:create`, `product:update`, `product:delete`, `product:publish`, `product:view_cost`
- **Primary Endpoints:**
  - `GET /api/v1/products/admin/all`: Paginated table with search, category, status (`DRAFT`, `PUBLISHED`, `ARCHIVED`), low stock indicator.
  - `GET /api/v1/products/admin/form-options`: Single-roundtrip payload returning all active categories, specification templates, and warehouses for the creation form.
  - `POST /api/v1/products`: Create product with variants, attribute combinations, specification key-values, and image slots.
  - `PUT /api/v1/products/:id`: Full product update.
  - `PATCH /api/v1/products/:id/publish`: Toggle published status.
  - `POST /api/v1/products/upload-slot`: Upload image to Cloudinary designated slots (`HERO_PRIMARY`, `GALLERY_1`, `GALLERY_2`, `SWATCH_THUMBNAIL`).
- **Cost Privacy Note:** Supplier `costPrice` is only visible if the authenticated user possesses `product:view_cost`. Otherwise, field is omitted or masked.

---

### Screen 4: Category Tree & Visual Hierarchy
- **Route:** `/admin/categories`
- **Permissions:** `category:read`, `category:manage`
- **Primary Endpoints:**
  - `GET /api/v1/categories/admin/all`: Returns hierarchical nested tree of categories with product counts.
  - `POST /api/v1/categories`: Create category (`name`, `slug`, `parentId`, `image`, `sortOrder`).
  - `PUT /api/v1/categories/:id`: Update category details.
  - `PATCH /api/v1/categories/reorder`: Bulk array reordering: `[{ id: "cat_1", sortOrder: 0 }, { id: "cat_2", sortOrder: 1 }]`.
  - `DELETE /api/v1/categories/:id`: Soft delete category (rejected if child products exist).

---

### Screen 5: Inventory Control, Ledger & Stock Audits
- **Route:** `/admin/inventory`, `/admin/inventory/movements`, `/admin/inventory/audits`
- **Permissions:** `inventory:read`, `inventory:manage`, `inventory:adjust`, `inventory:audit`, `inventory:view_cost`
- **Primary Endpoints:**
  - `GET /api/v1/inventory/overview`: Aggregated variant stock by warehouse with low-stock badges.
  - `GET /api/v1/inventory/movements`: Append-only immutable movement ledger (`PURCHASE_RECEIPT`, `SALE_DEDUCTION`, `RETURN_RESTOCK`, `MANUAL_ADJUSTMENT`, `TRANSFER_IN`, `TRANSFER_OUT`).
  - `POST /api/v1/inventory/adjust`: Manual stock adjustment (`variantId`, `warehouseId`, `quantityDelta`, `reason`, `notes`).
  - `POST /api/v1/inventory/transfer`: Inter-warehouse stock transfer.
  - `POST /api/v1/inventory/audits`: Create audit cycle; `POST /api/v1/inventory/audits/:id/items` records physical count; `POST /api/v1/inventory/audits/:id/complete` reconciles discrepancies into the ledger.
- **Socket.IO Real-Time Events:**
  - Room: `admin:perm:inventory:manage`
  - Event: `stock:low_alert` -> Trigger notification toast when variant falls below `alertThreshold`.

---

### Screen 6: Procurement & Purchase Orders
- **Route:** `/admin/suppliers`, `/admin/purchase-orders`
- **Permissions:** `supplier:read`, `supplier:manage`
- **Primary Endpoints:**
  - `GET /api/v1/suppliers`: Supplier directory (`name`, `contactPerson`, `phone`, `email`, `leadTimeDays`).
  - `POST /api/v1/suppliers`: Create supplier profile.
  - `GET /api/v1/purchase-orders`: List purchase orders (`DRAFT`, `SUBMITTED`, `PARTIALLY_RECEIVED`, `COMPLETED`, `CANCELLED`).
  - `POST /api/v1/purchase-orders`: Draft PO with item lines (`variantId`, `expectedQuantity`, `unitCostPrice`).
  - `POST /api/v1/purchase-orders/:id/receive`: Receive batch with quantity verified and batch tracking -> automatically posts `PURCHASE_RECEIPT` into stock ledger and updates average cost.

---

### Screen 7: Orders Management & Dispatch
- **Route:** `/admin/orders`, `/admin/orders/:id`
- **Permissions:** `order:read`, `order:update`, `order:cancel`
- **Primary Endpoints:**
  - `GET /api/v1/admin/orders`: Paginated filterable table (`status`, `paymentStatus`, `dateRange`, `search`, `fraudRisk`).
  - `GET /api/v1/admin/orders/:id`: Complete order view with customer info, order items, invoice summary, timeline history, internal notes, and shipment details.
  - `PATCH /api/v1/admin/orders/:id/status`: Transition order status (`CONFIRMED`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `CANCELLED`).
  - `POST /api/v1/admin/orders/:id/notes`: Add staff note with internal visibility.
  - `GET /api/v1/admin/orders/:id/invoice`: PDF binary stream download for customer packing slip / invoice.
- **Socket.IO Real-Time Events:**
  - Room: `admin:perm:order:read`
  - Event: `order:status_changed`: Live UI update on detail view and table badge.

---

### Screen 8: Payments & Instant Refunds
- **Route:** `/admin/payments`, `/admin/refunds`
- **Permissions:** `payment:read`, `payment:manage`, `refund:manage`
- **Primary Endpoints:**
  - `GET /api/v1/admin/payments`: Paginated transaction list (SSLCOMMERZ transaction ID, COD tracking, status `PENDING`, `COMPLETED`, `FAILED`, `REFUNDED`).
  - `POST /api/v1/admin/payments/:id/mark-cod-collected`: Courier delivery confirmation -> transitions COD payment to `COMPLETED`.
  - `POST /api/v1/admin/refunds`: Initiates partial or full refund (`orderId`, `amount`, `reason`, `idempotencyKey`).
- **Idempotency Safeguard:** Frontend MUST pass a unique UUID in `idempotencyKey` on refund submissions to prevent double-charging on network dropouts.

---

### Screen 9: Returns & Reverse Logistics
- **Route:** `/admin/returns`, `/admin/returns/:id`
- **Permissions:** `return:read`, `return:manage`
- **Primary Endpoints:**
  - `GET /api/v1/admin/returns`: Return requests queue (`REQUESTED`, `APPROVED`, `REJECTED`, `RECEIVED`, `RESTOCKED`, `REFUNDED`).
  - `PATCH /api/v1/admin/returns/:id/status`: Approve or reject initial customer claim.
  - `POST /api/v1/admin/returns/:id/receive`: Warehouse inspection -> records physical condition of returned goods (`RESTOCKABLE` vs `DAMAGED`).
  - `POST /api/v1/admin/returns/:id/restock-and-refund`: Automatically returns salable units to stock ledger and processes proportional refund.

---

### Screen 10: Shipping Zones, Couriers & Shipments
- **Route:** `/admin/shipping/zones`, `/admin/shipping/methods`, `/admin/shipments`
- **Permissions:** `shipping:manage`
- **Primary Endpoints:**
  - `GET /api/v1/admin/shipping/zones`: Geographical zones (e.g. Inside Dhaka, Suburbs, Outside Dhaka).
  - `POST /api/v1/admin/shipping/zones`: Create or edit zone districts.
  - `GET /api/v1/admin/shipping/methods`: Delivery tiers (Standard 2-3 Days, Express 24h, Free Shipping thresholds).
  - `PATCH /api/v1/admin/shipments/:id/status`: Courier tracking update (`PICKED_UP`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`, `DELIVERED`, `FAILED_DELIVERY`).
  - *Automated Side Effect:* Setting shipment to `DELIVERED` automatically transitions the parent Order to `DELIVERED`.

---

### Screen 11: Marketing: Coupons & Flash Sales
- **Route:** `/admin/marketing/coupons`, `/admin/marketing/flash-sales`
- **Permissions:** `coupon:manage`
- **Primary Endpoints:**
  - `GET /api/v1/admin/coupons`: Coupon rules (`code`, `discountType` PERCENT/FIXED, `minimumSpend`, `usageLimitPerUser`, `totalUsageLimit`, validity dates).
  - `POST /api/v1/admin/coupons`: Create promotion code with strict rules.
  - `GET /api/v1/admin/flash-sales`: Scheduled limited-duration campaigns.
  - `POST /api/v1/admin/flash-sales`: Schedule sale with dedicated allocated variant quantities and campaign pricing.

---

### Screen 12: Fraud Detection & Security Review Queue
- **Route:** `/admin/fraud`
- **Permissions:** `fraud:manage`
- **Primary Endpoints:**
  - `GET /api/v1/admin/fraud/reviews`: Filterable list of orders placed in `PENDING_REVIEW` or `HELD` status.
  - `GET /api/v1/admin/fraud/rules`: Active heuristic rules (velocity checks, high-value threshold, IP geolocation mismatch, disposable email blocks).
  - `POST /api/v1/admin/fraud/reviews/:id/decision`: Staff review action: `APPROVE` (releases order for processing), `REJECT` (cancels order and voids payment), or `CHALLENGE_OTP` (dispatches customer SMS challenge).
- **Socket.IO Real-Time Events:**
  - Room: `admin:perm:fraud:manage`
  - Event: `fraud:held_alert` -> High-risk order held alert requiring immediate investigation.

---

### Screen 13: Abandoned Checkout Funnels & Customer Recovery
- **Route:** `/admin/abandoned`
- **Permissions:** `order:read`
- **Primary Endpoints:**
  - `GET /api/v1/abandoned-checkouts/stats`: Funnel drop-off breakdown across steps (`CONTACT_INFO` -> `SHIPPING_ADDRESS` -> `PAYMENT_METHOD` -> `COMPLETED`).
  - `GET /api/v1/abandoned-checkouts`: List of recoverable sessions older than 30 minutes with item contents and customer contact info.
  - `POST /api/v1/abandoned-checkouts/:id/recover`: Dispatches automated notification recovery email/SMS with pre-filled cart link.

---

### Screen 14: Customer Directory & Consent Profiles
- **Route:** `/admin/customers`, `/admin/customers/:id`
- **Permissions:** `customer:read`, `customer:manage`
- **Primary Endpoints:**
  - `GET /api/v1/customers`: Searchable customer list with total orders, lifetime value (LTV), and account status.
  - `GET /api/v1/customers/:id`: Customer detail view, saved delivery addresses, consent logs (SMS/Email marketing granted), order timeline, and internal staff notes.
  - `POST /api/v1/customers/:id/notes`: Record customer service notes.
  - `PATCH /api/v1/customers/:id/status`: Ban, freeze, or restore customer account.

---

### Screen 15: CMS: Banners, Pages & Versioning
- **Route:** `/admin/cms/banners`, `/admin/cms/pages`
- **Permissions:** `cms:manage`
- **Primary Endpoints:**
  - `GET /api/v1/banners`: Hero sliders and promotional placement banners with date scheduling.
  - `POST /api/v1/banners`: Create banner with Cloudinary asset and target link.
  - `GET /api/v1/pages`: Storefront legal & informational pages (Terms, Privacy, About, Returns).
  - `POST /api/v1/pages`: Create versioned page with draft preview and published revisions history.
  - `GET /api/v1/pages/:id/revisions`: Audit list of historical edits; rollback capability.

---

### Screen 16: Reports & Business Intelligence Streaming
- **Route:** `/admin/reports`
- **Permissions:** `reports:read`
- **Primary Endpoints:**
  - `GET /api/v1/admin/reports/sales?period=...&format=json`: Aggregated summary KPIs.
  - `GET /api/v1/admin/reports/sales/stream?format=csv`: High-performance streaming CSV export for large data sets (supports 50,000+ rows without browser memory overload).
  - `GET /api/v1/admin/reports/sales/stream?format=xlsx`: Formatted Excel spreadsheet export.
  - `GET /api/v1/admin/reports/inventory/stream?format=csv`: Stock valuation report with current quantities and unit costs.

---

### Screen 17: Notification Outbox & Delivery Monitoring
- **Route:** `/admin/notifications`
- **Permissions:** `settings:manage`
- **Primary Endpoints:**
  - `GET /api/v1/admin/notifications`: Outbox list with channel (`EMAIL`, `SMS`, `ADMIN_IN_APP`), status (`PENDING`, `PROCESSING`, `SENT`, `FAILED`, `DEAD`), attempts count, and error messages.
  - `POST /api/v1/admin/notifications/:id/retry`: Manual retry for failed or dead-letter notifications.

---

### Screen 18: Staff Users, Roles & Permissions Assignment
- **Route:** `/admin/users`, `/admin/roles`
- **Permissions:** `user:read`, `user:create`, `user:manage`, `role:read`, `role:manage`
- **Primary Endpoints:**
  - `GET /api/v1/users`: Staff member list with active statuses and assigned roles.
  - `POST /api/v1/users`: Create staff account with temporary credentials and role assignment.
  - `PATCH /api/v1/users/:id/status`: Suspend or reactivate staff member.
  - `GET /api/v1/roles`: System and custom RBAC roles with assigned granular permission tags.
  - `POST /api/v1/roles`: Create custom role; `PUT /api/v1/roles/:id` updates attached permission slugs.
  - `GET /api/v1/permissions`: Complete directory of all 72 system permission slugs grouped by resource.

---

### Screen 19: Operating Expenses & Financial Audits
- **Route:** `/admin/expenses`
- **Permissions:** `expense:manage`
- **Primary Endpoints:**
  - `GET /api/v1/admin/expenses`: Filterable ledger by category (`PACKAGING`, `SHIPPING`, `MARKETING`, `SALARIES`, `WAREHOUSE_RENT`, `OFFICE_SUPPLIES`, `SOFTWARE_FEES`, `OTHER`).
  - `POST /api/v1/admin/expenses`: Record operating expense (`amount`, `category`, `incurredAt`, `notes`, `receiptUrl`).
  - `GET /api/v1/admin/analytics/revenue`: Net profit margin calculation combining gross sales, cost of goods sold (COGS), refunds, and operating expenses.

---

### Screen 20: Reviews & Moderation Queue
- **Route:** `/admin/reviews`
- **Permissions:** `review:read`, `review:moderate`
- **Primary Endpoints:**
  - `GET /api/v1/admin/reviews`: Filterable moderation queue (`status`: `PENDING | APPROVED | REJECTED`, `rating`: `1..5`, `productId`, `productSlug`, `search`, `page`, `limit`).
  - `GET /api/v1/admin/reviews/:id`: Single review detail with customer summary, product info, and uploaded review images.
  - `PATCH /api/v1/admin/reviews/:id/status`: Transition review status (`PENDING | APPROVED | REJECTED` + optional `reason`) and atomically recalculate `Product.averageRating` and `Product.reviewCount`.
  - `DELETE /api/v1/admin/reviews/:id`: Soft-delete review and recalculate product rating aggregate.
  - Storefront endpoints: `GET /api/v1/products/:slug/reviews` (public approved reviews + rating distribution summary) and `POST /api/v1/products/:slug/reviews` (verified delivered purchase required).

---

### Screen 21: Read-Only System Audit Logs
- **Route:** `/admin/audit-logs`
- **Permissions:** `audit:view`
- **Primary Endpoints:**
  - `GET /api/v1/admin/audit-logs`: Append-only, read-only audit log explorer with filters (`actor`, `actorId`, `actorType`, `action`, `targetType`, `targetId`, `from`, `to` in `Asia/Dhaka`, `page`, `limit`, `sortOrder`).
  - `GET /api/v1/admin/audit-logs/:id`: Single audit log entry detail with recursive sensitive metadata redaction and role-aware IP masking.

---

## 4. Real-Time Socket.IO Client Architecture

```typescript
import { io, Socket } from 'socket.io-client';

export function initializeAdminSocket(token: string): Socket {
  const socket = io(process.env.NEXT_PUBLIC_API_URL, {
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    console.info('⚡ Real-time admin WebSocket connected:', socket.id);
  });

  socket.on('connect_error', (error) => {
    console.warn('WebSocket connection error:', error.message);
  });

  return socket;
}
```

### Event Registry by Feature:
1. **Orders (`admin:perm:order:read`):**
   - `order:created` -> `{ orderId, orderNumber, grandTotal, customerName }`
   - `order:status_changed` -> `{ orderId, oldStatus, newStatus }`
2. **Inventory (`admin:perm:inventory:manage`):**
   - `stock:low_alert` -> `{ variantId, sku, productName, currentStock, threshold }`
   - `stock:adjusted` -> `{ variantId, delta, newAvailable }`
3. **Fraud & Risk (`admin:perm:fraud:manage`):**
   - `fraud:held_alert` -> `{ orderId, orderNumber, riskScore, reason }`
4. **Notifications (`admin:all` / user-specific):**
   - `notification:in_app` -> `{ id, title, message, actionUrl }`
