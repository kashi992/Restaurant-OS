# Restaurant POS + QR Ordering SaaS

## Overview
A full-stack, multi-tenant restaurant Point of Sale (POS) system with QR code ordering capabilities. Built with Node.js, Express, PostgreSQL, React (Vite), Socket.IO, and JWT authentication.

**Purpose**: Enable restaurants to manage orders, menus, and tables through a POS dashboard, while allowing customers to place orders via QR code scanning.

**Current State**: Backend foundation complete with health endpoints, database connection, and multi-tenant schema defined. UI development pending.

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

## Database Schema (Multi-Tenant)
- **tenants** - Restaurant entities (id, name, slug, settings)
- **users** - Staff users scoped to tenant (admin, manager, staff, kitchen roles)
- **categories** - Menu categories per tenant
- **menu_items** - Menu items with prices, allergens, tags
- **tables** - Restaurant tables with QR codes
- **orders** - Customer orders with status tracking
- **order_items** - Line items in orders
- **payments** - Payment records

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

## Recent Changes
- **2026-01-02**: Initial backend setup
  - Created multi-tenant PostgreSQL schema
  - Set up Express server with health endpoints
  - Integrated Socket.IO for real-time updates
  - Created storage interface with MemStorage implementation
  - Added comprehensive README and .env.example

## User Preferences
- No Replit-specific services (portable to any VPS/hosting)
- JWT for authentication (not Replit Auth)
- PostgreSQL for data persistence
- Step-by-step prompting approach for building features
