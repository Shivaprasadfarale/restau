# Deployment Guide

## Overview

This guide covers deploying the Restaurant Template to various platforms including Vercel, Netlify, and VPS.

## Prerequisites

- Node.js 18+ installed
- MongoDB database (Atlas or self-hosted)
- Redis instance (Redis Cloud or self-hosted)
- Environment variables configured

## Environment Variables

Create a `.env.local` file with the following variables:

```bash
# Database
MONGODB_URI=mongodb://localhost:27017/restaurant-template
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your-super-secret-jwt-key-here
JWT_REFRESH_SECRET=your-refresh-secret-here
ADMIN_JWT_SECRET=your-admin-jwt-secret-here

# Payment Gateways
RAZORPAY_KEY_ID=your-razorpay-key-id
RAZORPAY_KEY_SECRET=your-razorpay-secret
STRIPE_PUBLISHABLE_KEY=your-stripe-publishable-key
STRIPE_SECRET_KEY=your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=your-stripe-webhook-secret

# Notifications
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=your-twilio-phone-number
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# File Upload
CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=Restaurant Template
```

## Vercel Deployment

### 1. Install Vercel CLI

```bash
npm i -g vercel
```

### 2. Login to Vercel

```bash
vercel login
```

### 3. Deploy

```bash
# From project root
vercel

# Follow the prompts:
# - Set up and deploy? Y
# - Which scope? (select your account)
# - Link to existing project? N
# - Project name: restaurant-template
# - Directory: ./
# - Override settings? N
```

### 4. Configure Environment Variables

```bash
# Add environment variables
vercel env add MONGODB_URI
vercel env add REDIS_URL
vercel env add JWT_SECRET
# ... add all other environment variables
```

### 5. Redeploy with Environment Variables

```bash
vercel --prod
```

### 6. Configure Custom Domain (Optional)

```bash
vercel domains add yourdomain.com
```

## Netlify Deployment

### 1. Build Configuration

Create `netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = ".next"

[build.environment]
  NODE_VERSION = "18"

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### 2. Deploy via Git

1. Push code to GitHub/GitLab
2. Connect repository in Netlify dashboard
3. Configure build settings:
   - Build command: `npm run build`
   - Publish directory: `.next`
4. Add environment variables in Netlify dashboard

### 3. Configure Functions

For API routes, you may need to adapt them for Netlify Functions or use Netlify Edge Functions.

## VPS Deployment (Ubuntu)

### 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
sudo npm install -g pm2

# Install Nginx
sudo apt install nginx -y

# Install MongoDB (optional, if self-hosting)
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org

# Install Redis (optional, if self-hosting)
sudo apt install redis-server -y
```

### 2. Deploy Application

```bash
# Clone repository
git clone https://github.com/yourusername/restaurant-template.git
cd restaurant-template

# Install dependencies
npm install

# Build application
npm run build

# Create environment file
cp .env.example .env
# Edit .env with your production values

# Start with PM2
pm2 start npm --name "restaurant-template" -- start
pm2 save
pm2 startup
```

### 3. Configure Nginx

Create `/etc/nginx/sites-available/restaurant-template`:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/restaurant-template /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 4. SSL Certificate (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

## Docker Deployment

### 1. Create Dockerfile

```dockerfile
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
```

### 2. Docker Compose

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://mongo:27017/restaurant-template
      - REDIS_URL=redis://redis:6379
    depends_on:
      - mongo
      - redis
    restart: unless-stopped

  mongo:
    image: mongo:6
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - app
    restart: unless-stopped

volumes:
  mongo_data:
  redis_data:
```

### 3. Deploy with Docker

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Update deployment
docker-compose pull
docker-compose up -d --build
```

## Database Setup

### MongoDB Atlas

1. Create account at [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Create new cluster
3. Configure network access (add your IP or 0.0.0.0/0 for all)
4. Create database user
5. Get connection string and add to environment variables

### Redis Cloud

1. Create account at [Redis Cloud](https://redis.com/redis-enterprise-cloud/)
2. Create new database
3. Get connection details and add to environment variables

## Post-Deployment Steps

### 1. Database Seeding

```bash
# Run database seeding script
npm run seed

# Or manually via API
curl -X POST https://yourdomain.com/api/admin/seed \
  -H "Content-Type: application/json" \
  -d '{"adminPassword": "your-admin-password"}'
```

### 2. Create Admin User

```bash
# Via seeding script or manually in database
# Default admin credentials:
# Email: admin@restaurant.com
# Password: admin123 (change immediately)
```

### 3. Configure Restaurant Settings

1. Login to admin panel at `/admin`
2. Go to Settings
3. Configure:
   - Restaurant information
   - Operating hours
   - Delivery settings
   - Payment methods
   - Tax rates

### 4. Upload Menu Items

1. Go to Menu Management
2. Create categories
3. Add menu items with images
4. Set pricing and availability

## Monitoring and Maintenance

### Health Checks

The application includes health check endpoints:

- `/api/health` - Basic health check
- `/api/health/detailed` - Detailed system status

### Logging

Configure logging for production:

```javascript
// In production, use structured logging
if (process.env.NODE_ENV === 'production') {
  console.log = (message, ...args) => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'info',
      message,
      ...args
    };
    process.stdout.write(JSON.stringify(logEntry) + '\n');
  };
}
```

### Backup Strategy

1. **Database Backups**:
   ```bash
   # MongoDB backup
   mongodump --uri="your-mongodb-uri" --out=/backup/$(date +%Y%m%d)
   
   # Redis backup
   redis-cli --rdb /backup/redis-$(date +%Y%m%d).rdb
   ```

2. **Automated Backups**:
   - Set up cron jobs for regular backups
   - Use cloud storage for backup retention
   - Test restore procedures regularly

### Performance Monitoring

1. **Application Performance**:
   - Monitor response times
   - Track error rates
   - Monitor memory usage

2. **Database Performance**:
   - Monitor query performance
   - Check index usage
   - Monitor connection pools

3. **Infrastructure**:
   - Monitor server resources
   - Check disk space
   - Monitor network performance

## Troubleshooting

### Common Issues

1. **Build Failures**:
   - Check Node.js version compatibility
   - Verify all dependencies are installed
   - Check for TypeScript errors

2. **Database Connection Issues**:
   - Verify connection strings
   - Check network access rules
   - Validate credentials

3. **Performance Issues**:
   - Enable Redis caching
   - Optimize database queries
   - Use CDN for static assets

4. **Payment Issues**:
   - Verify webhook endpoints
   - Check API credentials
   - Test in sandbox mode first

### Support

For deployment issues:

1. Check application logs
2. Verify environment variables
3. Test database connectivity
4. Check external service status
5. Review security settings

## Security Considerations

1. **Environment Variables**:
   - Never commit secrets to version control
   - Use secure secret management
   - Rotate secrets regularly

2. **Database Security**:
   - Use strong passwords
   - Enable authentication
   - Restrict network access
   - Regular security updates

3. **Application Security**:
   - Keep dependencies updated
   - Use HTTPS in production
   - Implement rate limiting
   - Regular security audits

4. **Server Security**:
   - Keep OS updated
   - Configure firewall
   - Use fail2ban for SSH protection
   - Regular security patches