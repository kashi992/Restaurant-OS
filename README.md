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

### 5. Start the Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:5000`.

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

## Database Schema

### Core Tables

- **tenants** - Restaurant/business entities
- **users** - Staff and admin users (scoped to tenant)
- **categories** - Menu categories
- **menu_items** - Menu items with prices
- **tables** - Restaurant tables with QR codes
- **orders** - Customer orders
- **order_items** - Individual items in an order
- **payments** - Payment records

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
