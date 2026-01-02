# Restaurant POS + QR Ordering SaaS

A full-stack, multi-tenant restaurant Point of Sale (POS) system with QR code ordering capabilities. Built with Node.js, Express, PostgreSQL, React (Vite), Socket.IO, and JWT authentication.

## Features

- **Multi-Tenant Architecture**: Each restaurant operates independently with isolated data
- **POS Dashboard**: Staff interface for order management, menu editing, and table management
- **QR Code Ordering**: Customers scan table QR codes to view menus and place orders
- **Real-Time Updates**: Socket.IO for live order status updates between kitchen and floor
- **Role-Based Access**: Admin, Manager, Staff, and Kitchen roles
- **Portable Deployment**: Runs on any Node.js hosting/VPS with PostgreSQL

## Tech Stack

### Backend
- **Runtime**: Node.js 20+
- **Framework**: Express.js
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: JWT (JSON Web Tokens)
- **Real-Time**: Socket.IO
- **Validation**: Zod

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS + shadcn/ui
- **State Management**: TanStack Query
- **Routing**: Wouter

## Project Structure

```
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Page components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── lib/            # Utilities and API client
│   │   └── App.tsx         # Main app component
│   └── index.html
│
├── server/                 # Express backend
│   ├── db.ts               # Database connection
│   ├── index.ts            # Server entry point
│   ├── routes.ts           # API route definitions
│   ├── storage.ts          # Data storage interface
│   ├── static.ts           # Static file serving
│   └── vite.ts             # Vite dev server integration
│
├── shared/                 # Shared code between frontend and backend
│   └── schema.ts           # Database schema and TypeScript types
│
├── scripts/                # Utility scripts
│   └── seed.ts             # Database seed script
│
├── .env.example            # Environment variables template
├── drizzle.config.ts       # Drizzle ORM configuration
├── package.json            # Dependencies and scripts
├── tailwind.config.ts      # Tailwind CSS configuration
├── tsconfig.json           # TypeScript configuration
└── vite.config.ts          # Vite configuration
```

## Prerequisites

- Node.js 20 or higher
- PostgreSQL 14 or higher
- npm or yarn

## Local Development Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd restaurant-pos
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# Database
DATABASE_URL=postgresql://username:password@localhost:5432/restaurant_pos

# JWT Secret (generate with: openssl rand -hex 64)
JWT_SECRET=your-super-secret-key

# Session Secret
SESSION_SECRET=your-session-secret

# Server
PORT=5000
NODE_ENV=development
```

### 4. Set Up the Database

Create a PostgreSQL database:

```bash
createdb restaurant_pos
```

Push the schema to the database:

```bash
npm run db:push
```

### 5. Seed the Database (Optional)

Populate the database with sample data:

```bash
npx tsx scripts/seed.ts
```

This creates:
- Super Admin: `admin@posqr.com` / `admin123`
- Sample Restaurant: "The Flying Fork" with full menu, tables, and staff

### 6. Start the Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:5000`.

## Database Schema

### Entity Relationship Diagram (ERD)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MULTI-TENANT CORE                               │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌─────────────────────┐     ┌──────────────────────────┐
│  restaurants │────<│ restaurant_domains  │     │ restaurant_feature_      │
│──────────────│     │─────────────────────│     │ allowlist                │
│ id (PK)      │     │ id (PK)             │     │──────────────────────────│
│ name         │     │ restaurant_id (FK)  │────>│ id (PK)                  │
│ slug (UNIQ)  │     │ domain (UNIQ)       │     │ restaurant_id (FK)       │
│ address      │     │ is_primary          │     │ feature_key              │
│ city/state   │     │ is_verified         │     │ is_enabled               │
│ country      │     │ ssl_enabled         │     │ expires_at               │
│ timezone     │     └─────────────────────┘     └──────────────────────────┘
│ currency     │
│ tax_rate     │     ┌─────────────────────┐
│ is_active    │────<│ restaurant_settings │
│ timestamps   │     │─────────────────────│
└──────────────┘     │ id (PK)             │
       │             │ restaurant_id (FK)  │
       │             │ setting_key         │
       │             │ setting_value (JSON)│
       │             └─────────────────────┘
       │
       │
