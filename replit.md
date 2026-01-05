# Restaurant POS + QR Ordering SaaS

## Overview
A full-stack, multi-tenant restaurant Point of Sale (POS) system with integrated QR code ordering capabilities. The system aims to provide restaurants with comprehensive tools for managing orders, menus, and tables via a POS dashboard, while simultaneously offering customers a seamless QR code-based ordering experience. The project includes a robust database schema with over 20 tables and is designed for scalability and multi-tenancy.

## User Preferences
- No Replit-specific services (portable to any VPS/hosting)
- JWT for authentication (not Replit Auth)
- PostgreSQL for data persistence
- Step-by-step prompting approach for building features

## System Architecture

### UI/UX Decisions
The frontend is built with React 18, Vite, TypeScript, Tailwind CSS, and `shadcn/ui` for a modern and responsive user interface.

### Technical Implementations
- **Backend**: Node.js with Express.js, PostgreSQL via Drizzle ORM, JWT for authentication, and Socket.IO for real-time updates.
- **Frontend**: React 18 with Vite, TypeScript, Wouter for routing, TanStack Query for state management, and Zod for validation.
- **Multi-Tenancy**: The database schema supports multi-tenancy with dedicated tables for `restaurants` (core tenant entity), `restaurant_domains`, `restaurant_feature_allowlist` (hard permissions), and `restaurant_settings` (soft toggles).
- **Authentication & Authorization**: Implements JWT-based authentication with access and refresh tokens, refresh token revocation, and role-based access control (RBAC) supporting super admin, restaurant staff roles (admin, manager, server, kitchen, cashier), and granular permissions. Tenant resolution occurs via domain header, URL slug, or token context.
- **Feature Gating**: A robust feature gating engine utilizes middleware with caching for performance, enforcing hard permissions from `restaurant_feature_allowlist` and soft toggles from `restaurant_settings`.
- **Menu Management**: Comprehensive system for managing menus, categories, menu items, modifier groups, and individual modifiers, including linking items to modifier groups.
- **Table & QR Ordering**: Functionality for defining dining tables, generating unique QR tokens for each table, and supporting public QR ordering with configurable modes (AUTO for table-specific QRs, MANUAL for customer table selection).
- **Order Management**: Tracks customer orders with detailed line items, status tracking, and an audit trail for status changes. Supports payment records and split payment sessions.
- **Real-time Updates**: Utilizes Socket.IO for real-time updates, allowing clients to join tenant and kitchen-specific rooms for order notifications.

### Feature Specifications
- **Core Features**: POS dashboard, QR code ordering, multi-tenant architecture.
- **Admin Capabilities**: Super admin dashboard for managing all restaurants, including creation, updates, domain management, feature/setting configuration, suspension/restoration, and audit logging.
- **Restaurant Staff Management**: CRUD operations for restaurant staff with role assignments.
- **Public QR Ordering API**: Endpoints for resolving QR tokens, fetching menus, creating orders, and checking order status without requiring authentication (rate-limited).
- **Environment Management**: Configuration through `.env` files for sensitive data like `DATABASE_URL`, `JWT_SECRET`, and `SESSION_SECRET`.

## External Dependencies
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Real-time Communication**: Socket.IO
- **Frontend Framework**: React
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui
- **State Management**: TanStack Query
- **Validation**: Zod
- **Authentication**: JSON Web Tokens (JWT)