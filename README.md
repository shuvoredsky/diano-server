# DIANO Server (Backend API)

DIANO is an enterprise-grade e-commerce backend platform built as a clean Modular Monolith using TypeScript, Express, Prisma ORM, Redis, and BullMQ.

---

## 🛠️ Technology Stack
- **Runtime:** Node.js (v20+ / v24 LTS)
- **Language:** TypeScript 5+ (Strict Mode)
- **Framework:** Express.js 5
- **ORM:** Prisma Client & Schema
- **Cache & Queues:** Redis (ioredis), BullMQ
- **Logging:** Pino with Pino-HTTP (Sensitive data redaction enabled)
- **Validation:** Zod
- **Testing:** Vitest & Supertest
- **Linting & Formatting:** ESLint (Flat Config) & Prettier

---

## 📁 Project Structure

```
diano-server/
├── prisma/               # Prisma schema & seed scripts
├── src/
│   ├── config/           # Validated env, DB client, Redis client
│   ├── constants/        # System & domain constants
│   ├── docs/             # API specifications & schema documentation
│   ├── jobs/             # BullMQ queue processors & background workers
│   ├── middlewares/      # Error handler, rate limiter, request-id, not-found
│   ├── modules/          # Modular domain slices (auth, products, orders, etc.)
│   ├── routes/           # Express routers (central rootRouter & health routes)
│   ├── services/         # Shared cross-cutting domain services
│   ├── sockets/          # Socket.io real-time event handlers
│   ├── types/            # Shared TypeScript type definitions
│   ├── utils/            # ApiResponse, AppError, date.util, currency.util, logger
│   ├── app.ts            # Express application setup
│   └── server.ts         # HTTP server entrypoint with graceful shutdown
├── tests/
│   ├── unit/             # Isolated unit tests
│   └── integration/      # API endpoint integration tests
├── .env.example          # Environment variable template
├── .gitignore            # Git ignore specification
├── eslint.config.mjs     # ESLint flat configuration
├── tsconfig.json         # Strict TypeScript configuration
└── vitest.config.ts      # Vitest configuration with path aliases
```

---

## 🚀 Quick Start (Local Setup)

### 1. Prerequisites
- Node.js `v20+` or `v24 LTS`
- npm `v10+`

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure strong secrets are defined for `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_RESET_PASSWORD_SECRET`, and `COOKIE_SECRET`.

### 4. Available Scripts

| Script | Description |
|:---|:---|
| `npm run dev` | Starts server with `tsx watch` for hot-reloading |
| `npm run build` | Compiles TypeScript into `dist/` |
| `npm start` | Runs compiled production server from `dist/server.js` |
| `npm run typecheck` | Validates TypeScript types across the codebase |
| `npm run lint` | Runs ESLint flat config |
| `npm test` | Runs all Vitest test suites |
| `npm run test:watch` | Runs Vitest in interactive watch mode |
| `npm run prisma:generate`| Generates Prisma client types |
| `npm run storage:check` | Diagnostics: Tests Cloudinary credentials, uploads a probe image, and verifies cleanup |

---

## ☁️ Storage Diagnostics (Cloudinary)

To safely verify Cloudinary signed upload and deletion without leaking credentials:
```bash
npm run storage:check
```
- **If configured:** Uploads a 1x1 probe image to `diano/diagnostics`, prints the generated secure URL and responsive variants, and immediately destroys the test asset.
- **If not configured:** Prints a clean diagnostic message and exits without error.
- **Security:** Secret keys and API secrets are never output or logged.

---

## 🩺 Health & Readiness Probes

- **Liveness Probe:** `GET /api/v1/health`
  - Returns `200 OK` if the HTTP server is alive. Works completely independently of external infrastructure.
- **Readiness Probe:** `GET /api/v1/ready`
  - Checks PostgreSQL database and Redis connectivity.
  - Returns `200 OK` when both dependencies are ready.
  - Returns `503 Service Unavailable` with details when any dependency is disconnected.

---

## 🔌 Connecting PostgreSQL & Redis Later

When Docker Desktop or local services are available, start them with:
```bash
docker compose -f docker-compose.dev.yml up -d
```
Update `.env` with your credentials:
```env
DATABASE_URL="postgresql://diano:diano_dev_password@localhost:5432/diano_dev?schema=public"
REDIS_URL="redis://localhost:6379"
```
Then run Prisma migrations:
```bash
npx prisma migrate dev
```
