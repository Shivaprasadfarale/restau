import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { User } from '@/models'

export interface PasswordValidationResult {
  valid: boolean
  errors: string[]
  strength: 'weak' | 'medium' | 'strong'
  score: number
}

export interface PasswordResetToken {
  token: string
  hashedToken: string
  expiresAt: Date
}

class PasswordService {
  private readonly SALT_ROUNDS = 12
  private readonly MIN_LENGTH = 8
  private readonly MAX_LENGTH = 128

  /**
   * Hash password with bcrypt
   */
  async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(this.SALT_ROUNDS)
    return bcrypt.hash(password, salt)
  }

  /**
   * Verify password against hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(password, hash)
    } catch (error) {
      return false
    }
  }

  /**
   * Validate password strength and requirements
   */
  validatePassword(password: string): PasswordValidationResult {
    const errors: string[] = []
    let score = 0

    // Length check
    if (password.length < this.MIN_LENGTH) {
      errors.push(`Password must be at least ${this.MIN_LENGTH} characters long`)
    } else if (password.length >= this.MIN_LENGTH) {
      score += 1
    }

    if (password.length > this.MAX_LENGTH) {
      errors.push(`Password must not exceed ${this.MAX_LENGTH} characters`)
    }

    // Character type checks
    const hasLowercase = /[a-z]/.test(password)
    const hasUppercase = /[A-Z]/.test(password)
    const hasNumbers = /\d/.test(password)
    const hasSpecialChars = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)

    if (!hasLowercase) {
      errors.push('Password must contain at least one lowercase letter')
    } else {
      score += 1
    }

    if (!hasUppercase) {
      errors.push('Password must contain at least one uppercase letter')
    } else {
      score += 1
    }

    if (!hasNumbers) {
      errors.push('Password must contain at least one number')
    } else {
      score += 1
    }

    if (!hasSpecialChars) {
      errors.push('Password must contain at least one special character')
    } else {
      score += 1
    }

    // Common patterns to avoid
    const commonPatterns = [
      /(.)\1{2,}/, // Repeated characters (aaa, 111)
      /123456|654321|qwerty|password|admin/i, // Common sequences
      /^[a-zA-Z]+$/, // Only letters
      /^\d+$/ // Only numbers
    ]

    for (const pattern of commonPatterns) {
      if (pattern.test(password)) {
        errors.push('Password contains common patterns that make it weak')
        score = Math.max(0, score - 1)
        break
      }
    }

    // Sequential characters check
    if (this.hasSequentialChars(password)) {
      errors.push('Password should not contain sequential characters')
      score = Math.max(0, score - 1)
    }

    // Determine strength
    let strength: 'weak' | 'medium' | 'strong'
    if (score <= 2) {
      strength = 'weak'
    } else if (score <= 4) {
      strength = 'medium'
    } else {
      strength = 'strong'
    }

    return {
      valid: errors.length === 0,
      errors,
      strength,
      score
    }
  }

  /**
   * Check for sequential characters
   */
  private hasSequentialChars(password: string): boolean {
    const sequences = [
      'abcdefghijklmnopqrstuvwxyz',
      '0123456789',
      'qwertyuiopasdfghjklzxcvbnm'
    ]

    for (const sequence of sequences) {
      for (let i = 0; i <= sequence.length - 3; i++) {
        const subseq = sequence.substring(i, i + 3)
        if (password.toLowerCase().includes(subseq)) {
          return true
        }
      }
    }

    return false
  }

  /**
   * Generate secure random password
   */
  generateSecurePassword(length: number = 16): string {
    const lowercase = 'abcdefghijklmnopqrstuvwxyz'
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const numbers = '0123456789'
    const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?'
    
    const allChars = lowercase + uppercase + numbers + symbols
    
    let password = ''
    
    // Ensure at least one character from each category
    password += lowercase[Math.floor(Math.random() * lowercase.length)]
    password += uppercase[Math.floor(Math.random() * uppercase.length)]
    password += numbers[Math.floor(Math.random() * numbers.length)]
    password += symbols[Math.floor(Math.random() * symbols.length)]
    
    // Fill the rest randomly
    for (let i = 4; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)]
    }
    
    // Shuffle the password
    return password.split('').sort(() => Math.random() - 0.5).join('')
  }

  /**
   * Generate password reset token
   */
  generateResetToken(): PasswordResetToken {
    const token = crypto.randomBytes(32).toString('hex')
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex')
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

    return {
      token,
      hashedToken,
      expiresAt
    }
  }

  /**
   * Verify password reset token
   */
  verifyResetToken(token: string, hashedToken: string, expiresAt: Date): boolean {
    if (new Date() > expiresAt) {
      return false
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    return tokenHash === hashedToken
  }

  /**
   * Generate OTP for phone verification
   */
  generateOTP(length: number = 6): string {
    const digits = '0123456789'
    let otp = ''
    
    for (let i = 0; i < length; i++) {
      otp += digits[Math.floor(Math.random() * digits.length)]
    }
    
    return otp
  }

  /**
   * Hash OTP for storage
   */
  async hashOTP(otp: string): Promise<string> {
    return this.hashPassword(otp)
  }

  /**
   * Verify OTP
   */
  async verifyOTP(otp: string, hashedOTP: string): Promise<boolean> {
    return this.verifyPassword(otp, hashedOTP)
  }

  /**
   * Check if password has been breached using HaveIBeenPwned API
   */
  async checkPasswordBreach(password: string): Promise<boolean> {
    try {
      // First check against common passwords
      const commonPasswords = [
        'password', '123456', '123456789', 'qwerty', 'abc123',
        'password123', 'admin', 'letmein', 'welcome', 'monkey',
        '111111', 'dragon', 'sunshine', 'princess', 'football',
        'iloveyou', 'charlie', 'aa123456', 'donald', 'password1'
      ]
      
      if (commonPasswords.includes(password.toLowerCase())) {
        return true
      }

      // Use HaveIBeenPwned API (k-anonymity model)
      const hash = crypto.createHash('sha1').update(password).digest('hex').toUpperCase()
      const prefix = hash.substring(0, 5)
      const suffix = hash.substring(5)

      const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        method: 'GET',
        headers: {
          'User-Agent': 'Restaurant-Template-App'
        }
      })

      if (!response.ok) {
        // If API is down, fall back to common password check only
        console.warn('HaveIBeenPwned API unavailable, using fallback check')
        return false
      }

      const data = await response.text()
      const lines = data.split('\n')
      
      for (const line of lines) {
        const [hashSuffix, count] = line.split(':')
        if (hashSuffix === suffix) {
          const breachCount = parseInt(count.trim(), 10)
          // Consider password breached if found more than 5 times
          return breachCount > 5
        }
      }

      return false
    } catch (error) {
      console.error('Password breach check failed:', error)
      // On error, don't block user but log the issue
      return false
    }
  }

  /**
   * Generate secure session ID
   */
  generateSessionId(): string {
    return crypto.randomBytes(32).toString('hex')
  }

  /**
   * Generate device fingerprint from request headers
   */
  generateDeviceFingerprint(
    userAgent: string, 
    acceptLanguage: string = '', 
    acceptEncoding: string = '',
    ip: string = ''
  ): string {
    const data = `${userAgent}:${acceptLanguage}:${acceptEncoding}:${ip}`
    return crypto.createHash('sha256').update(data).digest('hex')
  }

  /**
   * Enhanced session validation with device binding
   */
  async validateDeviceBoundSession(
    sessionId: string,
    userId: string,
    deviceFingerprint: string
  ): Promise<{ valid: boolean; reason?: string }> {
    try {
      const user = await User.findById(userId)
      if (!user) {
        return { valid: false, reason: 'User not found' }
      }

      const session = user.sessions.id(sessionId)
      if (!session) {
        return { valid: false, reason: 'Session not found' }
      }

      if (session.isRevoked) {
        return { valid: false, reason: 'Session revoked' }
      }

      // Check if session has expired (inactive for more than 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      if (session.lastActivity < thirtyDaysAgo) {
        session.isRevoked = true
        await user.save()
        return { valid: false, reason: 'Session expired due to inactivity' }
      }

      // Validate device fingerprint (allow some flexibility for browser updates)
      const storedFingerprint = session.deviceFingerprint
      if (storedFingerprint && storedFingerprint !== deviceFingerprint) {
        // Log suspicious activity but don't immediately revoke
        console.warn(`Device fingerprint mismatch for session ${sessionId}`, {
          userId,
          stored: storedFingerprint,
          provided: deviceFingerprint
        })
        
        // For now, just log. In production, you might want to:
        // 1. Send security alert to user
        // 2. Require additional verification
        // 3. Revoke session after multiple mismatches
      }

      return { valid: true }
    } catch (error) {
      console.error('Session validation error:', error)
      return { valid: false, reason: 'Validation failed' }
    }
  }
}

export const passwordService = new PasswordService()