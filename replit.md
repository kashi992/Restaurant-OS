# Restaurant POS + QR Ordering SaaS

## Overview
A full-stack, multi-tenant restaurant Point of Sale (POS) system with integrated QR code ordering capabilities. The system aims to provide restaurants with comprehensive tools for managing orders, menus, and tables via a POS dashboard, while simultaneously offering customers a seamless QR code-based ordering experience. The project includes a robust database schema with over 20 tables and is designed for scalability and multi-tenancy.

## User Preferences
- No Replit-specific services (portable to any VPS/hosting)
- JWT for authentication (not Replit Auth)
- PostgreSQL for data persistence
- Step-by-step prompting approach for building features

## System Architecture

### Technical Implementations
- **Backend**: Node.js with Express.js, PostgreSQL via Drizzle ORM, JWT for authentication, and Socket.IO for real-time updates.
- **Frontend**: React 18 with Vite, TypeScript, Wouter for routing, TanStack Query for state management, and Zod for validation.
- **Multi-Tenancy**: The database schema supports multi-tenancy with dedicated tables for `restaurants` (core tenant entity), `restaurant_domains`, `restaurant_feature_allowlist` (hard permissions), and `restaurant_settings` (soft toggles).
- **Authentication & Authorization**: Implements JWT-based authentication with access and refresh tokens, refresh token revocation, and role-based access control (RBAC) supporting super admin, restaurant staff roles (admin, manager, server, kitchen, cashier), and granular permissions.
- **Feature Gating**: A robust feature gating engine utilizes middleware with caching for performance, enforcing hard permissions from `restaurant_feature_allowlist` and soft toggles from `restaurant_settings`.
- **Order Management**: Tracks customer orders with detailed line items, status tracking (pending, confirmed, preparing, ready, served, completed, cancelled), and an audit trail for status changes via `order_status_history` table.
- **Real-time Updates**: Utilizes Socket.IO for real-time updates, allowing clients to join tenant and kitchen-specific rooms for order notifications.

## API Endpoints Summary

