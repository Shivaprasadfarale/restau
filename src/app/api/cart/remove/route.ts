import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyAuth } from '@/lib/auth/middleware'
import { getRedisClient } from '@/lib/redis'

const removeFromCartSchema = z.object({
  tenantId: z.string(),
  restaurantId: z.string(),
  cartItemId: z.string(),
  idempotencyKey: z.string().uuid()
})

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      )
    }

    const body = await request.json()
    const validatedData = removeFromCartSchema.parse(body)
    const { tenantId, restaurantId, cartItemId, idempotencyKey } = validatedData

    // Verify tenant access
    if (authResult.user.tenantId !== tenantId) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } },
        { status: 403 }
      )
    }

    const redis = await getRedisClient()

    // Check idempotency
    const idempotencyCheck = await redis.get(`cart:idempotency:${idempotencyKey}`)
    if (idempotencyCheck) {
      return NextResponse.json(JSON.parse(idempotencyCheck))
    }

    // Get cart from Redis with tenant isolation
    const cartKey = `cart:${tenantId}:${authResult.user.id}:${restaurantId}`
    const existingCart = await redis.get(cartKey)
    
    if (!existingCart) {
      const errorResponse = {
        success: false,
        error: { code: 'CART_NOT_FOUND', message: 'Cart not found' }
      }
      await redis.setex(`cart:idempotency:${idempotencyKey}`, 300, JSON.stringify(errorResponse))
      return NextResponse.json(errorResponse, { status: 404 })
    }

    const cart = JSON.parse(existingCart)

    // Find and remove cart item
    const itemIndex = cart.items.findIndex((item: any) => item.id === cartItemId)
    if (itemIndex === -1) {
      const errorResponse = {
        success: false,
        error: { code: 'ITEM_NOT_FOUND', message: 'Cart item not found' }
      }
      await redis.setex(`cart:idempotency:${idempotencyKey}`, 300, JSON.stringify(errorResponse))
      return NextResponse.json(errorResponse, { status: 404 })
    }

    // Remove item
    cart.items.splice(itemIndex, 1)
    cart.updatedAt = new Date()

    // Save updated cart
    await redis.setex(cartKey, 86400, JSON.stringify(cart))

    const successResponse = {
      success: true,
      data: {
        cartItemCount: cart.items.reduce((sum: number, item: any) => sum + item.quantity, 0)
      }
    }

    // Cache idempotency result for 5 minutes
    await redis.setex(`cart:idempotency:${idempotencyKey}`, 300, JSON.stringify(successResponse))

    return NextResponse.json(successResponse)

  } catch (error) {
    console.error('Remove from cart error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request data', details: error.errors } },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to remove item from cart' } },
      { status: 500 }
    )
  }
}