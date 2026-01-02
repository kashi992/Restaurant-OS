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

### Currently Implemented
- `GET /api` - API info
- `GET /api/health` - Server health check
- `GET /api/health/db` - Database connection test

### Stubbed (Not Implemented Yet)
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Current user
- `GET /api/tenants` - List tenants
- `GET /api/:tenantSlug/menu` - Get tenant menu
- `GET /api/:tenantSlug/orders` - Get orders
- `POST /api/:tenantSlug/orders` - Create order

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