┌──────────────────────────────────────────────────────────────────────────────┐
│                           USERS & AUTHORIZATION                               │
└──────────────────────────────────────────────────────────────────────────────┘
       │
       │         ┌──────────────────┐
       │         │      users       │
       │         │──────────────────│
       │         │ id (PK)          │
       │         │ email (UNIQ)     │
       │         │ password         │
       │         │ first/last_name  │
       │         │ is_super_admin   │
       │         │ is_active        │
       │         │ timestamps       │
       │         └────────┬─────────┘
       │                  │
       │    ┌─────────────┴────────────┐
       │    │                          │
       ▼    ▼                          ▼
┌──────────────────┐          ┌──────────────────┐
│      roles       │          │ restaurant_users │
│──────────────────│          │──────────────────│
│ id (PK)          │          │ id (PK)          │
│ restaurant_id(FK)│◄────────>│ restaurant_id(FK)│
│ name             │          │ user_id (FK)     │
│ description      │          │ role_id (FK)     │◄─┐
│ permissions(JSON)│          │ pin              │  │
│ is_system_role   │──────────│ is_active        │  │
└──────────────────┘          │ hired_at         │  │
                              └──────────────────┘  │
                                                    │
┌──────────────────────────────────────────────────────────────────────────────┐
│                              MENU MANAGEMENT                                  │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌──────────────────┐     ┌──────────────────────────────┐
│    menus     │────<│   categories     │────<│        menu_items            │
│──────────────│     │──────────────────│     │──────────────────────────────│
│ id (PK)      │     │ id (PK)          │     │ id (PK)                      │
│ restaurant_id│     │ restaurant_id(FK)│     │ restaurant_id (FK)           │
│ name         │     │ menu_id (FK)     │     │ category_id (FK)             │
│ description  │     │ name             │     │ name                         │
│ is_active    │     │ description      │     │ description                  │
│ is_default   │     │ image_url        │     │ price                        │
│ available_   │     │ sort_order       │     │ compare_at_price             │
│   from/to    │     │ is_active        │     │ cost                         │
│ available_   │     └──────────────────┘     │ image_url                    │
│   days (JSON)│                              │ sku / barcode                │
│ sort_order   │                              │ is_available / is_popular    │
└──────────────┘                              │ preparation_time             │
                                              │ calories                     │
                                              │ allergens (ARRAY)            │
                                              │ tags (ARRAY)                 │
                                              │ sort_order                   │
                                              └──────────────────────────────┘
                                                           │
                                                           │
┌──────────────────────┐     ┌────────────────────────────┐│
│   modifier_groups    │────<│        modifiers           ││
│──────────────────────│     │────────────────────────────││
│ id (PK)              │     │ id (PK)                    ││
│ restaurant_id (FK)   │     │ modifier_group_id (FK)     ││
│ name                 │     │ name                       ││
│ description          │     │ price                      ││
│ is_required          │     │ is_default                 ││
│ min_selections       │     │ is_available               ││
│ max_selections       │     │ sort_order                 ││
│ sort_order           │     └────────────────────────────┘│
└──────────────────────┘                                   │
         │                                                 │
         │         ┌────────────────────────────────┐      │
         └────────>│ menu_item_modifier_groups      │<─────┘
                   │────────────────────────────────│
                   │ id (PK)                        │
                   │ menu_item_id (FK)              │
                   │ modifier_group_id (FK)         │
                   │ sort_order                     │
                   └────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                           TABLES & QR CODES                                   │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐             ┌──────────────────┐
