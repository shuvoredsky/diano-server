# DIANO E-Commerce — Backend Engineering Progress Tracker

## Milestone Roadmap & Status

| Milestone | Component / Domain | Status | Notes |
| :--- | :--- | :--- | :--- |
| **M1** | Project Initialization, Express 5, TypeScript, Pino Logger | ✅ Complete | ESM/TS, Config, Middleware architecture |
| **M2** | PostgreSQL Schema, Prisma 7, Driver Adapter, Migrations | ✅ Complete | Neon DB Mode active, raw SQL triggers |
| **M3** | Authentication & RBAC Engine | ✅ Complete | JWT token family rotation, password hashing, sessions |
| **M4** | Customers, Profiles, Addresses, Communication Consent | ✅ Complete | District validation, consent audit records |
| **M5** | Product Catalog, Taxonomy, Attributes, Categories | ✅ Complete | Trigram search, variant attributes, slug uniqueness |
| **M6** | Inventory Management & Double-Entry Stock Movement | ✅ Complete | Append-only StockMovement ledger, reserve/commit/release |
| **M7** | Multi-Warehouse Logistics & Inbound Purchase Orders | ✅ Complete | Tejgaon WH-DHK-01 default facility |
| **M8** | Shopping Cart, Wishlist, Checkout Funnel State Machine | ✅ Complete | Guest tokens, step tracking, abandoned checkout |
| **M9** | Orders, Fulfillment & Immutable PDF Invoicing | ✅ Complete | PDFKit, atomic sequences DN-YYMMDD, INV-YYMM |
| **CMS** | Site Settings, Hero/Secondary Banners, Custom Policy Pages | ✅ Complete | Discriminated union block architecture, rollback revisions |
| **M10a**| Payments Core, SSLCOMMERZ v4 Gateway & Cash on Delivery | ✅ Complete | Zero-trust validation, IPN MD5 hash, retry/reconciliation |
| **M10b**| Mobile Financial Services (bKash & Nagad) | ⏳ Pending | Awaiting confirmation decision |
| **M11** | Fraud Detection & Risk Scoring Heuristics | ⏳ Scheduled | Weight-based assessment engine |
| **M12** | Shipping & Courier Logistics (Pathao, Steadfast) | ⏳ Scheduled | Abstract interface architecture |
| **M13** | Coupons, Promotions & Flash Sales | ⏳ Scheduled | Usage limits and discount types |
| **M14** | Notifications, BullMQ Workers & Scheduled Jobs | ⏳ Scheduled | Email, SMS, reconciliation cron |
