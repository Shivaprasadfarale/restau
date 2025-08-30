import crypto from 'crypto'
import { getRedisClient } from '../redis'
import { passwordService } from './password'

export interface OTPData {
  hashedOTP: string
  expiresAt: Date
  attempts: number
  phone: string
  purpose: 'registration' | 'login' | 'verification'
  createdAt: Date
}

export interface OTPRateLimit {
  count: number
  resetTime: number
  blocked: boolean
}

export interface OTPValidationResult {
  valid: boolean
  error?: string
  attemptsRemaining?: number
  blockedUntil?: Date
}

class OTPService {
  private readonly OTP_PREFIX = 'otp:'
  private readonly RATE_LIMIT_PREFIX = 'otp_rate:'
  private readonly BLOCK_PREFIX = 'otp_block:'
  
  private readonly OTP_EXPIRY = 10 * 60 // 10 minutes
  private readonly MAX_ATTEMPTS = 3
  private readonly RATE_LIMIT_WINDOW = 60 * 60 // 1 hour
  private readonly MAX_REQUESTS_PER_HOUR = 5
  private readonly BLOCK_DURATION = 24 * 60 * 60 // 24 hours

  /**
   * Generate and store OTP with rate limiting
   */
  async generateOTP(
    phone: string, 
    purpose: 'registration' | 'login' | 'verification' = 'verification'
  ): Promise<{
    success: boolean
    otp?: string
    error?: string
    retryAfter?: number
  }> {
    try {
      const normalizedPhone = this.normalizePhone(phone)
      
      // Check if phone is blocked
      const blockStatus = await this.checkPhoneBlock(normalizedPhone)
      if (blockStatus.blocked) {
        return {
          success: false,
          error: 'Phone number is temporarily blocked due to excessive requests',
          retryAfter: Math.ceil((blockStatus.resetTime - Date.now()) / 1000)
        }
      }

      // Check rate limiting
      const rateLimitStatus = await this.checkRateLimit(normalizedPhone)
      if (rateLimitStatus.count >= this.MAX_REQUESTS_PER_HOUR) {
        // Block the phone number
        await this.blockPhone(normalizedPhone)
        return {
          success: false,
          error: 'Too many OTP requests. Phone number blocked for 24 hours.',
          retryAfter: this.BLOCK_DURATION
        }
      }

      // Check if there's already a valid OTP
      const existingOTP = await this.getOTP(normalizedPhone)
      if (existingOTP && existingOTP.expiresAt > new Date()) {
        return {
          success: false,
          error: 'OTP already sent. Please wait before requesting a new one.',
          retryAfter: Math.ceil((existingOTP.expiresAt.getTime() - Date.now()) / 1000)
        }
      }

      // Generate new OTP
      const otp = passwordService.generateOTP(6)
      const hashedOTP = await passwordService.hashOTP(otp)
      const expiresAt = new Date(Date.now() + this.OTP_EXPIRY * 1000)

      const otpData: OTPData = {
        hashedOTP,
        expiresAt,
        attempts: 0,
        phone: normalizedPhone,
        purpose,
        createdAt: new Date()
      }

      // Store OTP
      await this.storeOTP(normalizedPhone, otpData)
      
      // Update rate limit
      await this.updateRateLimit(normalizedPhone)

      return {
        success: true,
        otp // In production, don't return OTP, send via SMS
      }
    } catch (error) {
      console.error('OTP generation error:', error)
      return {
        success: false,
        error: 'Failed to generate OTP'
      }
    }
  }

  /**
   * Verify OTP with attempt tracking
   */
  async verifyOTP(phone: string, otp: string): Promise<OTPValidationResult> {
    try {
      const normalizedPhone = this.normalizePhone(phone)
      
      // Check if phone is blocked
      const blockStatus = await this.checkPhoneBlock(normalizedPhone)
      if (blockStatus.blocked) {
        return {
          valid: false,
          error: 'Phone number is temporarily blocked',
          blockedUntil: new Date(blockStatus.resetTime)
        }
      }

      // Get stored OTP
      const storedOTP = await this.getOTP(normalizedPhone)
      if (!storedOTP) {
        return {
          valid: false,
          error: 'OTP not found or expired'
        }
      }

      // Check expiry
      if (storedOTP.expiresAt <= new Date()) {
        await this.deleteOTP(normalizedPhone)
        return {
          valid: false,
          error: 'OTP has expired'
        }
      }

      // Check attempt limit
      if (storedOTP.attempts >= this.MAX_ATTEMPTS) {
        await this.deleteOTP(normalizedPhone)
        await this.blockPhone(normalizedPhone)
        return {
          valid: false,
          error: 'Too many failed attempts. Phone number blocked.'
        }
      }

      // Verify OTP
      const isValid = await passwordService.verifyOTP(otp, storedOTP.hashedOTP)
      
      if (!isValid) {
        // Increment attempts
        storedOTP.attempts++
        await this.storeOTP(normalizedPhone, storedOTP)
        
        return {
          valid: false,
          error: 'Invalid OTP',
          attemptsRemaining: this.MAX_ATTEMPTS - storedOTP.attempts
        }
      }

      // OTP is valid - clean up
      await this.deleteOTP(normalizedPhone)
      
      return {
        valid: true
      }
    } catch (error) {
      console.error('OTP verification error:', error)
      return {
        valid: false,
        error: 'Failed to verify OTP'
      }
    }
  }

