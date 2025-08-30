# 🚀 Complete Setup Guide

This guide will help you set up the Restaurant Template from scratch. Follow these steps carefully.

## 📋 Prerequisites

### Required Software
1. **Node.js 18+** - [Download here](https://nodejs.org/)
2. **Git** - [Download here](https://git-scm.com/)

### Optional (Recommended)
3. **Docker Desktop** - [Download here](https://www.docker.com/products/docker-desktop/)
   - Makes database setup much easier
   - If you don't have Docker, you'll need to install MongoDB and Redis manually

### Manual Database Setup (if not using Docker)
4. **MongoDB** - [Installation Guide](https://docs.mongodb.com/manual/installation/)
5. **Redis** - [Installation Guide](https://redis.io/docs/getting-started/installation/)

## 🛠️ Installation Steps

### Step 1: Clone the Repository
```bash
git clone <your-repository-url>
cd restaurant-template
```

### Step 2: Run Setup Script
```bash
node scripts/setup.js
```

This script will:
- ✅ Check Node.js version
- ✅ Create .env file from .env.example
- ✅ Install all dependencies
- ✅ Start Docker services (if available)

### Step 3: Configure Environment Variables

Edit the `.env` file with your settings:

```bash
# Required - Database connections
MONGODB_URI=mongodb://admin:password@localhost:27017/restaurant_db?authSource=admin
REDIS_URL=redis://:redispassword@localhost:6379

# Required - JWT secrets (generate secure random strings)
JWT_SECRET=your-super-secure-jwt-secret-at-least-32-characters-long
JWT_REFRESH_SECRET=your-super-secure-refresh-secret-at-least-32-characters-long

# Required - App configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**🔐 Generate Secure Secrets:**
```bash
# Generate JWT secrets (run these commands)
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
```

### Step 4: Start the Application

#### Option A: With Docker (Recommended)
```bash
# Start all services
docker-compose up -d

# Start development server
npm run dev
```

#### Option B: Without Docker
```bash
# Make sure MongoDB and Redis are running on your system
# Then start the development server
npm run dev
```

### Step 5: Seed the Database
```bash
# This creates sample data and admin user
npm run db:seed
```

### Step 6: Access the Application

- **Customer Site**: http://localhost:3000
- **Admin Panel**: http://localhost:3000/admin

**Default Admin Credentials:**
- Email: `admin@restaurant.com`
- Password: `admin123`

## 🔧 Manual Setup Instructions

### If You Don't Have Docker

#### Install MongoDB
1. **Windows**: Download from [MongoDB website](https://www.mongodb.com/try/download/community)
2. **macOS**: `brew install mongodb-community`
3. **Linux**: Follow [official guide](https://docs.mongodb.com/manual/administration/install-on-linux/)

Start MongoDB:
```bash
# Windows (as service)
net start MongoDB

# macOS/Linux
mongod --dbpath /path/to/data/directory
```

#### Install Redis
1. **Windows**: Use [Redis for Windows](https://github.com/microsoftarchive/redis/releases)
2. **macOS**: `brew install redis`
3. **Linux**: `sudo apt-get install redis-server`

Start Redis:
```bash
# Windows
redis-server

# macOS/Linux
redis-server
```

#### Update Environment Variables
```bash
# For local installations (no authentication)
MONGODB_URI=mongodb://localhost:27017/restaurant_db
REDIS_URL=redis://localhost:6379
```

## 🐳 Docker Commands Reference

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Reset all data
docker-compose down -v

# Start only database services
docker-compose up -d mongo redis

# Access MongoDB shell
docker-compose exec mongo mongosh -u admin -p password

# Access Redis CLI
docker-compose exec redis redis-cli
```

## 🧪 Testing the Setup

### 1. Health Check
Visit: http://localhost:3000/api/health

Should return:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:00:00.000Z"
}
```

### 2. Database Connection
```bash
# Test database models
npm run db:test
```

### 3. Run Tests
```bash
# Run all tests
npm test

# Run specific test
npm test -- auth.test.ts
```

## 🔧 Troubleshooting

### Common Issues

#### 1. Port Already in Use
```bash
# Check what's using port 3000
netstat -ano | findstr :3000  # Windows
lsof -i :3000                 # macOS/Linux

# Kill the process or use different port
PORT=3001 npm run dev
```

#### 2. MongoDB Connection Failed
```bash
# Check if MongoDB is running
docker-compose ps mongo

# View MongoDB logs
docker-compose logs mongo

# Restart MongoDB
docker-compose restart mongo
```

#### 3. Redis Connection Failed
```bash
# Check if Redis is running
docker-compose ps redis

# Test Redis connection
docker-compose exec redis redis-cli ping
```

#### 4. Permission Errors (Linux/macOS)
```bash
# Fix npm permissions
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) node_modules
```

#### 5. Docker Issues
```bash
# Reset Docker
docker system prune -a

# Rebuild containers
docker-compose build --no-cache
docker-compose up -d
```

### Environment Variable Issues

#### Missing Variables
If you see "Environment validation failed", check:
1. `.env` file exists in project root
2. All required variables are set
3. No extra spaces around `=` signs
4. Values are properly quoted if they contain special characters

#### Database URL Format
```bash
# Correct formats:
MONGODB_URI=mongodb://username:password@host:port/database?options
REDIS_URL=redis://password@host:port
REDIS_URL=redis://host:port  # if no password
```

## 📱 Optional Services Setup

### Payment Gateways

#### Razorpay (India)
1. Sign up at [Razorpay](https://razorpay.com/)
2. Get API keys from dashboard
3. Add to `.env`:
```bash
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
```

#### Stripe (International)
1. Sign up at [Stripe](https://stripe.com/)
2. Get API keys from dashboard
3. Add to `.env`:
```bash
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_key
STRIPE_SECRET_KEY=sk_test_your_stripe_secret
```

### File Storage (Cloudinary)
1. Sign up at [Cloudinary](https://cloudinary.com/)
2. Get credentials from dashboard
3. Add to `.env`:
```bash
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### SMS/WhatsApp (Twilio)
1. Sign up at [Twilio](https://twilio.com/)
2. Get credentials and phone number
3. Add to `.env`:
```bash
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=your_twilio_number
```

## 🚀 Production Deployment

### Environment Setup
1. Copy `.env.example` to `.env.production`
2. Update all values for production
3. Use strong, unique secrets
4. Use production database URLs

### Security Checklist
- [ ] Change default admin password
- [ ] Use strong JWT secrets
- [ ] Enable HTTPS
- [ ] Set up proper CORS
- [ ] Configure rate limiting
- [ ] Set up monitoring

### Deployment Platforms

#### Vercel (Recommended)
```bash
npm install -g vercel
vercel login
vercel
```

#### Docker Production
```bash
docker build -t restaurant-template .
docker run -p 3000:3000 restaurant-template
```

## 📞 Getting Help

### Check These First
1. **Logs**: Check console output for errors
2. **Network**: Ensure ports 3000, 27017, 6379 are available
3. **Environment**: Verify all required variables are set
4. **Services**: Confirm MongoDB and Redis are running

### Common Commands
```bash
# View all running processes
docker-compose ps

# Check application logs
npm run dev 2>&1 | tee app.log

# Test database connection
npm run db:test

# Reset everything
docker-compose down -v && docker-compose up -d
```

### Support Resources
- **Documentation**: Check `/docs` folder
- **API Reference**: `/docs/api-documentation.md`
- **GitHub Issues**: Create an issue with error details
- **Discord**: Join our community (if available)

---

**🎉 Congratulations!** You should now have a fully functional restaurant website template running locally.