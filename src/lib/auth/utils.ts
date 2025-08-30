import { NextRequest } from 'next/server'

/**
 * Extract client IP address from NextRequest
 */
export function getClientIP(request: NextRequest): string {
  // Try various headers for IP address
  const forwarded = request.headers.get('x-forwarded-for')
  const realIP = request.headers.get('x-real-ip')
  const cfConnectingIP = request.headers.get('cf-connecting-ip')
  
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs, take the first one
    return forwarded.split(',')[0].trim()
  }
  
  if (realIP) {
    return realIP
  }
  
  if (cfConnectingIP) {
    return cfConnectingIP
  }
  
  // Fallback to unknown if no IP found
  return 'unknown'
}

/**
 * Extract user agent from NextRequest
 */
export function getUserAgent(request: NextRequest): string {
  return request.headers.get('user-agent') || 'Unknown'
}

/**
 * Extract accept language from NextRequest
 */
export function getAcceptLanguage(request: NextRequest): string {
  return request.headers.get('accept-language') || ''
}

/**
 * Extract accept encoding from NextRequest
 */
export function getAcceptEncoding(request: NextRequest): string {
  return request.headers.get('accept-encoding') || ''
}

/**
 * Create device fingerprint from request headers
 */
export function createDeviceFingerprint(request: NextRequest): string {
  const userAgent = getUserAgent(request)
  const acceptLanguage = getAcceptLanguage(request)
  const acceptEncoding = getAcceptEncoding(request)
  const clientIP = getClientIP(request)
  
  const data = `${userAgent}:${acceptLanguage}:${acceptEncoding}:${clientIP}`
  return require('crypto').createHash('sha256').update(data).digest('hex')
}