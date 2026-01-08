# Developer Setup Guide

A comprehensive guide for setting up the Restaurant POS + QR Ordering SaaS system across all development and deployment contexts.

## 1. Overview

This is a **multi-tenant Restaurant POS + QR Ordering system** built with:

- **Frontend**: React 18 + Vite + TypeScript + TanStack Query
- **Backend**: Express.js + Node.js + JWT Authentication
- **Database**: PostgreSQL + Drizzle ORM
- **Real-time**: Socket.IO for live order updates
- **Styling**: Tailwind CSS + shadcn/ui components

**One codebase, two environments**: Development runs Vite's dev server proxied through Express; production serves the built frontend directly from Express.

---

## 2. Replit-Specific Setup

### Using Replit Secrets (Required)

> ⚠️ **Important**: Replit ignores `.env` files at runtime. You **must** use Replit Secrets.

1. Open your Repl → Click **Tools** → **Secrets**
2. Add the following secrets:

| Key | Example Value | Required |
|-----|--------------|----------|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/dbname` | ✅ |
| `JWT_SECRET` | `a1b2c3d4e5f6...` (64 hex characters) | ✅ |
| `SESSION_SECRET` | `your-random-session-secret` | ✅ |
| `NODE_ENV` | `development` | ❌ |

### Generating Secrets

In the Replit Shell, run:

```bash
# Generate JWT_SECRET (64 hex characters)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(24).toString('base64'))"
```

### Database Setup

Replit provides a built-in PostgreSQL database. If you need to use an external database (Neon, Supabase, Render):

```
postgresql://username:password@host:5432/database_name?sslmode=require
```

> **Note**: External databases may require allowing Replit's outbound IPs or using connection pooling.

### Running Commands

```bash
# Push schema to database
npm run db:push

# Seed sample data (restaurant + admin user)
npx tsx scripts/seed.ts

# Start development server
npm run dev
```

The preview will auto-open. Replit assigns `PORT` automatically (usually 8080).

> ⚠️ **Security**: Never commit secrets. Replit Secrets are private and encrypted.

---

## 3. Local Development Setup

### Prerequisites

| Tool | Minimum Version | Check Command |
|------|-----------------|---------------|
| Node.js | v20+ | `node -v` |
| PostgreSQL | 14+ | `psql --version` |
| npm | 8+ | `npm -v` |

### Step-by-Step Setup

#### 1. Clone and Install

```bash
git clone <repository-url>
cd restaurant-pos
npm install
```

#### 2. Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit with your values
nano .env  # or use your preferred editor
```

#### 3. Create Database

**macOS / Linux:**

```bash
# Using PostgreSQL CLI
createdb restaurant_pos

# Or via psql
psql -U postgres -c "CREATE DATABASE restaurant_pos;"
```

**Windows (PowerShell or Git Bash):**

```powershell
# Via psql
psql -U postgres -c "CREATE DATABASE restaurant_pos;"

# Or use pgAdmin GUI to create the database
```

#### 4. Initialize Database

```bash
# Push Drizzle schema to database
npm run db:push

# Seed sample data (recommended for development)
npx tsx scripts/seed.ts
```

#### 5. Start Development Server

```bash
npm run dev
```

