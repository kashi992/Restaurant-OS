# Restaurant POS + QR Ordering SaaS

## Overview
A full-stack, multi-tenant restaurant Point of Sale (POS) system with QR code ordering capabilities. Built with Node.js, Express, PostgreSQL, React (Vite), Socket.IO, and JWT authentication.

**Purpose**: Enable restaurants to manage orders, menus, and tables through a POS dashboard, while allowing customers to place orders via QR code scanning.

**Current State**: Complete database schema with 20+ tables, seed data with sample restaurant, ready for API implementation.

## Tech Stack
- **Backend**: Express.js, PostgreSQL (Drizzle ORM), JWT, Socket.IO
- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui
- **Routing**: Wouter (frontend), Express (backend)
- **State**: TanStack Query
- **Validation**: Zod + drizzle-zod

## Project Architecture

### Backend (`server/`)
- `index.ts` - Express server entry point, middleware setup
- `routes.ts` - API route definitions with Socket.IO setup
- `db.ts` - PostgreSQL connection using Drizzle ORM
- `storage.ts` - Data storage interface (MemStorage implementation)
- `vite.ts` - Vite dev server integration

### Frontend (`client/src/`)
- `App.tsx` - Main React application component
- `pages/` - Page components (not-found.tsx currently)
- `components/ui/` - shadcn/ui components
- `lib/` - Utilities and API client
- `hooks/` - Custom React hooks

### Shared (`shared/`)
- `schema.ts` - Drizzle ORM schema + Zod validation + TypeScript types

### Scripts (`scripts/`)
- `seed.ts` - Database seed script (creates super admin + sample restaurant)

## Database Schema (Multi-Tenant) - 20+ Tables

### Core Tenant Tables
- **restaurants** - Core tenant entity (id, name, slug, settings, tax rate)
- **restaurant_domains** - Custom domains for white-labeling
- **restaurant_feature_allowlist** - Hard permissions (what features allowed)
- **restaurant_settings** - Soft toggles (JSON config values)

### Users & Authorization
- **users** - Global users (can belong to multiple restaurants)
- **roles** - Permission roles per restaurant (admin, manager, server, kitchen, cashier)
- **restaurant_users** - Junction: users <-> restaurants with role assignment

### Menu Management
- **menus** - Named menus with time availability (Breakfast, Lunch, Dinner)
- **categories** - Menu categories per menu
- **menu_items** - Products with prices, allergens, tags, prep time
- **modifier_groups** - Groups like "Size", "Toppings" with min/max selections
- **modifiers** - Individual options with prices
- **menu_item_modifier_groups** - Junction: items <-> modifier groups

### Tables & QR
- **dining_tables** - Physical tables with floor plan positions
- **qr_tokens** - QR codes for table ordering

### Orders & Payments
- **orders** - Customer orders with status tracking
- **order_items** - Line items (denormalized for historical accuracy)
- **order_status_history** - Audit trail for status changes
- **payments** - Payment records with transaction details
- **split_sessions** - Split payment sessions
- **split_shares** - Individual shares within splits

## API Endpoints

### Health & Status
- `GET /api` - API info
- `GET /api/health` - Server health check
- `GET /api/health/db` - Database connection test

### Authentication (Implemented)
- `POST /api/auth/login` - User login (returns access + refresh tokens)
- `POST /api/auth/logout` - Revoke refresh token (requires auth)
- `POST /api/auth/refresh` - Exchange refresh token for new access token
- `GET /api/auth/me` - Get current user with restaurant associations (requires auth)
- `POST /api/auth/switch-restaurant` - Get new access token for different restaurant context

### Super Admin (Implemented)
- `GET /api/admin/restaurants` - List all restaurants
- `GET /api/admin/restaurants/:restaurantId` - View restaurant details with features, settings, domains
- `POST /api/admin/restaurants` - Create new restaurant
- `PATCH /api/admin/restaurants/:restaurantId` - Update restaurant
- `POST /api/admin/restaurants/:restaurantId/domains` - Add domain to restaurant
- `DELETE /api/admin/restaurants/:restaurantId/domains/:domainId` - Remove domain
- `POST /api/admin/restaurants/:restaurantId/features` - Set/update features (POS, QR, SPLIT, etc)
- `POST /api/admin/restaurants/:restaurantId/settings` - Set/update settings (payment methods, etc)
- `POST /api/admin/restaurants/:restaurantId/suspend` - Suspend restaurant
- `POST /api/admin/restaurants/:restaurantId/restore` - Restore suspended restaurant
- `POST /api/admin/restaurants/:restaurantId/admin` - Create admin user for restaurant
- `GET /api/admin/users` - List all users
- `GET /api/admin/audit-logs` - View audit logs (with filtering)

