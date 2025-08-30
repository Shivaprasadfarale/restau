import { connectRedis } from '@/lib/redis'
import { NextRequest } from 'next/server'

export interface RateLimitResult {
  success: boolean
  limit?: number
  remaining?: number
  reset?: number
}

export async function rateLimiter(request: NextRequest): Promise<RateLimitResult> {
  try {
    const redis = await connectRedis()
    const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown'
    const key = `rate_limit:${ip}`
    
    const now = Date.now()
    const window = Math.floor(now / (60 * 1000)) // 1 minute window
    const redisKey = `${key}:${window}`
    
    const count = await redis.incr(redisKey)
    await redis.expire(redisKey, 60) // Expire after 1 minute
    
    const limit = 100 // 100 requests per minute
    const remaining = Math.max(0, limit - count)
    const reset = (window + 1) * 60 * 1000
    
    return {
      success: count <= limit,
      limit,
      remaining,
      reset
    }
  } catch (error) {
    console.error('Rate limiter error:', error)
    // Fail open - allow request if Redis is down
    return { success: true }
  }
}

export interface RateLimitConfig {
  allowed: boolean
  remaining: number
  resetTime: number
  total: number
}

class RateLimiter {
  /**
   * Check if request is within rate limit
   */
  async checkLimit(
    key: string,
    maxRequests: number,
    windowMs: number
  ): Promise<RateLimitConfig> {
    try {
      const redis = await connectRedis()
      const now = Date.now()
      const window = Math.floor(now / windowMs)
      const redisKey = `rate_limit:${key}:${window}`

      // Use Redis pipeline for atomic operations
      const pipeline = redis.pipeline()
      pipeline.incr(redisKey)
      pipeline.expire(redisKey, Math.ceil(windowMs / 1000))
      
      const results = await pipeline.exec()
      const count = results?.[0]?.[1] as number || 0

      const remaining = Math.max(0, maxRequests - count)
      const resetTime = (window + 1) * windowMs

      return {
        allowed: count <= maxRequests,
        remaining,
        resetTime,
        total: maxRequests
      }
    } catch (error) {
      console.error('Rate limiter error:', error)
      // Fail open - allow request if Redis is down
      return {
        allowed: true,
        remaining: 0,
        resetTime: Date.now() + windowMs,
        total: maxRequests
      }
    }
  }

  /**
   * Check sliding window rate limit (more accurate but more expensive)
   */
  async checkSlidingWindowLimit(
    key: string,
    maxRequests: number,
    windowMs: number
  ): Promise<RateLimitConfig> {
    try {
      const redis = await connectRedis()
      const now = Date.now()
      const cutoff = now - windowMs
      const redisKey = `sliding_rate_limit:${key}`

      // Remove old entries and add current request
      const pipeline = redis.pipeline()
      pipeline.zremrangebyscore(redisKey, 0, cutoff)
      pipeline.zadd(redisKey, now, `${now}-${Math.random()}`)
      pipeline.zcard(redisKey)
      pipeline.expire(redisKey, Math.ceil(windowMs / 1000))

      const results = await pipeline.exec()
      const count = results?.[2]?.[1] as number || 0

      const remaining = Math.max(0, maxRequests - count)
      const resetTime = now + windowMs

      return {
        allowed: count <= maxRequests,
        remaining,
        resetTime,
        total: maxRequests
      }
    } catch (error) {
      console.error('Sliding window rate limiter error:', error)
      // Fail open - allow request if Redis is down
      return {
        allowed: true,
        remaining: 0,
        resetTime: Date.now() + windowMs,
        total: maxRequests
      }
    }
  }

  /**
   * Reset rate limit for a key
   */
  async resetLimit(key: string): Promise<void> {
    try {
      const redis = await connectRedis()
      const pattern = `rate_limit:${key}:*`
      const keys = await redis.keys(pattern)
      if (keys.length > 0) {
        await redis.del(...keys)
      }

      // Also reset sliding window
      const slidingKey = `sliding_rate_limit:${key}`
      await redis.del(slidingKey)
    } catch (error) {
      console.error('Rate limit reset error:', error)
    }
  }