Open [http://localhost:5000](http://localhost:5000) in your browser.

### Windows-Specific Notes

- Use **PowerShell** or **Git Bash** (not CMD) for Unix commands like `cp`
- If `createdb` fails, connect via `psql` and run `CREATE DATABASE restaurant_pos;`
- Ensure PostgreSQL service is running: `net start postgresql-x64-14` (version may vary)
- For `openssl`, install via [Git for Windows](https://gitforwindows.org/) which includes it

---

## 4. Database Configuration

### Connection String Format

```
postgresql://username:password@host:port/database_name
```

**Examples:**

```bash
# Local PostgreSQL
DATABASE_URL=postgresql://postgres:password@localhost:5432/restaurant_pos

# Neon (with pooling)
DATABASE_URL=postgresql://user:pass@ep-cool-name-123456.us-east-2.aws.neon.tech/neondb?sslmode=require

# Supabase
DATABASE_URL=postgresql://postgres:password@db.xxxx.supabase.co:5432/postgres
```

### Recommended Cloud Databases

| Provider | Free Tier | Connection Pooling | Notes |
|----------|-----------|-------------------|-------|
| [Neon.tech](https://neon.tech) | 0.5 GB | ✅ Built-in | Serverless, auto-scaling |
| [Supabase](https://supabase.com) | 500 MB | ✅ PgBouncer | Full Postgres features |
| [Render](https://render.com) | 256 MB | ❌ | Simple setup |

### Drizzle ORM Commands

```bash
# Push schema changes to database (declarative)
npm run db:push

# Open Drizzle Studio (web-based DB explorer)
npm run db:studio

# Run migrations (production)
npx tsx scripts/migrate.ts
```

> ⚠️ **Never use the same database for dev/staging/production**

---

## 5. Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | — | 64 hex chars for signing auth tokens |
| `SESSION_SECRET` | ✅ | — | Random string for Express sessions |
| `PORT` | ❌ | `5000` | Server port (ignored on Replit) |
| `NODE_ENV` | ❌ | `development` | `development` or `production` |
| `STRIPE_SECRET_KEY` | ❌ | — | Stripe API key (optional) |
| `PAYPAL_CLIENT_ID` | ❌ | — | PayPal client ID (optional) |
| `PAYPAL_CLIENT_SECRET` | ❌ | — | PayPal client secret (optional) |

### Generating Secure Secrets

```bash
# JWT_SECRET (64 hex characters)
openssl rand -hex 32

# SESSION_SECRET (base64)
openssl rand -base64 24

# Or using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 6. Running the Application

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start full-stack dev server (Express + Vite HMR) |
| `npm run build` | Build React frontend for production |
| `npm start` | Start production server (after build) |
| `npm run db:push` | Sync Drizzle schema to database |
| `npm run db:studio` | Open Drizzle Studio (web-based DB explorer) |
| `npx tsx scripts/seed.ts` | Add sample restaurant + admin user |
| `npx tsx scripts/migrate.ts` | Run database migrations (production) |

### Development Workflow

1. Start the dev server: `npm run dev`
2. Make changes to frontend (`client/`) or backend (`server/`)
3. Vite provides HMR for frontend; backend auto-restarts via tsx

### Test Credentials (after seeding)

| Role | Email | Password |
|------|-------|----------|
| Super Admin | `admin@posqr.com` | `admin123` |
| Restaurant Admin | `restadmin@flyingfork.com` | `staff123` |
| Manager | `manager@pizzapalace.com` | `staff123` |

---

## 7. Architecture Notes

### Project Structure

```
├── client/                 # React frontend (Vite)
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Route pages
│   │   ├── lib/            # Utilities (auth, API, theme)
│   │   └── hooks/          # Custom React hooks
├── server/                 # Express backend
│   ├── routes.ts           # API route definitions
│   ├── storage.ts          # Database operations
│   ├── socket.ts           # Socket.IO handlers
│   └── index.ts            # Server entry point
├── shared/                 # Shared code
│   └── schema.ts           # Drizzle ORM schema + Zod types
└── scripts/                # Utility scripts
    ├── seed.ts             # Database seeding
    └── migrate.ts          # Production migrations
```

### API Conventions

- All API routes are prefixed with `/api`
- Authentication via JWT Bearer tokens
- Multi-tenancy: Every query filters by `restaurant_id`
- Real-time updates via Socket.IO namespaced rooms

### Frontend ↔ Backend Communication

- **Development**: Vite runs on `:5173`, Express proxies requests
- **Production**: Express serves the built frontend from `dist/public`
- Shared types in `shared/schema.ts` ensure type safety

---

## 8. Troubleshooting

### Common Issues

| Error | Cause | Solution |
|-------|-------|----------|
| `ECONNREFUSED` | Database not running | Start PostgreSQL service; check `DATABASE_URL` |
| Blank screen on Replit | Frontend error | Check browser console for errors |
| `Drizzle push fails` | Missing DB privileges | Ensure user has `CREATE` privileges |
| `Port already in use` | Another process on port | Change `PORT` in `.env` or kill the process |
| `Seeding fails` | Schema not pushed | Run `npm run db:push` first |
| `JWT malformed` | Invalid token | Clear localStorage; re-login |
| `CORS errors` | Wrong API URL | Check that frontend calls `/api/...` not absolute URLs |

### Debugging Tips

```bash
# Check if PostgreSQL is running
pg_isready -h localhost -p 5432

# View database tables
psql -d restaurant_pos -c "\dt"

# Check Node.js version
node -v  # Should be v20+

# Clear npm cache if dependencies fail
npm cache clean --force && rm -rf node_modules && npm install
```

### Replit-Specific Issues

- **Slow cold starts**: Normal for free tier; Repl needs to wake up
- **Database connection drops**: Use connection pooling (Neon/Supabase)
- **Secrets not loading**: Ensure you're using Secrets tab, not `.env`

---

## 9. Going to Production

### Pre-Deployment Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Generate new, strong secrets (never reuse dev secrets)
- [ ] Use production database with backups enabled
- [ ] Enable HTTPS (required for secure cookies)
- [ ] Configure reverse proxy (nginx recommended)
- [ ] Set up monitoring and logging

### Build and Deploy

```bash
# Build frontend
npm run build

# Run database migrations
npx tsx scripts/migrate.ts

# Start production server
npm start
```

### Recommended Production Stack

| Component | Recommendation |
|-----------|---------------|
| Hosting | Ubuntu 22.04 LTS on VPS |
| Process Manager | PM2 with cluster mode |
| Reverse Proxy | Nginx with SSL |
| Database | Managed PostgreSQL (Neon, Supabase, RDS) |
| SSL | Let's Encrypt (Certbot) |

### PM2 Configuration

Use the included `ecosystem.config.cjs`:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

### Nginx Configuration

Use the included `nginx.conf.example` as a starting point. Key requirements:
- WebSocket upgrade headers for Socket.IO
- Proxy headers for Express

See `DEPLOY.md` for the complete Ubuntu deployment guide.

---

## Quick Start Summary

```bash
# 1. Clone and install
git clone <repo> && cd restaurant-pos && npm install

# 2. Configure environment
cp .env.example .env && nano .env

# 3. Setup database
createdb restaurant_pos
npm run db:push
npx tsx scripts/seed.ts

# 4. Run development server
npm run dev

# 5. Open http://localhost:5000
# Login: admin@posqr.com / admin123
```

---

*For production deployment instructions, see [DEPLOY.md](./DEPLOY.md).*
