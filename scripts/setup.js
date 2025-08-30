#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Restaurant Template Setup Script');
console.log('=====================================\n');

// Check Node.js version
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

if (majorVersion < 18) {
  console.error('❌ Node.js 18+ is required. Current version:', nodeVersion);
  process.exit(1);
}

console.log('✅ Node.js version:', nodeVersion);

// Check if .env file exists
const envPath = path.join(__dirname, '..', '.env');
const envExamplePath = path.join(__dirname, '..', '.env.example');

if (!fs.existsSync(envPath)) {
  if (fs.existsSync(envExamplePath)) {
    console.log('📝 Creating .env file from .env.example...');
    fs.copyFileSync(envExamplePath, envPath);
    console.log('✅ .env file created');
    console.log('⚠️  Please edit .env file with your configuration');
  } else {
    console.error('❌ .env.example file not found');
    process.exit(1);
  }
} else {
  console.log('✅ .env file exists');
}

// Check Docker availability
let dockerAvailable = false;
try {
  execSync('docker --version', { stdio: 'ignore' });
  execSync('docker-compose --version', { stdio: 'ignore' });
  dockerAvailable = true;
  console.log('✅ Docker and Docker Compose are available');
} catch (error) {
  console.log('⚠️  Docker not available - you\'ll need to set up MongoDB and Redis manually');
}

// Install dependencies
console.log('\n📦 Installing dependencies...');
try {
  execSync('npm install', { stdio: 'inherit' });
  console.log('✅ Dependencies installed');
} catch (error) {
  console.error('❌ Failed to install dependencies');
  process.exit(1);
}

// Start services if Docker is available
if (dockerAvailable) {
  console.log('\n🐳 Starting Docker services...');
  try {
    execSync('docker-compose up -d mongo redis', { stdio: 'inherit' });
    console.log('✅ MongoDB and Redis started');
    
    // Wait for services to be ready
    console.log('⏳ Waiting for services to be ready...');
    setTimeout(() => {
      console.log('✅ Services should be ready');
    }, 5000);
  } catch (error) {
    console.error('❌ Failed to start Docker services');
    console.log('You can try starting them manually with: docker-compose up -d');
  }
}

console.log('\n🎉 Setup completed!');
console.log('\nNext steps:');
console.log('1. Edit .env file with your configuration');
console.log('2. Run: npm run dev');
console.log('3. Visit: http://localhost:3000');
console.log('\nAdmin panel: http://localhost:3000/admin');
console.log('Default admin: admin@restaurant.com / admin123');