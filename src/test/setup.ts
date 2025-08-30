import { vi } from 'vitest'

// Mock environment variables
vi.mock('@/lib/env', () => ({
  env: {
    MONGODB_URI: 'mongodb://localhost:27017/test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'test-jwt-secret-32-characters-long',
    JWT_REFRESH_SECRET: 'test-refresh-secret-32-characters',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    NODE_ENV: 'test'
  }
}))

// Mock MongoDB connection
vi.mock('@/lib/mongodb', () => ({
  connectToDatabase: vi.fn().mockResolvedValue({}),
  disconnectFromDatabase: vi.fn().mockResolvedValue(undefined)
}))

// Mock Redis connection
vi.mock('@/lib/redis', () => ({
  connectRedis: vi.fn().mockResolvedValue({
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    keys: vi.fn().mockResolvedValue([]),
    ping: vi.fn().mockResolvedValue('PONG')
  })
}))

// Mock Next.js
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn()
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/'
}))

// Global test utilities
global.fetch = vi.fn()

// Suppress console logs in tests
global.console = {
  ...console,
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn()
}