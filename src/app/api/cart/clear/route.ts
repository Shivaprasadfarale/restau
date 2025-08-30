import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth/middleware'
import { getRedisClient } from '@/lib/redis'

const clearCartSchema = z.object({
  tenantId: z.string(),
  restaurantId: z.string(),
  idempotencyKey: z.string().uuid()
})

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await withAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      )
    }

    const body = await request.json()
    const validatedData = clearCartSchema.parse(body)
    const { tenantId, restaurantId, idempotencyKey } = validatedData

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

    // Clear cart from Redis with tenant isolation
    const cartKey = `cart:${tenantId}:${authResult.user.id}:${restaurantId}`
    await redis.del(cartKey)

    const successResponse = {
      success: true,
      data: {
        message: 'Cart cleared successfully',
        cartItemCount: 0
      }
    }

    // Cache idempotency result for 5 minutes
    await redis.setex(`cart:idempotency:${idempotencyKey}`, 300, JSON.stringify(successResponse))

    return NextResponse.json(successResponse)

  } catch (error) {
    console.error('Clear cart error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request data', details: error.errors } },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to clear cart' } },
      { status: 500 }
    )
  }
}