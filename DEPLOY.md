# Deployment Guide for Ubuntu Server

This guide walks you through deploying the Restaurant POS + QR Ordering application on an Ubuntu 22.04+ server.

## Prerequisites

- Ubuntu 22.04 LTS or later
- Root or sudo access
- Domain name (optional but recommended)
- PostgreSQL 14+ database

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/your-org/restaurant-pos.git
cd restaurant-pos

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
nano .env  # Edit with your values

# 4. Push database schema
npm run db:push

# 5. Seed initial data (optional)
npx tsx scripts/seed.ts

# 6. Build for production
npm run build

# 7. Start the server
npm start
```

## Detailed Installation

### Step 1: System Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should be v20.x.x
npm --version   # Should be 10.x.x

# Install PM2 globally
sudo npm install -g pm2
```

### Step 2: PostgreSQL Setup

```bash
# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Start and enable PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user
sudo -u postgres psql << EOF
CREATE USER pos_user WITH PASSWORD 'your_secure_password';
CREATE DATABASE restaurant_pos OWNER pos_user;
GRANT ALL PRIVILEGES ON DATABASE restaurant_pos TO pos_user;
EOF
```

### Step 3: Application Setup

```bash
# Clone repository
git clone https://github.com/your-org/restaurant-pos.git /var/www/restaurant-pos
cd /var/www/restaurant-pos

# Install dependencies
npm ci --production=false

# Configure environment
cp .env.example .env
```

Edit `.env` with your configuration:

```bash
DATABASE_URL=postgresql://pos_user:your_secure_password@localhost:5432/restaurant_pos
JWT_SECRET=$(openssl rand -hex 64)
SESSION_SECRET=$(openssl rand -hex 32)
NODE_ENV=production
PORT=5000
```

### Step 4: Database Migration

```bash
# Push schema to database
npm run db:push

# Seed with sample data (optional, for testing)
npx tsx scripts/seed.ts
```

### Step 5: Build Application

```bash
# Build for production
npm run build

# Verify build
ls -la dist/
# Should see: index.cjs, public/
```

### Step 6: Start with PM2

```bash
# Create logs directory
mkdir -p logs

# Start application
pm2 start ecosystem.config.cjs --env production

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup systemd
# Run the command it outputs

# Check status
pm2 status
pm2 logs restaurant-pos
```

### Step 7: Nginx Setup

```bash
# Install Nginx
sudo apt install -y nginx

# Copy configuration
sudo cp nginx.conf.example /etc/nginx/sites-available/restaurant-pos

# Edit configuration
sudo nano /etc/nginx/sites-available/restaurant-pos
# Replace 'yourdomain.com' with your actual domain

# Enable site
sudo ln -s /etc/nginx/sites-available/restaurant-pos /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

### Step 8: SSL Certificate (Let's Encrypt)

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Verify auto-renewal
sudo certbot renew --dry-run
```

## Firewall Configuration

```bash
# Enable UFW
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw enable

# Verify
sudo ufw status
```

## Production Checklist

- [ ] Strong `JWT_SECRET` (64+ hex characters)
- [ ] Strong `SESSION_SECRET` (32+ hex characters)
- [ ] `NODE_ENV=production` is set
- [ ] Database uses strong password
- [ ] SSL/TLS certificate installed
- [ ] Firewall configured
- [ ] PM2 auto-restart on boot
- [ ] Log rotation configured

## Monitoring

### PM2 Commands

```bash
# View application status
pm2 status

# View logs
pm2 logs restaurant-pos

# Monitor resources
pm2 monit

# Restart application
pm2 restart restaurant-pos

# Reload without downtime
pm2 reload restaurant-pos
```

### Health Check

The application exposes no dedicated health endpoint, but you can verify:

```bash
curl http://localhost:5000/api/health || curl http://localhost:5000
```

## Updating the Application

```bash
cd /var/www/restaurant-pos

# Pull latest code
git pull origin main

# Install dependencies
npm ci --production=false

# Run migrations (if any)
npm run db:push

# Build
npm run build

# Reload without downtime
pm2 reload restaurant-pos
```

## Troubleshooting

### Application won't start

```bash
# Check logs
pm2 logs restaurant-pos --lines 100

# Verify environment
cat .env | grep -E "^(DATABASE_URL|JWT_SECRET|NODE_ENV)"

# Test database connection
psql $DATABASE_URL -c "SELECT 1"
```

### WebSocket not connecting

1. Verify Nginx config has WebSocket headers:
   ```nginx
   proxy_set_header Upgrade $http_upgrade;
   proxy_set_header Connection "upgrade";
   ```

2. Restart Nginx after changes:
   ```bash
   sudo nginx -t && sudo systemctl restart nginx
   ```

### Database connection issues

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Test connection
psql postgresql://pos_user:password@localhost:5432/restaurant_pos -c "SELECT 1"

# Check pg_hba.conf for local connections
sudo cat /etc/postgresql/*/main/pg_hba.conf
```

### High memory usage

```bash
# Adjust PM2 cluster instances
pm2 scale restaurant-pos 2  # Reduce to 2 instances

# Or modify ecosystem.config.cjs
# Change: instances: "max" to instances: 2
```

## Backup & Recovery

### Database Backup

```bash
# Create backup
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Automated daily backup (add to crontab)
0 2 * * * pg_dump $DATABASE_URL > /backups/pos_$(date +\%Y\%m\%d).sql
```

### Restore Database

```bash
# Restore from backup
psql $DATABASE_URL < backup_20240101_120000.sql
```

## Multi-Domain Setup (Multi-Tenant)

For restaurants with custom domains:

1. Add domain to DNS pointing to your server
2. Duplicate the server block in Nginx config
3. Obtain SSL certificate for the new domain
4. Add domain to `restaurant_domains` table

```bash
# Obtain certificate for additional domain
sudo certbot --nginx -d restaurant1.com -d www.restaurant1.com
```

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret for JWT signing (64+ hex chars) |
| `SESSION_SECRET` | Yes | Express session secret (32+ hex chars) |
| `PORT` | No | Server port (default: 5000) |
| `NODE_ENV` | No | Environment (production/development) |
| `STRIPE_SECRET_KEY` | No | Stripe API key for payments |
| `PAYPAL_CLIENT_ID` | No | PayPal client ID |
| `PAYPAL_CLIENT_SECRET` | No | PayPal client secret |

## Support

For issues or questions, please open an issue on the GitHub repository.
