import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth/middleware'
import { Restaurant } from '@/models/Restaurant'
import { connectToDatabase } from '@/lib/mongodb'
import { getRedisClient } from '@/lib/redis'

const calculateCartSchema = z.object({
  tenantId: z.string(),
  restaurantId: z.string(),
  appliedCouponCode: z.string().optional()
})

interface CartCalculation {
  subtotal: number
  tax: number
  deliveryFee: number
  discount: number
  total: number
  gstBreakdown: {
    cgst: number
    sgst: number
    igst: number
  }
  roundingAdjustment: number
  itemCount: number
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await withAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      )
    }

    const body = await request.json()
    const validatedData = calculateCartSchema.parse(body)
    const { tenantId, restaurantId, appliedCouponCode } = validatedData

    // Verify tenant access
    if (authResult.user.tenantId !== tenantId) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } },
        { status: 403 }
      )
    }

    await connectToDatabase()
    const redis = await getRedisClient()

    // Get cart from Redis
    const cartKey = `cart:${tenantId}:${authResult.user.id}:${restaurantId}`
    const existingCart = await redis.get(cartKey)
    
    if (!existingCart) {
      return NextResponse.json({
        success: true,
        data: {
          subtotal: 0,
          tax: 0,
          deliveryFee: 0,
          discount: 0,
          total: 0,
          gstBreakdown: { cgst: 0, sgst: 0, igst: 0 },
          roundingAdjustment: 0,
          itemCount: 0
        }
      })
    }

    const cart = JSON.parse(existingCart)

    // Get restaurant info for tax and delivery fee calculation
    const restaurant = await Restaurant.findOne({
      _id: restaurantId,
      tenantId,
      isDeleted: { $ne: true }
    })

    if (!restaurant) {
      return NextResponse.json(
        { success: false, error: { code: 'RESTAURANT_NOT_FOUND', message: 'Restaurant not found' } },
        { status: 404 }
      )
    }

    // Calculate subtotal
    const subtotal = cart.items.reduce((sum: number, item: any) => sum + item.totalPrice, 0)
    const itemCount = cart.items.reduce((sum: number, item: any) => sum + item.quantity, 0)

    // Calculate GST with proper rounding rules
    const taxRate = restaurant.taxRate || 0.05 // Default 5% GST
    const taxAmount = subtotal * taxRate
    
    // GST breakdown (assuming CGST + SGST for intrastate, IGST for interstate)
    // For simplicity, using CGST + SGST (can be enhanced based on delivery address)
    const cgst = Math.round((taxAmount / 2) * 100) / 100 // Round to 2 decimal places
    const sgst = Math.round((taxAmount / 2) * 100) / 100
    const igst = 0
    const totalTax = cgst + sgst + igst

    // Calculate delivery fee
    let deliveryFee = 0
    if (subtotal > 0 && subtotal < restaurant.minimumOrderValue) {
      deliveryFee = restaurant.deliveryFee || 0
    }

    // Calculate discount from coupon
    let discount = 0
    let appliedCoupon = null
    
    if (appliedCouponCode) {
      try {
        const couponResponse = await fetch(`${process.env.NEXTAUTH_URL}/api/coupons/validate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': request.headers.get('Authorization') || ''
          },
          body: JSON.stringify({
            tenantId,
            restaurantId,
            code: appliedCouponCode,
            orderTotal: subtotal,
            userId: authResult.user.id
          })
        })

        if (couponResponse.ok) {
          const couponResult = await couponResponse.json()
          if (couponResult.success && couponResult.data.valid) {
            discount = couponResult.data.discount
            appliedCoupon = couponResult.data.coupon
          }
        }
      } catch (error) {
        console.error('Coupon validation error:', error)
        // Continue without coupon if validation fails
      }
    }

    // Calculate total with rounding adjustment
    const preRoundTotal = subtotal + totalTax + deliveryFee - discount
    const roundedTotal = Math.round(preRoundTotal * 100) / 100
    const roundingAdjustment = roundedTotal - preRoundTotal

    const calculation: CartCalculation = {
      subtotal: Math.round(subtotal * 100) / 100,
      tax: totalTax,
      deliveryFee: Math.round(deliveryFee * 100) / 100,
      discount: Math.round(discount * 100) / 100,
      total: Math.max(0, roundedTotal),
      gstBreakdown: {
        cgst,
        sgst,
        igst
      },
      roundingAdjustment: Math.round(roundingAdjustment * 100) / 100,
      itemCount
    }

    // Cache calculation for 5 minutes
    const cacheKey = `cart:calculation:${tenantId}:${authResult.user.id}:${restaurantId}:${appliedCouponCode || 'no-coupon'}`
    await redis.setex(cacheKey, 300, JSON.stringify(calculation))

    return NextResponse.json({
      success: true,
      data: {
        ...calculation,
        appliedCoupon,
        restaurant: {
          minimumOrderValue: restaurant.minimumOrderValue,
          taxRate: restaurant.taxRate,
          deliveryFee: restaurant.deliveryFee
        }
      }
    })

  } catch (error) {
    console.error('Calculate cart error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request data', details: error.errors } },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to calculate cart total' } },
      { status: 500 }
    )
  }
}