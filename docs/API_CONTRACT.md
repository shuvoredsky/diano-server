# DIANO Frontend Developer API Contract & Integration Guide

Welcome to the DIANO E-Commerce API integration guide. This contract defines conventions, headers, data formatting, authentication lifecycles, and error structures for frontend clients (Storefront Web, Admin Dashboard, and Mobile Apps).

---

## 1. Base URL & Endpoints
- **Base Prefix:** `/api/v1`
- **Render Production URL:** `https://<render-service-name>.onrender.com/api/v1`
- **Local Dev URL:** `http://localhost:5000/api/v1`
- **OpenAPI Schema:** `GET /api/docs/openapi.json` (Swagger UI at `/api/docs`)

---

## 2. Standard Response Envelope
All API responses follow a uniform JSON structure:

### Success Response
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Operation completed successfully",
  "data": { ... },
  "meta": {
    "requestId": "c1f7b889-1384-4848-9363-d14cf641870a",
    "timestamp": "2026-11-04T09:30:00.000Z"
  }
}
```

### Paginated Response
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Products retrieved",
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalItems": 150,
    "totalPages": 8,
    "hasNextPage": true,
    "hasPrevPage": false
  },
  "meta": {
    "requestId": "c1f7b889-1384-4848-9363-d14cf641870a",
    "timestamp": "2026-11-04T09:30:00.000Z"
  }
}
```