  /**
   * Get current rate limit status
   */
  async getStatus(
    key: string,
    maxRequests: number,
    windowMs: number
  ): Promise<RateLimitConfig> {
    try {
      const redis = await connectRedis()
      const now = Date.now()
      const window = Math.floor(now / windowMs)
      const redisKey = `rate_limit:${key}:${window}`

      const count = await redis.get(redisKey) || 0
      const remaining = Math.max(0, maxRequests - Number(count))
      const resetTime = (window + 1) * windowMs

      return {
        allowed: Number(count) < maxRequests,
        remaining,
        resetTime,
        total: maxRequests
      }
    } catch (error) {
      console.error('Rate limit status error:', error)
      return {
        allowed: true,
        remaining: maxRequests,
        resetTime: Date.now() + windowMs,
        total: maxRequests
      }
    }
  }

  /**
   * Increment rate limit counter without checking
   */
  async increment(
    key: string,
    windowMs: number,
    amount: number = 1
  ): Promise<number> {
    try {
      const redis = await connectRedis()
      const now = Date.now()
      const window = Math.floor(now / windowMs)
      const redisKey = `rate_limit:${key}:${window}`

      const pipeline = redis.pipeline()
      pipeline.incrby(redisKey, amount)
      pipeline.expire(redisKey, Math.ceil(windowMs / 1000))
      
      const results = await pipeline.exec()
      return results?.[0]?.[1] as number || 0
    } catch (error) {
      console.error('Rate limit increment error:', error)
      return 0
    }
  }

  /**
   * Check multiple rate limits at once
   */
  async checkMultipleLimits(
    checks: Array<{
      key: string
      maxRequests: number
      windowMs: number
    }>
  ): Promise<RateLimitConfig[]> {
    const results = await Promise.all(
      checks.map(check => 
        this.checkLimit(check.key, check.maxRequests, check.windowMs)
      )
    )
    return results
  }

  /**
   * Adaptive rate limiting based on system load
   */
  async checkAdaptiveLimit(
    key: string,
    baseMaxRequests: number,
    windowMs: number,
    loadFactor: number = 1.0
  ): Promise<RateLimitConfig> {
    // Adjust max requests based on system load
    const adjustedMaxRequests = Math.floor(baseMaxRequests * loadFactor)
    return this.checkLimit(key, adjustedMaxRequests, windowMs)
  }
}

export const advancedRateLimiter = new RateLimiter()

// Common rate limit configurations
export const RATE_LIMITS = {
  // Authentication
  ADMIN_LOGIN: { maxRequests: 5, windowMs: 15 * 60 * 1000 }, // 5 attempts per 15 minutes
  ADMIN_REFRESH: { maxRequests: 10, windowMs: 60 * 1000 }, // 10 refreshes per minute
  
  // API endpoints
  ADMIN_API_GENERAL: { maxRequests: 100, windowMs: 60 * 1000 }, // 100 requests per minute
  ADMIN_API_WRITE: { maxRequests: 30, windowMs: 60 * 1000 }, // 30 write operations per minute
  ADMIN_API_BULK: { maxRequests: 5, windowMs: 60 * 1000 }, // 5 bulk operations per minute
  
  // File uploads
  ADMIN_FILE_UPLOAD: { maxRequests: 10, windowMs: 60 * 1000 }, // 10 uploads per minute
  
  // Reports and exports
  ADMIN_EXPORT: { maxRequests: 3, windowMs: 60 * 1000 }, // 3 exports per minute
  
  // Password reset
  PASSWORD_RESET: { maxRequests: 3, windowMs: 60 * 60 * 1000 }, // 3 attempts per hour
  
  // OTP
  OTP_SEND: { maxRequests: 5, windowMs: 60 * 60 * 1000 }, // 5 OTP sends per hour
  OTP_VERIFY: { maxRequests: 10, windowMs: 15 * 60 * 1000 }, // 10 verifications per 15 minutes
} as const