  /**
   * Store OTP in Redis
   */
  private async storeOTP(phone: string, otpData: OTPData): Promise<void> {
    const redis = await getRedisClient()
    const key = `${this.OTP_PREFIX}${phone}`
    await redis.setex(key, this.OTP_EXPIRY, JSON.stringify(otpData))
  }

  /**
   * Get OTP from Redis
   */
  private async getOTP(phone: string): Promise<OTPData | null> {
    try {
      const redis = await getRedisClient()
      const key = `${this.OTP_PREFIX}${phone}`
      const data = await redis.get(key)
      return data ? JSON.parse(data) : null
    } catch (error) {
      console.error('Failed to get OTP:', error)
      return null
    }
  }

  /**
   * Delete OTP from Redis
   */
  private async deleteOTP(phone: string): Promise<void> {
    try {
      const redis = await getRedisClient()
      const key = `${this.OTP_PREFIX}${phone}`
      await redis.del(key)
    } catch (error) {
      console.error('Failed to delete OTP:', error)
    }
  }

  /**
   * Check rate limiting for phone number
   */
  private async checkRateLimit(phone: string): Promise<OTPRateLimit> {
    try {
      const redis = await getRedisClient()
      const key = `${this.RATE_LIMIT_PREFIX}${phone}`
      const data = await redis.get(key)
      
      if (!data) {
        return { count: 0, resetTime: Date.now() + this.RATE_LIMIT_WINDOW * 1000, blocked: false }
      }
      
      return JSON.parse(data)
    } catch (error) {
      console.error('Failed to check rate limit:', error)
      return { count: 0, resetTime: Date.now() + this.RATE_LIMIT_WINDOW * 1000, blocked: false }
    }
  }

  /**
   * Update rate limit counter
   */
  private async updateRateLimit(phone: string): Promise<void> {
    try {
      const redis = await getRedisClient()
      const key = `${this.RATE_LIMIT_PREFIX}${phone}`
      
      const existing = await this.checkRateLimit(phone)
      const now = Date.now()
      
      let newCount = 1
      let resetTime = now + this.RATE_LIMIT_WINDOW * 1000
      
      if (existing.resetTime > now) {
        newCount = existing.count + 1
        resetTime = existing.resetTime
      }
      
      const rateLimitData: OTPRateLimit = {
        count: newCount,
        resetTime,
        blocked: false
      }
      
      await redis.setex(key, this.RATE_LIMIT_WINDOW, JSON.stringify(rateLimitData))
    } catch (error) {
      console.error('Failed to update rate limit:', error)
    }
  }

  /**
   * Block phone number
   */
  private async blockPhone(phone: string): Promise<void> {
    try {
      const redis = await getRedisClient()
      const key = `${this.BLOCK_PREFIX}${phone}`
      const blockData = {
        blocked: true,
        resetTime: Date.now() + this.BLOCK_DURATION * 1000,
        blockedAt: new Date().toISOString()
      }
      
      await redis.setex(key, this.BLOCK_DURATION, JSON.stringify(blockData))
    } catch (error) {
      console.error('Failed to block phone:', error)
    }
  }

  /**
   * Check if phone is blocked
   */
  private async checkPhoneBlock(phone: string): Promise<{ blocked: boolean; resetTime: number }> {
    try {
      const redis = await getRedisClient()
      const key = `${this.BLOCK_PREFIX}${phone}`
      const data = await redis.get(key)
      
      if (!data) {
        return { blocked: false, resetTime: 0 }
      }
      
      const blockData = JSON.parse(data)
      return {
        blocked: blockData.blocked && blockData.resetTime > Date.now(),
        resetTime: blockData.resetTime
      }
    } catch (error) {
      console.error('Failed to check phone block:', error)
      return { blocked: false, resetTime: 0 }
    }
  }

  /**
   * Normalize phone number
   */
  private normalizePhone(phone: string): string {
    return phone.replace(/\s|-|\(|\)/g, '')
  }

  /**
   * Clean up expired OTPs and rate limits
   */
  async cleanup(): Promise<void> {
    try {
      const redis = await getRedisClient()
      
      // Get all OTP keys
      const otpKeys = await redis.keys(`${this.OTP_PREFIX}*`)
      const rateLimitKeys = await redis.keys(`${this.RATE_LIMIT_PREFIX}*`)
      const blockKeys = await redis.keys(`${this.BLOCK_PREFIX}*`)
      
      console.log(`Cleanup: Found ${otpKeys.length} OTPs, ${rateLimitKeys.length} rate limits, ${blockKeys.length} blocks`)
      
      // Redis TTL handles most cleanup automatically
    } catch (error) {
      console.error('OTP cleanup failed:', error)
    }
  }
}

export const otpService = new OTPService()

// Clean up every 30 minutes
setInterval(() => {
  otpService.cleanup()
}, 30 * 60 * 1000)