### Error Response
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    { "field": "phone", "message": "Invalid Bangladeshi phone number (+8801...)" }
  ],
  "requestId": "c1f7b889-1384-4848-9363-d14cf641870a",
  "timestamp": "2026-11-04T09:30:00.000Z"
}
```

---

## 3. Financial & Date Conventions
- **Money Values:** Always returned and accepted as 2-decimal string numbers (e.g. `"1500.00"`, `"60.00"`). Never transmit raw JavaScript floating points to avoid rounding discrepancies. Currency default is **BDT**.
- **Timestamps:** Transmitted over HTTP in ISO-8601 UTC (e.g. `"2026-11-04T06:00:00.000Z"`).
- **Business Day Boundaries:** Business dates, SLA deadlines, and analytics periods calculate relative to **`Asia/Dhaka` (UTC+6)**. The business week starts on **Saturday**.

---

## 4. Authentication & Token Lifecycle
- **Access Token:** Short-lived JWT (15 minutes). Sent in `Authorization: Bearer <token>` header.
- **Refresh Token:** Long-lived rotating token (7 days). Stored in an **HttpOnly, Secure, SameSite=None** cookie (`diano_refresh_token`).
- **Identity & Effective Permissions (`GET /api/v1/auth/me`, `POST /api/v1/auth/admin/login`, `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`):**
  - The `user` summary object includes:
    ```json
    {
      "id": "cuid",
      "email": "staff@diano.com.bd",
      "name": "Staff Name",
      "phone": "+8801700000000",
      "avatarUrl": null,
      "roles": ["support-staff"],
      "permissions": ["abandoned_checkout:read", "customer:read", "notification:read", "order:read", "return:read", "review:read"],
      "isSuperAdmin": false
    }
    ```
  - `permissions` contains only effective permission slugs (`string[]`), never internal database IDs or secrets.
  - For `super-admin`, `isSuperAdmin` is `true` and `permissions` contains the full list of system permission slugs.
  - For `customer` accounts, `permissions` is `[]` and `isSuperAdmin` is `false`.
- **Token Refresh Flow:**
  - When an API request returns `401 Unauthorized`, intercept and call `POST /api/v1/auth/refresh` with credentials enabled (`credentials: 'include'`).
  - The server rotates the refresh token and returns a fresh access token in the response body.
  - Replay the failed original request with the new access token.
  - If refresh fails (401), clear local state and redirect user to `/login`.

---

## 5. Guest Cart & Checkout Identifiers
- **Guest Cart Token (`x-cart-token`):**
  - Stored in browser `localStorage`.
  - Pass header `x-cart-token: <uuid>` on cart endpoints (`/cart`, `/cart/items`).
  - Upon user login, invoke `POST /api/v1/cart/merge` with `x-cart-token` to migrate the guest cart into the customer account.
- **Checkout Secret (`x-checkout-secret`):**
  - Returned when creating a checkout session (`POST /api/v1/checkout/sessions`).
  - Required in header `x-checkout-secret` for all subsequent updates to that checkout session (`/checkout/sessions/:id/*`).

---

## 6. Idempotency Key Header (`Idempotency-Key`)
To prevent duplicate financial transactions during network retries:
- Attach `Idempotency-Key: <unique-uuid>` to mutation requests:
  - `POST /api/v1/orders` (Order Creation)
  - `POST /api/v1/payments/initiate` (Payment Initialization)
  - `POST /api/v1/admin/refunds` (Refund Issuance)
- Repeating the request with the identical key within 24 hours returns the cached response without double-charging or duplicate order creation.

---

## 7. SSLCOMMERZ Payment Flow
1. Client initiates payment: `POST /api/v1/payments/initiate` with `{ orderId, provider: "SSLCOMMERZ" }`.
2. Response returns gateway redirect URL: `{ gatewayUrl: "https://sandbox.sslcommerz.com/..." }`.
3. Client redirects browser to `gatewayUrl`.
4. User completes payment on SSLCOMMERZ:
   - On success: SSLCOMMERZ redirects to `BACKEND_PUBLIC_URL/api/v1/payments/sslcommerz/success`. Backend validates server-to-server and redirects to `CLIENT_URL/order-success?orderNumber=...`.
   - On failure/cancel: Redirects to `CLIENT_URL/checkout?paymentFailed=true`.
   - Background IPN: SSLCOMMERZ sends an asynchronous IPN to `POST /api/v1/payments/sslcommerz/ipn` to ensure order status updates even if user closes browser.

---

## 8. Real-Time Socket.IO Bus (`/socket.io`)
- **Connection Handshake:** Connect to server using Socket.IO v4 client with `{ auth: { token: "<jwt_access_token>" } }`.
- **Rooms (Server-Assigned):**
  - Customer rooms: `user:<userId>`
  - Admin rooms: `admin:all`, `admin:perm:<permission_slug>`
- **Client Restrictions:** Client `socket.emit('join')` is strictly disabled. Rooms are assigned automatically during JWT handshake.
- **Events:**
  - `order:status_changed`: `{ orderId, orderNumber, oldStatus, newStatus }`
  - `payment:completed`: `{ orderId, transactionId, amount }`
  - `inventory:low_stock`: `{ variantId, sku, currentStock }`
  - `notification:new`: `{ id, title, message, channel }`

---

## 9. Media Upload Slots & Guidelines
- **Form Data:** Use `multipart/form-data`.
- **Accepted MIME Types:** `image/jpeg`, `image/png`, `image/webp`.
- **Max File Size:** `2MB` for avatars/banners, `5MB` for product images.
- **Upload Endpoints:**
  - `POST /api/v1/products/:id/images` (Product gallery)
  - `POST /api/v1/banners` (Hero/secondary banners)
  - `POST /api/v1/customers/me/avatar` (User avatar)

---

## 10. Reviews Moderation, Audit Logs & Analytics Extensions
- **Reviews & Ratings:**
  - `GET /api/v1/products/:slug/reviews`: Public endpoint returning only `APPROVED` non-deleted reviews, pagination, and `summary: { averageRating, totalReviews, distribution: { 1..5 } }`.
  - `POST /api/v1/products/:slug/reviews`: Authenticated customer endpoint. Requires a verified `DELIVERED` order item for the product, enforces 1 review per `userId + productId`, strips XSS/HTML tags, accepts optional review images (up to 5 via `multipart/form-data` or URL array), creates the review in `PENDING` status, and enqueues an admin notification (`new_review_admin_alert`).
  - `GET /api/v1/admin/reviews` & `GET /api/v1/admin/reviews/:id`: Requires `review:read` or `review:moderate`.
  - `PATCH /api/v1/admin/reviews/:id/status`: Requires `review:moderate`. Accepts `{ status: "PENDING" | "APPROVED" | "REJECTED", reason?: string }` and transactionally recalculates `Product.averageRating` and `Product.reviewCount`.
  - `DELETE /api/v1/admin/reviews/:id`: Requires `review:moderate`. Soft-deletes the review and recalculates product rating aggregate.
- **Read-Only Audit Logs (Append-Only):**
  - `GET /api/v1/admin/audit-logs` & `GET /api/v1/admin/audit-logs/:id`: Requires `audit:view`. Supports `actor`, `actorId`, `actorType`, `action`, `targetType`, `targetId`, `from`/`to` (Asia/Dhaka date range), `page`, `limit`, and `sortOrder`. Recursively strips sensitive keys (`password`, `token`, `secret`, `authorization`, etc.) and masks IP addresses for non-super-admin viewers.
- **Dashboard Analytics & Charts:**
  - `GET /api/v1/admin/analytics/overview` includes `cards.deliveredSales` alongside `grossSales`, `netSales`, `totalOrders`, `undeliveredOrdersCount`, `grossProfit`, and `netProfit`.
  - `GET /api/v1/admin/analytics/charts/:type` supports `shipment-status` (shipment status distribution) and `stock-by-subcategory` (grouped parent -> child category stock units) in addition to existing chart types.
  - Inventory valuation & stock KPIs (`totalProducts`, `totalStockUnits`, `stockValue`, `damaged`, `damageValue`, `netStockValue`) are served by `GET /api/v1/inventory/summary`.

---

## 11. Flash Sales Management (BG-06)
- **Admin Endpoints:**
  - `GET /api/v1/admin/flash-sales`: List all flash sales with pagination and optional `isActive` filter.
  - `GET /api/v1/admin/flash-sales/:id`: Get detailed flash sale record with associated discounted product variants.
  - `POST /api/v1/admin/flash-sales`: Create flash sale campaign. Overlap conflict checks validate inside transaction (cannot include the same variant in overlapping active sales).
  - `PATCH /api/v1/admin/flash-sales/:id`: Update flash sale schedule (`startsAt`, `endsAt`), metadata (`title`, `description`), item variants, or status (`action: "ACTIVATE" | "CANCEL" | "END"`, `status: "ACTIVE" | "CANCELLED" | "ENDED"`, or boolean `isActive`).
  - `POST /api/v1/admin/flash-sales/:id/cancel`: Deactivates an active flash sale immediately (`isActive = false`).
  - `DELETE /api/v1/admin/flash-sales/:id`: Allowed ONLY if the flash sale has not yet started (`startsAt > now`). Deleting an ongoing or past flash sale returns `400 Bad Request` with instruction to cancel or end instead.

---

## 12. Order Fulfillment & Shipment Tracking Prerequisite (BG-26)
- **Status Transition Guard (`PATCH /api/v1/admin/orders/:id/status`):**
  - Attempting to transition an order's status to `SHIPPED` strictly requires an existing `Shipment` record in the database with a valid `courierName`.
  - If no shipment row exists, or if courier information is missing, the request fails immediately with `400 Bad Request`: `"Cannot transition order to SHIPPED without an existing shipment record. Assign a courier and generate tracking first."`.
  - After dispatch/tracking record is created (`POST /api/v1/admin/orders/:id/shipments`), transitioning to `SHIPPED` succeeds, updates `shippedAt` timestamp, and records timeline and audit history.

---

## 13. Atomic Refunds Engine & Offline Settlement (BG-27)
- **Admin Refund Execution (`POST /api/v1/admin/refunds/orders/:id/refunds`):**
  - **Pessimistic Row Locking:** Acquires database row locks on `Order` and `Payment` records (`FOR UPDATE`) inside an isolated transaction.
  - **Atomic Balance Capping:** Re-reads all prior approved/completed refunds under lock. Rejects any refund request where `requestedAmount > remainingRefundableBalance` with `400 Bad Request`.
  - **Idempotency Guarantee:** Supports `Idempotency-Key` header and request body `idempotencyKey`. Replaying the same key safely returns the existing refund record without creating duplicate disbursements.
  - **Gateway vs Manual Settlement:**
    - **SSLCOMMERZ Online Payments:** When `bankTranId` is present and no `manualReference` is provided, backend calls real SSLCOMMERZ refund validator API (`sslcommerzGateway.initiateRefund`). Failed gateway responses roll back the transaction and return `502 Bad Gateway`.
    - **Manual Offline Payouts:** If operator provides `manualReference` (e.g. bank slip, cash receipt, or BKASH transaction ID), the refund is recorded without calling the online gateway.
    - **COD Refunds:** COD orders always process via manual settlement flow (`providerRefundId` set to `manualReference` or `MANUAL-COD-<timestamp>`).
  - **Order & Payment Status Sync:** Status transitions to `REFUNDED` (if total refunded equals total paid) or `PARTIALLY_REFUNDED`. Pending refunds transition to `REFUND_PENDING` without prematurely marking the order as refunded.

---

## 14. Audit Log Sensitive Field Redaction
- **Pre-Storage Redaction Engine (`src/services/audit.service.ts`):**
  - Prior to writing any `AuditLog` row to PostgreSQL, metadata is recursively scanned and all sensitive fields matching the following 7 categories are stripped:
    1. `password` (e.g. `password`, `oldPassword`, `newPasswordHash`)
    2. `token` (e.g. `accessToken`, `refreshToken`, `apiToken`, `csrfToken`)
    3. `secret` (e.g. `clientSecret`, `webhookSecret`)
    4. `cookie` (e.g. `sessionCookie`, `cookieHeader`)
    5. `authorization` (e.g. `authorization`, `authHeader`)
    6. `otp` (e.g. `smsOtp`, `emailOtp`, `otpCode`)
    7. `card` (e.g. `cardNumber`, `creditCard`, `cardCvv`, `cvv`)
  - Redaction applies recursively through nested objects and arrays before database persistence.