### Authentication (Phase 2)
- `POST /api/auth/login` - Login with email/password
- `POST /api/auth/logout` - Logout and revoke tokens
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/me` - Get current user info

### Super Admin (Phase 4 + 13)
- `GET /api/admin/restaurants` - List all restaurants (with computed status, daysRemaining)
- `POST /api/admin/restaurants` - Create restaurant (with subscription duration)
- `GET /api/admin/restaurants/:id` - Get restaurant details (with subscription info)
- `PATCH /api/admin/restaurants/:id` - Update restaurant
- `POST /api/admin/restaurants/:id/suspend` - Suspend restaurant (sets isSuspended=true)
- `POST /api/admin/restaurants/:id/restore` - Restore restaurant (sets isSuspended=false)
- `POST /api/admin/restaurants/:id/extend` - Extend subscription (months or endDate)

### Restaurant Dashboard - Menu (Phase 5)
- `GET/POST /api/restaurants/:restaurantId/menus` - List/Create menus
- `PATCH/DELETE /api/restaurants/:restaurantId/menus/:menuId` - Update/Delete menu
- `GET/POST /api/restaurants/:restaurantId/menus/:menuId/categories` - Categories
- `GET/POST /api/restaurants/:restaurantId/categories/:categoryId/items` - Menu items

### Restaurant Dashboard - Tables & Settings (Phase 5)
- `GET/POST /api/restaurants/:restaurantId/tables` - List/Create tables
- `POST /api/restaurants/:restaurantId/tables/:tableId/qr-token` - Generate QR
- `GET/PATCH/PUT /api/restaurants/:restaurantId/settings` - Settings management

### Public QR Ordering (Phase 6 - No Auth, Rate Limited)
- `GET /api/order/:token` - Resolve QR token
- `GET /api/order/:token/menu` - Get full menu (timezone-aware)
- `GET /api/order/:token/tables` - Get tables for MANUAL mode
- `POST /api/order` - Create order from cart
- `GET /api/order/:orderId/status` - Get order status with history

### POS Order Management (Phase 7 - Staff)
- `GET /api/restaurants/:restaurantId/orders` - List orders with filters
- `GET /api/restaurants/:restaurantId/orders/live` - Get active orders
- `GET /api/restaurants/:restaurantId/tables/:tableId/orders` - Orders by table
- `GET /api/restaurants/:restaurantId/orders/:orderId` - Single order with items
- `POST /api/restaurants/:restaurantId/orders` - Create POS order
- `POST /api/restaurants/:restaurantId/orders/:orderId/items` - Add items
- `PATCH /api/restaurants/:restaurantId/orders/:orderId/items/:itemId` - Update item
- `DELETE /api/restaurants/:restaurantId/orders/:orderId/items/:itemId` - Remove item
- `PATCH /api/restaurants/:restaurantId/orders/:orderId/status` - Change status
- `PATCH /api/restaurants/:restaurantId/orders/:orderId/table` - Move table
- `POST /api/restaurants/:restaurantId/orders/merge` - Merge orders
- `POST /api/restaurants/:restaurantId/orders/:orderId/payments` - Record payment
- `GET /api/restaurants/:restaurantId/orders/:orderId/payments` - Get payments

### Payments (Phase 8 - Optional Providers)
- `GET /api/payments/providers` - System payment provider status
- `GET /api/restaurants/:restaurantId/payment-methods` - Available methods for restaurant
- `POST /api/order/:orderId/payment/counter` - Create pending counter payment (public)
- `PATCH /api/restaurants/:restaurantId/payments/:paymentId/mark-paid` - Staff mark paid
- `POST /api/restaurants/:restaurantId/payments/stripe/create-intent` - Stripe stub (when configured)
- `POST /api/restaurants/:restaurantId/payments/paypal/create-order` - PayPal stub (when configured)

### Split Billing (Phase 9 - Feature Gated)
- `POST /api/restaurants/:restaurantId/orders/:orderId/split` - Create split session
- `GET /api/restaurants/:restaurantId/orders/:orderId/split` - Get split session with shares
- `POST /api/restaurants/:restaurantId/orders/:orderId/split/lock` - Lock session (no changes)
- `DELETE /api/restaurants/:restaurantId/orders/:orderId/split` - Cancel split session
- `POST /api/restaurants/:restaurantId/orders/:orderId/split/shares/:shareId/pay` - Pay share (partial/full)

## Socket.IO Events (Phase 10)

### Connection Authentication
- Staff: Pass `auth: { token: accessToken }` on connect
- Customer: Pass `auth: { customerToken: trackingToken }` on connect (signed JWT required)
- Unauthenticated connections cannot join protected rooms

### Room Events
- `join-tenant` - Staff only: Join tenant room (requires JWT + restaurant access)
- `join-kitchen` - Staff only: Join kitchen room (requires kitchen permissions)
- `join-order` - Join order-specific room (authorized users only)

### Order Events (emitted to tenant, kitchen, and order rooms)
- `order:created` - New order created (POS or QR)
- `order:new` - New order for kitchen display
- `order:status-changed` - Order status updated (customers receive via order room)
- `order:items-added` - Items added to order
- `order:item-removed` - Item removed from order

### Payment Events
- `payment:completed` - Payment marked as completed
- `split:payment-completed` - Split share payment completed

### Customer Order Tracking
QR orders return a `trackingToken` JWT that customers can use to:
1. Connect to Socket.IO with `auth: { customerToken }` 
2. Auto-join their order room for real-time status updates

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - JWT signing secret
- `SESSION_SECRET` - Express session secret
- `PORT` - Server port (default: 5000)
- `STRIPE_SECRET_KEY` - (Optional) Stripe API key for card payments
- `PAYPAL_CLIENT_ID` - (Optional) PayPal client ID
- `PAYPAL_CLIENT_SECRET` - (Optional) PayPal client secret

## Development Commands
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run db:push` - Push schema to database
- `npx tsx scripts/seed.ts` - Seed database with sample data

## Recent Changes
- **2026-01-30**: Authentication Persistence with HTTP-only Cookies
  - Added cookie-parser middleware for secure cookie handling
  - Login now sets httpOnly refresh token cookie (7-day expiry, lax sameSite)
  - Refresh endpoint reads from cookie first, fallback to body
  - Logout no longer requires valid access token - uses refresh cookie
  - Removed refresh token from JSON response body (security improvement)
  - Client auth restores session on page load via cookie-based refresh
  - Features included in login response for non-super-admin users

