import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { connectToDatabase } from '@/lib/mongodb'
import { Coupon } from '@/models'
import { withOptionalAuth } from '@/lib/auth/middleware'

const validateCouponSchema = z.object({
  code: z.string().min(1, 'Coupon code is required').max(20).toUpperCase(),
  orderValue: z.number().min(0, 'Order value must be positive'),
  tenantId: z.string().optional(),
  restaurantId: z.string().optional(),
  userId: z.string().optional()
})

export const POST = withOptionalAuth(async (request: NextRequest, { authContext }) => {
  try {
    await connectToDatabase()

    const body = await request.json()
    const validatedData = validateCouponSchema.parse(body)

    // Determine tenant and restaurant ID
    let tenantId = validatedData.tenantId
    let restaurantId = validatedData.restaurantId
    let userId = validatedData.userId

    if (authContext) {
      tenantId = authContext.tenantId
      userId = authContext.userId
      
      if (!restaurantId && authContext.role === 'customer') {
        if (!validatedData.restaurantId) {
          return NextResponse.json({
            success: false,
            error: {
              code: 'RESTAURANT_ID_REQUIRED',
              message: 'Restaurant ID is required'
            }
          }, { status: 400 })
        }
        restaurantId = validatedData.restaurantId
      }
      
      if (['owner', 'manager', 'staff'].includes(authContext.role)) {
        restaurantId = validatedData.restaurantId || authContext.tenantId
      }
    }

    if (!tenantId || !restaurantId) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'Tenant ID and Restaurant ID are required'
        }
      }, { status: 400 })
    }

    // Find the coupon
    const coupon = await Coupon.findByCode(tenantId, restaurantId, validatedData.code)

    if (!coupon) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'COUPON_NOT_FOUND',
          message: 'Invalid coupon code'
        }
      }, { status: 404 })
    }

    // Validate coupon
    const validation = coupon.isValid(validatedData.orderValue)
    
    if (!validation.valid) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'COUPON_INVALID',
          message: validation.reason || 'Coupon is not valid'
        }
      }, { status: 400 })
    }

    // Calculate discount
    const discountAmount = coupon.calculateDiscount(validatedData.orderValue)
    const finalAmount = validatedData.orderValue - discountAmount

    // Check user-specific restrictions if user is provided
    let userValidation = { valid: true, reason: '' }
    if (userId && coupon.userRestrictions) {
      // In a real implementation, you'd check user's coupon usage history
      // For now, we'll just validate the basic restrictions
      if (coupon.userRestrictions.newUsersOnly) {
        // Check if user is new (simplified check)
        userValidation = { valid: true, reason: '' } // Assume valid for demo
      }
    }

    if (!userValidation.valid) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'COUPON_USER_RESTRICTION',
          message: userValidation.reason
        }
      }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      data: {
        coupon: {
          id: coupon._id,
          code: coupon.code,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          minOrderValue: coupon.minOrderValue,
          validTo: coupon.validTo
        },
        discount: {
          amount: discountAmount,
          originalAmount: validatedData.orderValue,
          finalAmount,
          savings: discountAmount
        },
        validation: {
          valid: true,
          message: `Coupon applied successfully! You saved ₹${discountAmount}`
        }
      }
    })

  } catch (error: any) {
    console.error('Coupon validation error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid coupon validation data',
          details: error.errors
        }
      }, { status: 400 })
    }

    return NextResponse.json({
      success: false,
      error: {
        code: 'COUPON_VALIDATION_ERROR',
        message: 'Failed to validate coupon'
      }
    }, { status: 500 })
  }
}, {
  rateLimitKey: 'coupon-validate',
  rateLimitMax: 20,
  rateLimitWindow: 3600
})