### Restaurant Staff Management (Implemented)
- `GET /api/restaurants/:restaurantId/staff` - List staff (requires staff:read)
- `POST /api/restaurants/:restaurantId/staff` - Add staff (requires staff:create)
- `PATCH /api/restaurants/:restaurantId/staff/:staffId` - Update staff (requires staff:update)
- `DELETE /api/restaurants/:restaurantId/staff/:staffId` - Remove staff (requires staff:delete)
- `GET /api/restaurants/:restaurantId/roles` - List roles

### Public Endpoints
- `GET /api/restaurants/:tenantSlug` - Get restaurant by slug (public)

### Stubbed (Coming in Future Phases)
- `GET /api/:tenantSlug/menu` - Get tenant menu (Phase 3)
- `GET /api/:tenantSlug/orders` - Get orders (Phase 4)
- `POST /api/:tenantSlug/orders` - Create order (Phase 4)
- `GET /api/:tenantSlug/tables` - Get tables (Phase 5)

## Socket.IO Events
- `join-tenant` - Join tenant room for real-time updates
- `join-kitchen` - Join kitchen room for order updates

## Environment Variables
All secrets managed via `.env` file. See `.env.example` for full list:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - JWT signing secret
- `SESSION_SECRET` - Express session secret
- `PORT` - Server port (default: 5000)

## Development Commands
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run db:push` - Push schema to database
- `npm run db:studio` - Open Drizzle Studio
- `npx tsx scripts/seed.ts` - Seed database with sample data

## Seed Data
Running `npx tsx scripts/seed.ts` creates:
- **Super Admin**: admin@posqr.com / admin123
- **Restaurant**: "The Flying Fork" (slug: flying-fork)
  - 7 feature permissions
  - 6 settings
  - 5 roles (admin, manager, server, kitchen, cashier)
  - 4 staff users
  - 1 menu with 6 categories
  - 19 menu items
  - 3 modifier groups
  - 10 dining tables with QR codes

## Recent Changes
- **2026-01-05**: Phase 4 - Master Company Dashboard APIs complete
  - Added suspendedAt/suspendedReason fields to restaurants table
  - Created admin_audit_logs table for tracking all super admin actions
  - Implemented audit logging helper with action constants
  - Super admin endpoints for complete restaurant management:
    - View restaurant details with features, settings, domains, staff count
    - Update restaurant settings
    - Add/remove custom domains
    - Set/update hard feature permissions (POS, QR, SPLIT, etc)
    - Set/update soft settings (payment methods, etc)
    - Suspend/restore restaurants with reason tracking
    - Create admin users for restaurants (with auto role creation)
    - View audit logs with filtering

- **2026-01-02**: Phase 3 - Feature Gating Engine complete
  - Feature gating middleware with 60-second cache for performance
  - requireFeature() - Hard permissions from restaurant_feature_allowlist (pos, qr, split_payments, etc)
  - requireSoftToggle() - Soft toggles from restaurant_settings with nested path support
  - requirePaymentMethodEnabled() - Payment method validation
  - requireFeatureAndSoftToggle() - Combined check for features that need both
  - Helper functions: getRestaurantFeatures(), checkFeature(), checkSoftToggle(), checkPaymentMethod()
  - Test endpoints at /api/test/feature/*, /api/test/soft-toggle/*, /api/test/payment-method/*
  - Features endpoint: GET /api/restaurants/:restaurantId/features

- **2026-01-02**: Phase 2 - Auth + RBAC + Tenant Resolution complete
  - JWT access tokens (15m expiry) + refresh tokens (7d expiry)
  - Refresh token storage in database with revocation support
  - Auth middleware: authenticate, optionalAuth, loadFullUser
  - RBAC middleware: requireSuperAdmin, requireRestaurantAccess, requirePermission, requireRole
  - Tenant resolution: by domain header, by URL slug, by token context
  - Auth endpoints: login, logout, refresh, me, switch-restaurant
  - Super admin endpoints: list restaurants, list users, create restaurant
  - Staff management: list, create, update, delete restaurant staff
  - Role listing endpoint per restaurant

- **2026-01-02**: Phase 1 - Database schema complete
  - Created comprehensive multi-tenant PostgreSQL schema (20+ tables)
  - Implemented restaurant_feature_allowlist (hard permissions)
  - Implemented restaurant_settings (soft toggles with JSON values)
  - Added modifier system (groups + modifiers + item linking)
  - Added split payment support (sessions + shares)
  - Added order status history for audit trail
  - Created seed script with full sample restaurant
  - Added comprehensive ERD notes to README

## User Preferences
- No Replit-specific services (portable to any VPS/hosting)
- JWT for authentication (not Replit Auth)
- PostgreSQL for data persistence
- Step-by-step prompting approach for building features
