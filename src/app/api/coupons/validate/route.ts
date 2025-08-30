import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyAuth } from '@/lib/auth/middleware'
import { Coupon } from '@/models/Coupon'
import { Order } from '@/models/Order'
import { connectToDatabase } from '@/lib/mongodb'
import { getRedisClient } from '@/lib/redis'
import { generateUUID } from '@/lib/utils/uuid'

const validateCouponSchema = z.object({
  tenantId: z.string(),
  restaurantId: z.string(),
  code: z.string().min(1).max(20),
  orderTotal: z.number().min(0),
  userId: z.string(),
  idempotencyKey: z.string().uuid().optional()
})

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      )
    }

    const body = await request.json()
    const validatedData = validateCouponSchema.parse(body)
    const { tenantId, restaurantId, code, orderTotal, userId, idempotencyKey } = validatedData

    // Verify tenant access
    if (authResult.user.tenantId !== tenantId) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } },
        { status: 403 }
      )
    }

    await connectToDatabase()
    const redis = await getRedisClient()

    // Check idempotency if provided
    if (idempotencyKey) {
      const idempotencyCheck = await redis.get(`coupon:idempotency:${idempotencyKey}`)
      if (idempotencyCheck) {
        return NextResponse.json(JSON.parse(idempotencyCheck))
      }
    }

    // Rate limiting for coupon validation (prevent brute force)
    const rateLimitKey = `coupon:rate_limit:${tenantId}:${userId}`
    const currentAttempts = await redis.get(rateLimitKey)
    
    if (currentAttempts && parseInt(currentAttempts) >= 10) {
      const errorResponse = {
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many coupon validation attempts. Please try again later.' }
      }
      
      if (idempotencyKey) {
        await redis.setex(`coupon:idempotency:${idempotencyKey}`, 300, JSON.stringify(errorResponse))
      }
      
      return NextResponse.json(errorResponse, { status: 429 })
    }

    // Increment rate limit counter
    await redis.incr(rateLimitKey)
    await redis.expire(rateLimitKey, 3600) // 1 hour window

    // Find coupon
    const coupon = await Coupon.findByCode(tenantId, restaurantId, code)
    
    if (!coupon) {
      const errorResponse = {
        success: false,
        data: {
          valid: false,
          reason: 'Invalid coupon code'
        }
      }
      
      if (idempotencyKey) {
        await redis.setex(`coupon:idempotency:${idempotencyKey}`, 300, JSON.stringify(errorResponse))
      }
      
      return NextResponse.json(errorResponse)
    }

    // Basic coupon validation
    const basicValidation = coupon.isValid(orderTotal)
    if (!basicValidation.valid) {
      const errorResponse = {
        success: false,
        data: {
          valid: false,
          reason: basicValidation.reason
        }
      }
      
      if (idempotencyKey) {
        await redis.setex(`coupon:idempotency:${idempotencyKey}`, 300, JSON.stringify(errorResponse))
      }
      
      return NextResponse.json(errorResponse)
    }

    // Check user-specific restrictions
    if (coupon.userRestrictions) {
      const userOrderCount = await Order.countDocuments({
        tenantId,
        restaurantId,
        userId,
        status: { $ne: 'cancelled' }
      })

      // Check if new users only
      if (coupon.userRestrictions.newUsersOnly && userOrderCount > 0) {
        const errorResponse = {
          success: false,
          data: {
            valid: false,
            reason: 'This coupon is only valid for new users'
          }
        }
        
        if (idempotencyKey) {
          await redis.setex(`coupon:idempotency:${idempotencyKey}`, 300, JSON.stringify(errorResponse))
        }
        
        return NextResponse.json(errorResponse)
      }

      // Check if first order only
      if (coupon.userRestrictions.firstOrderOnly && userOrderCount > 0) {
        const errorResponse = {
          success: false,
          data: {
            valid: false,
            reason: 'This coupon is only valid for your first order'
          }
        }
        
        if (idempotencyKey) {
          await redis.setex(`coupon:idempotency:${idempotencyKey}`, 300, JSON.stringify(errorResponse))
        }
        
        return NextResponse.json(errorResponse)
      }

      // Check max usage per user
      if (coupon.userRestrictions.maxUsagePerUser) {
        const userCouponUsage = await Order.countDocuments({
          tenantId,
          restaurantId,
          userId,
          status: { $ne: 'cancelled' },
          'appliedCoupon.code': coupon.code
        })

        if (userCouponUsage >= coupon.userRestrictions.maxUsagePerUser) {
          const errorResponse = {
            success: false,
            data: {
              valid: false,
              reason: `You have already used this coupon ${coupon.userRestrictions.maxUsagePerUser} time(s)`
            }
          }
          
          if (idempotencyKey) {
            await redis.setex(`coupon:idempotency:${idempotencyKey}`, 300, JSON.stringify(errorResponse))
          }
          
          return NextResponse.json(errorResponse)
        }
      }
    }

    // Calculate discount
    const discount = coupon.calculateDiscount(orderTotal)

    const successResponse = {
      success: true,
      data: {
        valid: true,
        discount,
        coupon: {
          id: coupon._id.toString(),
          code: coupon.code,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          minOrderValue: coupon.minOrderValue,
          validTo: coupon.validTo,
          description: `${coupon.discountType === 'percentage' ? coupon.discountValue + '%' : '₹' + coupon.discountValue} off`
        }
      }
    }

    // Cache successful validation for 5 minutes
    const cacheKey = `coupon:validation:${tenantId}:${restaurantId}:${code}:${orderTotal}:${userId}`
    await redis.setex(cacheKey, 300, JSON.stringify(successResponse))

    if (idempotencyKey) {
      await redis.setex(`coupon:idempotency:${idempotencyKey}`, 300, JSON.stringify(successResponse))
    }

    return NextResponse.json(successResponse)

  } catch (error) {
    console.error('Validate coupon error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request data', details: error.errors } },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to validate coupon' } },
      { status: 500 }
    )
  }
}