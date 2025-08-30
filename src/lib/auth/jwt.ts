import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { env } from '../env'
import { User } from '@/models'
import { Types } from 'mongoose'
import { connectRedis } from '../redis'

export interface JWTPayload {
  userId: string
  tenantId: string
  role: string
  sessionId: string
  deviceFingerprint: string
  type: 'access' | 'refresh'
  tokenFamily?: string // For refresh token rotation
  jti?: string // JWT ID for revocation
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
  expiresIn: number
  refreshExpiresIn: number
  tokenFamily: string
}

export interface TokenValidationResult {
  valid: boolean
  payload?: JWTPayload
  error?: string
  expired?: boolean
}

class JWTService {
  private readonly ACCESS_TOKEN_EXPIRY = '15m' // 15 minutes
  private readonly REFRESH_TOKEN_EXPIRY = '7d' // 7 days
  private readonly ALGORITHM = 'HS256'
  private readonly TOKEN_REVOCATION_PREFIX = 'revoked_token:'
  private readonly TOKEN_FAMILY_PREFIX = 'token_family:'

  /**
   * Generate access and refresh token pair with rotation support
   */
  async generateTokenPair(
    userId: string,
    tenantId: string,
    role: string,
    sessionId?: string,
    deviceFingerprint?: string,
    tokenFamily?: string
  ): Promise<TokenPair> {
    const actualSessionId = sessionId || new Types.ObjectId().toString()
    const actualDeviceFingerprint = deviceFingerprint || this.generateDeviceFingerprint()
    const actualTokenFamily = tokenFamily || this.generateTokenFamily()
    
    const accessJti = this.generateJTI()
    const refreshJti = this.generateJTI()
    
    const basePayload = {
      userId,
      tenantId,
      role,
      sessionId: actualSessionId,
      deviceFingerprint: actualDeviceFingerprint,
      tokenFamily: actualTokenFamily
    }

    const accessToken = jwt.sign(
      { 
        ...basePayload, 
        type: 'access',
        jti: accessJti
      },
      env.JWT_SECRET,
      {
        expiresIn: this.ACCESS_TOKEN_EXPIRY,
        algorithm: this.ALGORITHM,
        issuer: 'restaurant-template',
        audience: 'restaurant-app'
      }
    )

    const refreshToken = jwt.sign(
      { 
        ...basePayload, 
        type: 'refresh',
        jti: refreshJti
      },
      env.JWT_REFRESH_SECRET,
      {
        expiresIn: this.REFRESH_TOKEN_EXPIRY,
        algorithm: this.ALGORITHM,
        issuer: 'restaurant-template',
        audience: 'restaurant-app'
      }
    )

    // Store token family in Redis for rotation tracking
    await this.storeTokenFamily(actualTokenFamily, {
      userId,
      sessionId: actualSessionId,
      refreshJti,
      createdAt: new Date(),
      deviceFingerprint: actualDeviceFingerprint
    })

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 minutes in seconds
      refreshExpiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
      tokenFamily: actualTokenFamily
    }
  }

  /**
   * Validate access token
   */
  validateAccessToken(token: string): TokenValidationResult {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET, {
        algorithms: [this.ALGORITHM],
        issuer: 'restaurant-template',
        audience: 'restaurant-app'
      }) as JWTPayload

      if (payload.type !== 'access') {
        return { valid: false, error: 'Invalid token type' }
      }

      return { valid: true, payload }
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        return { valid: false, expired: true, error: 'Token expired' }
      }
      return { valid: false, error: error.message }
    }
  }

  /**
   * Validate refresh token
   */
  validateRefreshToken(token: string): TokenValidationResult {
    try {
      const payload = jwt.verify(token, env.JWT_REFRESH_SECRET, {
        algorithms: [this.ALGORITHM],
        issuer: 'restaurant-template',
        audience: 'restaurant-app'
      }) as JWTPayload

      if (payload.type !== 'refresh') {
        return { valid: false, error: 'Invalid token type' }
      }

      return { valid: true, payload }
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        return { valid: false, expired: true, error: 'Token expired' }
      }
      return { valid: false, error: error.message }
    }
  }

  /**
   * Refresh token rotation with reuse detection
   */
  async refreshTokens(refreshToken: string, deviceFingerprint?: string): Promise<{
    success: boolean
    tokens?: TokenPair
    error?: string
    reuseDetected?: boolean
  }> {
    const validation = this.validateRefreshToken(refreshToken)
    
    if (!validation.valid || !validation.payload) {
      return { success: false, error: validation.error }
    }

    const { userId, tenantId, role, sessionId, tokenFamily, jti, deviceFingerprint: tokenDeviceFingerprint } = validation.payload

    try {
      // Check if token is revoked
      if (await this.isTokenRevoked(jti!)) {
        return { success: false, error: 'Token has been revoked' }
      }

      // Validate device fingerprint if provided
      if (deviceFingerprint && tokenDeviceFingerprint && deviceFingerprint !== tokenDeviceFingerprint) {
        // Potential token theft - revoke entire token family
        await this.revokeTokenFamily(tokenFamily!)
        return { 
          success: false, 
          error: 'Device fingerprint mismatch - security violation detected',
          reuseDetected: true
        }
      }

      // Check token family for reuse detection
      const familyData = await this.getTokenFamily(tokenFamily!)
      if (!familyData) {
        return { success: false, error: 'Invalid token family' }
      }

      // Check if this refresh token was already used (reuse detection)
      if (familyData.refreshJti !== jti) {
        // Token reuse detected - revoke entire family
        await this.revokeTokenFamily(tokenFamily!)
        await this.revokeAllUserSessions(userId)
        return { 
          success: false, 
          error: 'Token reuse detected - all sessions revoked for security',
          reuseDetected: true
        }
      }

      // Check if user and session still exist and are valid
      const user = await User.findById(userId)
      if (!user || user.tenantId !== tenantId) {
        return { success: false, error: 'User not found or tenant mismatch' }
      }

      const session = user.sessions.id(sessionId)
      if (!session || session.isRevoked) {
        return { success: false, error: 'Session not found or revoked' }
      }

      // Revoke the current refresh token
      await this.revokeToken(jti!)

      // Update session activity
      session.lastActivity = new Date()
      await user.save()

      // Generate new token pair with same family
      const tokens = await this.generateTokenPair(
        userId, 
        tenantId, 
        role, 
        sessionId, 
        tokenDeviceFingerprint,
        tokenFamily
      )

      return { success: true, tokens }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Revoke a specific session
   */
  async revokeSession(userId: string, sessionId: string): Promise<boolean> {
    try {
      const user = await User.findById(userId)
      if (!user) return false

      const session = user.sessions.id(sessionId)
      if (session) {
        session.isRevoked = true
        await user.save()
        return true
      }
      return false
    } catch (error) {
      return false
    }
  }

  /**
   * Revoke all sessions for a user
   */
  async revokeAllSessions(userId: string): Promise<boolean> {
    try {
      const user = await User.findById(userId)
      if (!user) return false

      user.sessions.forEach(session => {
        session.isRevoked = true
      })
      await user.save()
      return true
    } catch (error) {
      return false
    }
  }

  /**
   * Extract token from Authorization header
   */
  extractTokenFromHeader(authHeader?: string): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null
    }
    return authHeader.substring(7)
  }

  /**
   * Decode token without verification (for debugging)
   */
  decodeToken(token: string): any {
    try {
      return jwt.decode(token)
    } catch (error) {
      return null
    }
  }

  /**
   * Generate unique JWT ID
   */
  private generateJTI(): string {
    return crypto.randomBytes(16).toString('hex')
  }

  /**
   * Generate token family ID
   */
  private generateTokenFamily(): string {
    return crypto.randomBytes(16).toString('hex')
  }

  /**
   * Generate device fingerprint
   */
  private generateDeviceFingerprint(): string {
    return crypto.randomBytes(16).toString('hex')
  }

  /**
   * Store token family data in Redis
   */
  private async storeTokenFamily(tokenFamily: string, data: {
    userId: string
    sessionId: string
    refreshJti: string
    createdAt: Date
    deviceFingerprint: string
  }): Promise<void> {
    try {
      const redis = await getRedisClient()
      const key = `${this.TOKEN_FAMILY_PREFIX}${tokenFamily}`
      await redis.setex(key, 7 * 24 * 60 * 60, JSON.stringify(data)) // 7 days
    } catch (error) {
      console.error('Failed to store token family:', error)
    }
  }

  /**
   * Get token family data from Redis
   */
  private async getTokenFamily(tokenFamily: string): Promise<{
    userId: string
    sessionId: string
    refreshJti: string
    createdAt: Date
    deviceFingerprint: string
  } | null> {
    try {
      const redis = await getRedisClient()
      const key = `${this.TOKEN_FAMILY_PREFIX}${tokenFamily}`
      const data = await redis.get(key)
      return data ? JSON.parse(data) : null
    } catch (error) {
      console.error('Failed to get token family:', error)
      return null
    }
  }

  /**
   * Revoke token family (all tokens in the family)
   */
  private async revokeTokenFamily(tokenFamily: string): Promise<void> {
    try {
      const redis = await getRedisClient()
      const key = `${this.TOKEN_FAMILY_PREFIX}${tokenFamily}`
      await redis.del(key)
    } catch (error) {
      console.error('Failed to revoke token family:', error)
    }
  }

  /**
   * Revoke individual token by JTI
   */
  async revokeToken(jti: string): Promise<void> {
    try {
      const redis = await getRedisClient()
      const key = `${this.TOKEN_REVOCATION_PREFIX}${jti}`
      await redis.setex(key, 7 * 24 * 60 * 60, 'revoked') // 7 days
    } catch (error) {
      console.error('Failed to revoke token:', error)
    }
  }

  /**
   * Check if token is revoked
   */
  async isTokenRevoked(jti: string): Promise<boolean> {
    try {
      const redis = await getRedisClient()
      const key = `${this.TOKEN_REVOCATION_PREFIX}${jti}`
      const result = await redis.get(key)
      return result === 'revoked'
    } catch (error) {
      console.error('Failed to check token revocation:', error)
      return false
    }
  }

  /**
   * Revoke all sessions for a user
   */
  async revokeAllUserSessions(userId: string): Promise<boolean> {
    try {
      const user = await User.findById(userId)
      if (!user) return false

      user.sessions.forEach(session => {
        session.isRevoked = true
      })
      await user.save()
      return true
    } catch (error) {
      console.error('Failed to revoke all user sessions:', error)
      return false
    }
  }

  /**
   * Validate token with revocation check
   */
  async validateTokenWithRevocation(token: string, type: 'access' | 'refresh'): Promise<TokenValidationResult> {
    const validation = type === 'access' 
      ? this.validateAccessToken(token)
      : this.validateRefreshToken(token)

    if (!validation.valid || !validation.payload?.jti) {
      return validation
    }

    // Check if token is revoked
    const isRevoked = await this.isTokenRevoked(validation.payload.jti)
    if (isRevoked) {
      return {
        valid: false,
        error: 'Token has been revoked'
      }
    }

    return validation
  }

  /**
   * Create device fingerprint from request headers
   */
  createDeviceFingerprint(userAgent: string, acceptLanguage: string, acceptEncoding: string): string {
    const data = `${userAgent}:${acceptLanguage}:${acceptEncoding}`
    return crypto.createHash('sha256').update(data).digest('hex')
  }

  /**
   * Clean up expired tokens from Redis
   */
  async cleanupExpiredTokens(): Promise<void> {
    try {
      const redis = await getRedisClient()
      
      // Get all revoked token keys
      const revokedKeys = await redis.keys(`${this.TOKEN_REVOCATION_PREFIX}*`)
      const familyKeys = await redis.keys(`${this.TOKEN_FAMILY_PREFIX}*`)
      
      // Redis automatically handles TTL, but we can manually clean up if needed
      console.log(`Found ${revokedKeys.length} revoked tokens and ${familyKeys.length} token families`)
    } catch (error) {
      console.error('Failed to cleanup expired tokens:', error)
    }
  }
}

export const jwtService = new JWTService()

// Wrapper function for backward compatibility
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  const result = await jwtService.validateTokenWithRevocation(token, 'access')
  return result.valid ? result.payload! : null
}