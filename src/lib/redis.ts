import Redis from 'ioredis'
import { env } from './env'

interface RedisCache {
  client: Redis | null
  promise: Promise<Redis> | null
}

declare global {
  var redis: RedisCache | undefined
}

const cached: RedisCache = globalThis.redis || {
  client: null,
  promise: null,
}

if (!globalThis.redis) {
  globalThis.redis = cached
}

export async function connectRedis(): Promise<Redis> {
  if (cached.client && cached.client.status === 'ready') {
    return cached.client
  }

  if (!cached.promise) {
    cached.promise = new Promise((resolve, reject) => {
      const client = new Redis(env.REDIS_URL, {
        enableReadyCheck: false,
        maxRetriesPerRequest: null,
        lazyConnect: true,
      })

      client.on('connect', () => {
        console.log('✅ Redis connected successfully')
      })

      client.on('error', (error) => {
        console.error('❌ Redis connection failed:', error)
        reject(error)
      })

      client.on('ready', () => {
        resolve(client)
      })

      client.connect().catch(reject)
    })
  }

  try {
    cached.client = await cached.promise
    return cached.client
  } catch (error) {
    cached.promise = null
    cached.client = null
    throw error
  }
}

export async function disconnectRedis(): Promise<void> {
  if (cached.client) {
    await cached.client.quit()
    cached.client = null
    cached.promise = null
    console.log('✅ Redis disconnected')
  }
}

// Export getRedisClient for compatibility
export async function getRedisClient(): Promise<Redis> {
  return await connectRedis()
}

// Utility functions for common Redis operations
export class RedisService {
  private static client: Redis | null = null

  static async getClient(): Promise<Redis> {
    if (!this.client) {
      this.client = await connectRedis()
    }
    return this.client
  }

  static async set(key: string, value: string, ttl?: number): Promise<void> {
    const client = await this.getClient()
    if (ttl) {
      await client.setex(key, ttl, value)
    } else {
      await client.set(key, value)
    }
  }

  static async get(key: string): Promise<string | null> {
    const client = await this.getClient()
    return await client.get(key)
  }

  static async del(key: string): Promise<void> {
    const client = await this.getClient()
    await client.del(key)
  }

  static async exists(key: string): Promise<boolean> {
    const client = await this.getClient()
    const result = await client.exists(key)
    return result === 1
  }

  static async invalidatePattern(pattern: string): Promise<void> {
    const client = await this.getClient()
    const keys = await client.keys(pattern)
    if (keys.length > 0) {
      await client.del(...keys)
    }
  }
}