- **2026-01-30**: Phase 13 - Subscription Management System Complete
  - Database schema: Added `isSuspended`, `subscriptionStartAt`, `subscriptionEndAt` fields to restaurants
  - Status computation: Priority order is suspended > expired > inactive > active
  - Create restaurant form: Subscription duration selection (1 month to 2 years)
  - Admin dashboard: Shows subscription end date and days remaining with expiration warnings
  - Restaurant detail page: New Subscription tab with extend functionality (+1/3/6/12 months)
  - API endpoints: POST /api/admin/restaurants/:id/extend for subscription extension
  - Suspend/restore: Updated to use `isSuspended` field for manual vs expiration distinction
  - Status badges: Color-coded (green=Active, red=Suspended, orange=Expired, gray=Inactive)
  - Admin settings page created to fix 404 error

- **2026-01-07**: Phase 12 - Deployment Packaging Complete
  - Created .env.example with all environment variables documented
  - PM2 ecosystem config (ecosystem.config.cjs) with cluster mode
  - Nginx reverse proxy config with WebSocket upgrade headers for Socket.IO
  - Database migration script (scripts/migrate.ts)
  - Comprehensive Ubuntu deployment guide (DEPLOY.md)
  - Build system updated with socket.io, bcryptjs, dotenv bundling
  - Verified: `npm run build` and `npm start` work correctly
  - Verified: No Replit-specific runtime dependencies (dev plugins conditionally loaded)

- **2026-01-06**: Phase 11 - Frontend Applications Complete
  - Built 4 frontend applications: Super Admin, Restaurant Dashboard, POS, and QR Customer UI
  - Shared infrastructure: AuthProvider, ThemeProvider, protected routes, API helpers
  - Super Admin: Restaurant list/create, feature toggles, suspend/restore
  - Restaurant Dashboard: Menu manager, tables manager, staff manager, settings
  - POS UI: Table grid, live orders, kitchen display, payment processing
  - QR Customer UI: Mobile-first menu browsing, cart, checkout, order status tracking
  - All frontend components properly aligned with backend API response formats
  - Design system: Material Design 3 with warm orange color scheme

- **2026-01-06**: Phase 10 - Real-time Socket.IO Sync
  - Socket authentication for staff (JWT) and customers (tracking token)
  - Room-based authorization: tenant, kitchen, and order rooms
  - Staff can only join rooms for their restaurant
  - Customers auto-join their order room on connection
  - All events namespaced by restaurant to prevent data leaks
  - QR orders return trackingToken JWT for customer socket auth
  - Order status changes emit to customer order rooms
  - Payment events emit to both staff and customer rooms

- **2026-01-06**: Phase 9 - Split Billing Module
  - Three split modes: A (item-based), B (amount-based), C (equal split)
  - Feature gated: requires split_billing feature + soft toggle enabled
  - Split session per order with shares per payer
  - Partial payments per share with balance tracking
  - Overpayment prevention (blocks payments exceeding share balance)
  - Order auto-completes when all shares fully paid
  - Socket.IO event for split payment completion
  - Feature key: split_billing

- **2026-01-06**: Phase 8 - Payments Module (Optional Providers)
  - Payment providers in DEV mode (no crash when Stripe/PayPal credentials missing)
  - Stripe/PayPal show "not configured" when env vars not set
  - Pay at Counter always available (cash/counter payments)
  - Payment method availability: master allows + restaurant enabled + credentials exist
  - Staff can mark pending payments as paid with optional tips
  - Auto-complete orders when fully paid
  - Socket.IO event for payment completion
  - Feature keys: stripe_payments, paypal_payments, counter_payments

- **2026-01-05**: Phase 7 - POS Order Management APIs complete
  - Create/view orders (list, live, by table, single with items)
  - Add/update/remove order items with total recalculation
  - Status changes (pending→confirmed→preparing→ready→served→completed)
  - Order status history audit trail with user tracking
  - Table move functionality with status management
  - Order merge capability for combining orders
  - Payment recording with auto-complete when fully paid
  - Socket.IO events for real-time kitchen updates
  - All endpoints require POS feature and appropriate permissions

- **2026-01-05**: Phase 6 - Public QR Ordering APIs complete
  - Rate limiting (30 req/min general, 10 req/min for orders)
  - Timezone-aware menu availability windows
  - AUTO/MANUAL QR ordering modes

- **2026-01-05**: Phase 5 - Restaurant Dashboard APIs complete
  - Menu CRUD, modifier system, tables, QR tokens, settings