│  dining_tables   │────────────<│    qr_tokens     │
│──────────────────│             │──────────────────│
│ id (PK)          │             │ id (PK)          │
│ restaurant_id(FK)│             │ restaurant_id(FK)│
│ number (UNIQ*)   │             │ table_id (FK)    │
│ name             │             │ token (UNIQ)     │
│ capacity         │             │ qr_code_url      │
│ section          │             │ token_type       │
│ status           │             │ is_active        │
│ is_active        │             │ scans_count      │
│ position_x/y     │             │ last_scanned_at  │
│ timestamps       │             │ expires_at       │
└──────────────────┘             └──────────────────┘
         │
         │
┌──────────────────────────────────────────────────────────────────────────────┐
│                           ORDERS & PAYMENTS                                   │
└──────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────┐     ┌──────────────────────┐
│        orders         │────<│     order_items      │
│───────────────────────│     │──────────────────────│
│ id (PK)               │     │ id (PK)              │
│ restaurant_id (FK)    │     │ order_id (FK)        │
│ table_id (FK)         │     │ menu_item_id (FK)    │
│ server_id (FK→users)  │     │ name (denormalized)  │
│ qr_token_id (FK)      │     │ quantity             │
│ order_number (UNIQ*)  │     │ unit_price           │
│ display_number        │     │ modifiers_price      │
│ status                │     │ total_price          │
│ order_type            │     │ modifiers (JSON)     │
│ source                │     │ notes                │
│ subtotal              │     │ status               │
│ tax_amount            │     │ sent_to_kitchen_at   │
│ tip_amount            │     │ prepared_at          │
│ discount_amount       │     │ served_at            │
│ total                 │     │ timestamps           │
│ paid_amount           │     └──────────────────────┘
│ notes                 │
│ customer_name/phone   │     ┌──────────────────────────┐
│ guest_count           │────<│ order_status_history     │
│ estimated_ready_at    │     │──────────────────────────│
│ completed_at          │     │ id (PK)                  │
│ cancelled_at/reason   │     │ order_id (FK)            │
│ timestamps            │     │ user_id (FK)             │
└───────────────────────┘     │ from_status              │
         │                    │ to_status                │
         │                    │ notes                    │
         │                    │ created_at               │
         │                    └──────────────────────────┘
         │
         │         ┌──────────────────┐     ┌──────────────────┐
         │────────<│  split_sessions  │────<│   split_shares   │
         │         │──────────────────│     │──────────────────│
         │         │ id (PK)          │     │ id (PK)          │
         │         │ order_id (FK)    │     │ split_session_id │
         │         │ split_type       │     │ share_number     │
         │         │ total_shares     │     │ amount           │
         │         │ status           │     │ tip_amount       │
         │         │ timestamps       │     │ item_ids (JSON)  │
         │         └──────────────────┘     │ is_paid          │
         │                                  │ payment_id (FK)  │
         │                                  │ paid_at          │
         │                                  └──────────────────┘
         │                                           │
         ▼                                           │
