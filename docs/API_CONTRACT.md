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

