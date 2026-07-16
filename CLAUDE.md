# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev          # Start dev server (Express + Vite HMR on port 5000)

# Production
npm run build        # Bundle client + server to dist/
npm run start        # Run production server

# Type checking
npm run check        # tsc type check

# Database
npm run db:push      # Push schema changes to DB (Drizzle, no migration files)
npm run db:studio    # Open Drizzle Studio (web-based DB explorer)

# Seeding
npx tsx scripts/seed.ts   # Seed DB with admin user + sample restaurant
```

No test runner is configured in this project.

### Test Credentials (after seeding)

| Role | Email | Password |
|------|-------|----------|
| Super Admin | `admin@posqr.com` | `admin123` |
| Restaurant Admin | `restadmin@flyingfork.com` | `staff123` |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | 64 hex chars (`openssl rand -hex 32`) |
| `SESSION_SECRET` | ✅ | Random string for Express sessions |
| `PORT` | ❌ | Server port (default: `5000`) |
| `STRIPE_SECRET_KEY` | ❌ | Stripe API key for card payments |
| `PAYPAL_CLIENT_ID` | ❌ | PayPal client ID |
| `PAYPAL_CLIENT_SECRET` | ❌ | PayPal client secret |

---

## Architecture Overview

**Multi-tenant Restaurant POS + QR Ordering SaaS.** Monorepo with a single `package.json`. Three code zones:

- `client/` — React 18 + Vite frontend
- `server/` — Express 4 + Socket.IO backend
- `shared/schema.ts` — Single source of truth: Drizzle table definitions + Zod validation schemas shared by both sides

In dev, Express serves all requests; API calls go to Express directly, and `/*` is proxied to the Vite dev server. In production, Express serves the static build from `dist/public/`.

### Path Aliases
- `@/*` → `client/src/*`
- `@shared/*` → `shared/*`

---

## Backend

### Entry Point & Middleware (`server/index.ts`)

Server startup order:
1. Cookie parser + JSON parsing (with `rawBody` capture for Stripe webhooks)
2. Request logging for all `/api` calls
3. Register all routes via `registerRoutes(httpServer, app)`
4. Error handler middleware
5. Static files (production) OR Vite dev server (development)

### Routes (`server/routes.ts`)

A single ~8000-line file with every API endpoint. Organized by domain:

#### Auth (`/api/auth`)
- `POST /api/auth/login` — Email/password → JWT access token + httpOnly refresh cookie
- `POST /api/auth/refresh` — Use httpOnly cookie to get new access token
- `POST /api/auth/logout` — Invalidate refresh token, clear cookie
- `GET /api/auth/me` — Current user with permissions, features, payment methods
- `POST /api/auth/switch-restaurant` — Switch active restaurant (multi-tenant users)

#### Super Admin (`/api/admin`) — requires `requireSuperAdmin`
- Full CRUD on all restaurants, domains, feature allowlists, settings
- Manage restaurant staff and subscription dates
- Audit log access

#### Tenant-Scoped Routes — pattern: `/api/restaurants/:restaurantId/resource`
All require `requireRestaurantAccess` + fine-grained `requirePermission(perm)`.

| Domain | Permission | Key Endpoints |
|--------|-----------|---------------|
| Menu | `menu:read/write` | menus, categories, menu-items, modifier-groups, modifiers |
| Tables | `tables:read/write` | dining tables, QR token generation |
| Orders | `orders:read/write` | create, update status, add/remove items |
| Payments | `payments:read/write` | process, refund, split billing |
| Inventory | `menu:read/write` | items, transactions, alerts |
| Recipe Costing | `menu:read/write` | link menu items to inventory items |
| Stats | `orders:read` | `GET /stats` — orders/revenue today, active orders, occupied tables |

#### Public QR Routes (no auth)
- `GET /api/qr/token/:token` — Resolve token to restaurant
- `GET /api/:tenantSlug/menu` — Public menu for QR customers
- `POST /api/:tenantSlug/orders` — Place order from QR scan

### Auth Middleware (`server/auth/middleware.ts`)

Middleware chain applied per route:
- `authenticate` / `optionalAuth` — verify Bearer JWT
- `requireSuperAdmin` — platform-level admin only
- `requireRestaurantAccess` / `resolveTenantBySlug` / `resolveTenantByDomain` — tenant resolution, sets `req.tenantId`
- `requirePermission(perm)` / `requireRole(role)` — fine-grained access

### Feature Gating (`server/auth/feature-gating.ts`)

Two-layer system, both cached in-memory with expiration:
1. **Hard allowlist** — `restaurant_feature_allowlist` table, set by super admin
2. **Soft toggles** — `restaurant_settings` JSON, set by restaurant admin

Features: `pos`, `qr_ordering`, `online_ordering`, `split_payments`, `inventory`, `recipe_costing`, `stripe`, `paypal`, etc.

### Real-Time (`server/auth/socket-auth.ts`)

Socket.IO with JWT auth. Rooms:
- `tenant:{restaurantId}` — All restaurant staff
- `kitchen:{restaurantId}` — Kitchen staff only
- `order:{orderId}` — Customer order tracking

Events emitted: `order:created`, `order:status-changed`, `order:ready`

### Storage (`server/storage.ts`)

`IStorage` interface with complete CRUD for all entities. Two implementations:
- `MemStorage` — In-memory Maps (development/testing)
- `DatabaseStorage` — PostgreSQL via Drizzle ORM (production)

---

## Database (`shared/schema.ts`)

Drizzle ORM + PostgreSQL. All business tables have `restaurantId` FK for tenant isolation. UUIDs for all PKs (`gen_random_uuid()`).

### Table Groups

**Tenancy:**
- `restaurants` — Core tenant entity (name, slug, address, timezone, currency, tax_rate, subscription dates)
- `restaurant_domains` — Custom domain aliases for white-labeling
- `restaurant_feature_allowlist` — Hard permissions per restaurant
- `restaurant_settings` — Soft JSON toggles per restaurant
- `admin_audit_logs` — Super admin action trail

**Authentication:**
- `users` — Global accounts (email, password hash, `isSuperAdmin`)
- `roles` — Per-restaurant roles with `permissions[]` JSON array
- `restaurant_users` — Junction: user ↔ restaurant, with role + PIN
- `refresh_tokens` — Server-side revocable refresh token store

**Menu:**
- `menus` → `categories` → `menu_items` ↔ `modifier_groups` → `modifiers`
- `menu_item_modifier_groups` — Junction for item ↔ modifier group
- Items have: price, cost, allergens array, tags array, prep time, calories

**Operations:**
- `dining_tables` — Tables with capacity, section, floor plan positions (x/y), status
- `qr_tokens` — Short tokens linked to tables, with scan tracking + expiry
- `orders` — Header (number, status, type: pos/qr/online, subtotal, tax, tip, guest count)
- `order_items` — Line items (denormalized name/price for historical accuracy, modifiers JSON)
- `order_status_history` — Status change audit trail

**Payments:**
- `payments` — Records (method: cash/card/stripe/paypal, status, transaction_id, last_four)
- `split_sessions` — Split type (equal/by_item/by_amount) + status
- `split_shares` — Individual shares with amount, tip, item_ids, payment linkage

**Inventory & Costing:**
- `inventory_items` — Ingredients (unit, current/min/max stock, cost_per_unit)
- `inventory_transactions` — Stock movements (type: restock/usage/waste/adjustment/sale)
- `inventory_alerts` — Auto-generated low stock / out of stock / expiry alerts
- `menu_item_recipes` — BOM linking menu items → inventory items with quantity per sale

Run `npm run db:push` after schema changes. No migration files needed in dev.

---

## Frontend

### App Structure & Routing (`client/src/App.tsx`)

**Provider Stack (outermost → innermost):**
```
QueryClientProvider → ThemeProvider → AuthProvider → SocketProvider → TooltipProvider → Toaster → AppRouter
```

**Route Groups:**
- Public: `/login`, `/unauthorized`, `/order/:token` (QR customer), `/order/status/:orderId`
- Super Admin: `/admin/**` — requires `requireSuperAdmin`
- Dashboard: `/dashboard/**` — restaurant staff
- POS: `/pos/**` — role/permission filtered
- QR Themes: `/qr/themes/**` — standalone theme previews

**`ProtectedRoute` options:** `requireSuperAdmin`, `requireRestaurantAccess`, `requiredPermissions[]`, `allowedRoles[]`

**Default redirect after login:**
- Super Admin → `/admin`
- Kitchen role → `/pos/kitchen`
- Cashier role → `/pos/payments`
- Server role → `/pos/orders`
- All others → `/dashboard`

### Pages

**Dashboard (`/dashboard`):**
| Page | Purpose |
|------|---------|
| `dashboard/index.tsx` | Overview: 4 stat cards (orders/revenue today, active orders, occupied tables), recent orders, quick actions. Refetches every 5 seconds. |
| `dashboard/menu.tsx` | Full CRUD for menus, categories, menu items, modifier groups. Image upload support. |
| `dashboard/tables.tsx` | Table creation/editing, floor plan drag-and-drop positioning, QR code generation. |
| `dashboard/staff.tsx` | Staff listing, role assignment, PIN management. |
| `dashboard/settings.tsx` | Payment method toggles, restaurant info, timezone/currency/tax settings. |
| `dashboard/inventory.tsx` | Stock levels, restock/usage/waste transactions, low stock alerts. |
| `dashboard/recipe-costing.tsx` | Link menu items to inventory items with quantity; calculates food cost per dish. |
| `dashboard/qr-theme-picker.tsx` | Select one of three QR ordering visual themes. |

**POS (`/pos`):**
| Page | Purpose |
|------|---------|
| `pos/orders.tsx` | Active/completed order tabs. Order cards with status actions (accept → prepare → ready → serve). Split billing trigger. Real-time via Socket.IO. |
| `pos/kitchen.tsx` | Kanban KDS: Pending / Preparing / Ready columns. Drag-and-drop. Shows cooking time, modifiers. |
| `pos/payments.tsx` | Payment processing (cash/card/Stripe/PayPal/mobile), refunds, receipt. Split billing support. |

**QR Ordering (public, no auth):**
| Page | Purpose |
|------|---------|
| `qr/[token].tsx` | Browse menu, build cart, select modifiers, add customer info, tip selection, place order. Supports 3 themes. |
| `qr/status/[orderId].tsx` | Live order tracking for QR customers. |
| `qr/themes/luxe-dark.tsx` | Dark luxury theme (self-contained page component). |
| `qr/themes/fresh-minimal.tsx` | Light minimal theme (self-contained page component). |
| `qr/themes/warm-spice.tsx` | Warm earthy theme (self-contained page component). |

**Admin (`/admin`):**
| Page | Purpose |
|------|---------|
| `admin/index.tsx` | All restaurants list with stats. |
| `admin/restaurants/new.tsx` | Create restaurant form. |
| `admin/restaurants/[id].tsx` | Restaurant detail: edit info, manage domains, feature allowlist, staff, audit logs. |

### Auth (`client/src/lib/auth.tsx`)

`AuthContext` holds: `user`, `accessToken`, `isLoading`, `isAuthenticated`.

**Token lifecycle:**
- Access token: 15 min, stored in React state (never localStorage)
- Refresh token: 7 days, httpOnly cookie only
- On app load: calls `POST /api/auth/refresh` to restore session
- On 401: auto-calls refresh, retries original request

**User object includes:** `id`, `email`, `firstName`, `lastName`, `role`, `restaurantId`, `isSuperAdmin`, `permissions[]`, `features{}`, `paymentMethods{}`

### API Calls (`client/src/lib/queryClient.ts`)

- All calls go through `apiRequest(method, url, data)` which injects Bearer token
- TanStack Query for all server state with 30-second default cache
- No refetch on window focus (POS context)

### Socket (`client/src/lib/socket.tsx`)

- Auto-connects when user authenticates (requires `accessToken` + `restaurantId`)
- JWT passed in Socket.IO `auth` option
- Joins `tenant:{restaurantId}` and `kitchen:{restaurantId}` rooms
- On `order:created` / `order:status-changed` events: auto-invalidates React Query caches for orders, tables, stats

### Layouts

| Layout | Used By | Features |
|--------|---------|----------|
| `admin-layout.tsx` | `/admin/**` | Sidebar nav, restaurant list, user dropdown |
| `dashboard-layout.tsx` | `/dashboard/**` | Sidebar with permission-filtered nav, table occupancy badge |
| `pos-layout.tsx` | `/pos/**` | Top tab bar filtered by role + permissions |

### Key Components

- `protected-route.tsx` — Route guard. Exports `hasPermission()`, `hasAnyPermission()` helpers.
- `order-notification.tsx` — Real-time order toast banner, 3-second auto-dismiss.
- `split-billing-dialog.tsx` — Full split billing UI: mode selection, share calculation, per-share payment processing.
- `components/ui/` — ~30+ shadcn/ui component wrappers (Button, Input, Dialog, Table, Toast, etc.)

---

## Key Workflows

### Order Lifecycle (POS)
1. Staff creates order → `POST /api/restaurants/:id/orders`
2. Socket emits `order:created` to `tenant:` + `kitchen:` rooms
3. Kitchen sees order in KDS, updates status: pending → preparing → ready
4. Floor staff marks served, triggers payment
5. Payment processed → order marked complete

### QR Customer Flow
1. Customer scans table QR → `/order/:token`
2. Token resolves restaurant: `GET /api/qr/token/:token`
3. Customer browses: `GET /api/:slug/menu`
4. Places order: `POST /api/:slug/orders`
5. Tracks at `/order/status/:orderId` with live Socket.IO updates

### Split Billing Flow
1. Open order → split billing dialog
2. Choose mode: equal / by-item / by-amount
3. Create session: `POST /api/restaurants/:id/split-sessions`
4. Process each share payment individually
5. Tracked via `split_shares` + `split_share_payments`

### Feature Availability Check
On every page load, `GET /api/auth/me` returns `features{}` + `permissions[]`. The dashboard sidebar hides nav items for disabled features. Route-level `requireFeature()` middleware also blocks API access server-side.

---

## Design Guidelines (`design_guidelines.md`)

**Typography:** Inter for UI/dashboards, DM Sans for headers/branding.

**Layout:**
- Dashboard: 12-column grid, fixed 16rem sidebar
- QR App: Single column mobile-first, max-w-2xl

**Component sizing:** Buttons `h-10` default / `h-12` large, inputs `h-12`, min touch target 44px.

**Patterns:**
- POS: Information-dense, keyboard-friendly, multi-panel
- QR App: Generous whitespace, large touch targets, scroll-driven

**Animations:** Micro-interactions only (button scale, checkbox check). No page transitions.
