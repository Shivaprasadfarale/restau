import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth/middleware'
import { MenuItem } from '@/models/MenuItem'
import { connectToDatabase } from '@/lib/mongodb'
import { getRedisClient } from '@/lib/redis'

const updateCartSchema = z.object({
  tenantId: z.string(),
  restaurantId: z.string(),
  cartItemId: z.string(),
  quantity: z.number().min(0).max(50),
  idempotencyKey: z.string().uuid()
})

export async function PUT(request: NextRequest) {
  try {
    const authResult = await withAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      )
    }

    const body = await request.json()
    const validatedData = updateCartSchema.parse(body)
    const { tenantId, restaurantId, cartItemId, quantity, idempotencyKey } = validatedData

    // Verify tenant access
    if (authResult.user.tenantId !== tenantId) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } },
        { status: 403 }
      )
    }

    await connectToDatabase()
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

    // Find cart item
    const itemIndex = cart.items.findIndex((item: any) => item.id === cartItemId)
    if (itemIndex === -1) {
      const errorResponse = {
        success: false,
        error: { code: 'ITEM_NOT_FOUND', message: 'Cart item not found' }
      }
      await redis.setex(`cart:idempotency:${idempotencyKey}`, 300, JSON.stringify(errorResponse))
      return NextResponse.json(errorResponse, { status: 404 })
    }

    const cartItem = cart.items[itemIndex]

    if (quantity === 0) {
      // Remove item from cart
      cart.items.splice(itemIndex, 1)
    } else {
      // Validate menu item is still available
      const menuItem = await MenuItem.findOne({
        _id: cartItem.menuItemId,
        tenantId,
        restaurantId,
        availability: true,
        isDeleted: { $ne: true }
      })

      if (!menuItem) {
        const errorResponse = {
          success: false,
          error: { code: 'ITEM_UNAVAILABLE', message: 'Menu item is no longer available' }
        }
        await redis.setex(`cart:idempotency:${idempotencyKey}`, 300, JSON.stringify(errorResponse))
        return NextResponse.json(errorResponse, { status: 400 })
      }

      // Server-side price validation
      let modifierPrice = 0
      for (const modifier of cartItem.selectedModifiers) {
        const menuModifier = menuItem.modifiers.find((m: any) => m.id === modifier.modifierId)
        if (menuModifier) {
          const option = menuModifier.options.find((o: any) => o.id === modifier.optionId)
          if (option && Math.abs(option.price - modifier.price) > 0.01) {
            const errorResponse = {
              success: false,
              error: { code: 'PRICE_MISMATCH', message: 'Price validation failed. Please refresh and try again.' }
            }
            await redis.setex(`cart:idempotency:${idempotencyKey}`, 300, JSON.stringify(errorResponse))
            return NextResponse.json(errorResponse, { status: 400 })
          }
          modifierPrice += option.price
        }
      }

      // Update quantity and recalculate price
      const unitPrice = menuItem.price + modifierPrice
      cartItem.quantity = quantity
      cartItem.totalPrice = unitPrice * quantity
    }

    // Update cart timestamp
    cart.updatedAt = new Date()

    // Save updated cart
    await redis.setex(cartKey, 86400, JSON.stringify(cart))

    const successResponse = {
      success: true,
      data: {
        cartItemCount: cart.items.reduce((sum: number, item: any) => sum + item.quantity, 0),
        updatedItem: quantity > 0 ? cartItem : null
      }
    }

    // Cache idempotency result for 5 minutes
    await redis.setex(`cart:idempotency:${idempotencyKey}`, 300, JSON.stringify(successResponse))

    return NextResponse.json(successResponse)

  } catch (error) {
    console.error('Update cart error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request data', details: error.errors } },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update cart item' } },
      { status: 500 }
    )
  }
}