┌─────────────────────────┐                          │
│       payments          │<─────────────────────────┘
│─────────────────────────│
│ id (PK)                 │
│ order_id (FK)           │
│ restaurant_id (FK)      │
│ split_session_id (FK)   │
│ amount                  │
│ tip_amount              │
│ method                  │
│ status                  │
│ transaction_id          │
│ card_last_four/brand    │
│ receipt_url             │
│ refunded_amount         │
│ metadata (JSON)         │
│ processed_at            │
│ refunded_at             │
│ timestamps              │
└─────────────────────────┘
```

### Table Descriptions

| Table | Description |
|-------|-------------|
| `restaurants` | Core tenant entity - each restaurant is a separate tenant |
| `restaurant_domains` | Custom domains for white-labeling |
| `restaurant_feature_allowlist` | Hard permissions - what features a restaurant can access |
| `restaurant_settings` | Soft toggles - restaurant-controlled settings (JSON values) |
| `users` | Global users table - can belong to multiple restaurants |
| `roles` | Permission roles per restaurant (admin, manager, server, kitchen, cashier) |
| `restaurant_users` | Junction table linking users to restaurants with roles |
| `menus` | Named menus (Breakfast, Lunch, Dinner) with time availability |
| `categories` | Menu categories within a menu |
| `menu_items` | Products with prices, allergens, tags, and prep time |
| `modifier_groups` | Groups of modifiers (e.g., "Size", "Toppings") |
| `modifiers` | Individual modifier options with prices |
| `menu_item_modifier_groups` | Junction table linking items to modifier groups |
| `dining_tables` | Physical restaurant tables with floor plan positions |
| `qr_tokens` | QR code tokens for table ordering |
| `orders` | Customer orders with status, totals, and customer info |
| `order_items` | Line items in an order (denormalized for historical accuracy) |
| `order_status_history` | Audit trail for order status changes |
| `payments` | Payment records with method, status, and transaction details |
| `split_sessions` | Split payment sessions (equal, by item, by amount) |
| `split_shares` | Individual shares within a split session |

### Key Relationships

1. **Multi-Tenancy**: All business data is scoped to `restaurant_id`
2. **Users ↔ Restaurants**: Many-to-many via `restaurant_users` with role assignment
3. **Menu Hierarchy**: Menus → Categories → Menu Items (with optional category)
4. **Modifier System**: Menu Items ↔ Modifier Groups (many-to-many) → Modifiers
5. **Orders**: Connected to tables, servers, and QR tokens; contain order items
6. **Payments**: Split payments supported via split_sessions/split_shares

### Indexes

All foreign keys are indexed for query performance. Additional indexes:
- `restaurants.slug` - Unique, for URL routing
- `users.email` - Unique, for login
- `orders.status` - For filtering active orders
- `orders.created_at` - For date-range queries
- `dining_tables.status` - For availability checks

## API Endpoints

### Health & Status

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api` | GET | API information and available endpoints |
| `/api/health` | GET | Server health check (uptime, memory) |
| `/api/health/db` | GET | Database connection test |

### Authentication (Coming Soon)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Register new user |
| `/api/auth/login` | POST | User login |
| `/api/auth/logout` | POST | User logout |
| `/api/auth/me` | GET | Get current user |

### Tenants (Coming Soon)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tenants` | GET | List all tenants |
| `/api/tenants/:slug` | GET | Get tenant by slug |

### Menu (Coming Soon)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/:tenantSlug/menu` | GET | Get tenant menu |
| `/api/:tenantSlug/categories` | GET | Get menu categories |

### Orders (Coming Soon)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/:tenantSlug/orders` | GET | List orders |
| `/api/:tenantSlug/orders` | POST | Create new order |

## Socket.IO Events

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `join-tenant` | `tenantId: string` | Join tenant room for updates |
| `join-kitchen` | `tenantId: string` | Join kitchen room for order updates |

### Server → Client (Coming Soon)

| Event | Description |
|-------|-------------|
| `new-order` | New order placed |
| `order-updated` | Order status changed |
| `table-status-changed` | Table status updated |

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run db:push` | Push schema changes to database |
| `npm run db:studio` | Open Drizzle Studio (database GUI) |
| `npx tsx scripts/seed.ts` | Seed database with sample data |

## Deployment

### Environment Requirements

- Node.js 20+ runtime
- PostgreSQL 14+ database
- Persistent storage for uploads (optional)
- Reverse proxy (nginx/Caddy) recommended

### Production Deployment Steps

1. Set `NODE_ENV=production` in environment
2. Configure production database URL
3. Generate strong secrets for JWT and session
4. Run `npm run build`
5. Run `npm run start`

### Docker (Coming Soon)

Docker support will be added in a future update.

## Security Considerations

- Always use HTTPS in production
- Generate strong, unique secrets for JWT and session
- Keep dependencies updated
- Use environment variables for all secrets
- Implement rate limiting in production
- Enable CORS only for trusted origins

## License

MIT License - See LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Support

For issues and feature requests, please use the GitHub issue tracker.
