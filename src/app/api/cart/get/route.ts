import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { getRedisClient } from '@/lib/redis'

export async function GET(request: NextRequest) {
  try {
    const authResult = await withAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const tenantId = searchParams.get('tenantId')
    const restaurantId = searchParams.get('restaurantId')

    if (!tenantId || !restaurantId) {
      return NextResponse.json(
        { success: false, error: { code: 'MISSING_PARAMS', message: 'tenantId and restaurantId are required' } },
        { status: 400 }
      )
    }

    // Verify tenant access
    if (authResult.user.tenantId !== tenantId) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } },
        { status: 403 }
      )
    }

    const redis = await getRedisClient()

    // Get cart from Redis with tenant isolation
    const cartKey = `cart:${tenantId}:${authResult.user.id}:${restaurantId}`
    const existingCart = await redis.get(cartKey)
    
    if (!existingCart) {
      return NextResponse.json({
        success: true,
        data: {
          items: [],
          restaurantId,
          tenantId,
          itemCount: 0,
          updatedAt: null
        }
      })
    }

    const cart = JSON.parse(existingCart)

    // Prevent cross-restaurant contamination
    if (cart.restaurantId !== restaurantId) {
      return NextResponse.json({
        success: true,
        data: {
          items: [],
          restaurantId,
          tenantId,
          itemCount: 0,
          updatedAt: null
        }
      })
    }

    const itemCount = cart.items.reduce((sum: number, item: any) => sum + item.quantity, 0)

    return NextResponse.json({
      success: true,
      data: {
        items: cart.items,
        restaurantId: cart.restaurantId,
        tenantId: cart.tenantId,
        itemCount,
        updatedAt: cart.updatedAt
      }
    })

  } catch (error) {
    console.error('Get cart error:', error)

    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get cart' } },
      { status: 500 }
    )
  }
}