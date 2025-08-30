#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔍 Checking project setup...\n');

const checks = [
  {
    name: 'Package.json exists',
    check: () => fs.existsSync('package.json'),
  },
  {
    name: 'TypeScript config exists',
    check: () => fs.existsSync('tsconfig.json'),
  },
  {
    name: 'Environment example exists',
    check: () => fs.existsSync('.env.example'),
  },
  {
    name: 'Environment local exists',
    check: () => fs.existsSync('.env.local'),
  },
  {
    name: 'Docker compose exists',
    check: () => fs.existsSync('docker-compose.yml'),
  },
  {
    name: 'Source directory exists',
    check: () => fs.existsSync('src'),
  },
  {
    name: 'Components directory exists',
    check: () => fs.existsSync('src/components'),
  },
  {
    name: 'Lib directory exists',
    check: () => fs.existsSync('src/lib'),
  },
  {
    name: 'Types directory exists',
    check: () => fs.existsSync('src/types'),
  },
  {
    name: 'Husky hooks exist',
    check: () => fs.existsSync('.husky'),
  },
];

let passed = 0;
let failed = 0;

checks.forEach(({ name, check }) => {
  const result = check();
  if (result) {
    console.log(`✅ ${name}`);
    passed++;
  } else {
    console.log(`❌ ${name}`);
    failed++;
  }
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log('\n🎉 Project setup is complete! You can now start development.');
  console.log('\nNext steps:');
  console.log('1. Start MongoDB and Redis (docker compose up -d)');
  console.log('2. Run npm run dev to start the development server');
  console.log('3. Visit http://localhost:3000 to see your app');
} else {
  console.log('\n⚠️  Some setup steps are missing. Please review the README.md file.');
  process.exit(1);
}