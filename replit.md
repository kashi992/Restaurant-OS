# Restaurant POS + QR Ordering SaaS

## Overview
A full-stack, multi-tenant restaurant Point of Sale (POS) system with integrated QR code ordering. It offers restaurants tools for managing orders, menus, and tables via a POS dashboard, and provides customers a seamless QR code-based ordering experience. The system is designed for scalability and multi-tenancy with a robust database schema.

## User Preferences
- No Replit-specific services (portable to any VPS/hosting)
- JWT for authentication (not Replit Auth)
- PostgreSQL for data persistence
- Step-by-step prompting approach for building features

## System Architecture

### Technical Implementations
- **Backend**: Node.js with Express.js, PostgreSQL via Drizzle ORM, JWT for authentication, and Socket.IO for real-time updates.
- **Frontend**: React 18 with Vite, TypeScript, Wouter for routing, TanStack Query for state management, and Zod for validation.
- **Multi-Tenancy**: Supports multi-tenancy with dedicated tables for `restaurants`, `restaurant_domains`, `restaurant_feature_allowlist`, and `restaurant_settings`.
- **Authentication & Authorization**: Implements JWT-based authentication with access and refresh tokens, refresh token revocation, and role-based access control (RBAC) supporting super admin and various restaurant staff roles.
- **Feature Gating**: A robust feature gating engine uses middleware with caching to enforce hard permissions and soft toggles.
- **Order Management**: Tracks customer orders with detailed line items, status tracking, and an audit trail.
- **Real-time Updates**: Socket.IO enables real-time updates for order notifications, allowing clients to join tenant and kitchen-specific rooms. Frontend Socket.IO client (`client/src/lib/socket.tsx`) connects authenticated users to their restaurant's rooms and auto-invalidates order/table/stats queries on events. A 3-second notification banner (`client/src/components/order-notification.tsx`) shows for new orders.
- **UI/UX Decisions**: Material Design 3 with a warm orange color scheme is used across four frontend applications: Super Admin, Restaurant Dashboard, POS, and QR Customer UI.
- **Frontend Applications**: Four distinct applications cater to different user roles, sharing core infrastructure like AuthProvider and API helpers.

### Feature Specifications
- **Subscription Management**: Tracks `isSuspended`, `subscriptionStartAt`, and `subscriptionEndAt` for restaurants, with status computation and an extension mechanism.
- **Order Management**: Comprehensive CRUD operations for orders, items, status changes, table moves, order merging, and payment recording. POS orders can be created without a table assignment; tables can be assigned/reassigned later via the order detail dialog. Stats refresh immediately after any order mutation.
- **QR Ordering**: Public-facing QR ordering system with rate limiting, timezone-aware menus, and both AUTO/MANUAL ordering modes. QR tokens are short 4-character alphanumeric strings (e.g., "adtk") generated with collision detection. Three selectable ordering page templates (Classic, Bento Grid, Minimal) are configurable per restaurant in `/dashboard/settings` and stored as the `qr_template` setting key.
- **Payment Processing**: Supports optional payment providers (Stripe, PayPal) and "Pay at Counter" options, with staff marking payments and order auto-completion. Payment-first order flow: POS orders require payment before confirmation (payment dialog opens immediately after order creation, auto-confirms on payment). QR orders require online payment (card/PayPal) before placement (order is created as "confirmed" with payment recorded). Backend validation prevents order confirmation without payment.
- **Split Billing**: Full split billing system with three modes: Split Equally (auto-divides by guest count with rounding adjustment), Split by Amount (custom amounts per guest), and Split by Items (assign order items to guests). Each mode creates a split session with individual shares. Shares can be paid independently with different payment methods. Balance tracking per share and per order. Auto-completes order and releases table when all shares are paid. Feature-gated via `split_billing` hard feature + `split_billing_enabled` soft toggle. UI in POS Payments page (`client/src/components/split-billing-dialog.tsx`). Backend routes at `/api/restaurants/:id/orders/:orderId/split/*`.
- **Security**: Authentication persistence uses HTTP-only cookies for refresh tokens. Middleware ensures active restaurant status for dashboard endpoints.

## External Dependencies

- **PostgreSQL**: Primary database for data persistence.
- **Socket.IO**: Used for real-time communication and updates.
- **Stripe (Optional)**: Payment gateway integration.
- **PayPal (Optional)**: Payment gateway integration.