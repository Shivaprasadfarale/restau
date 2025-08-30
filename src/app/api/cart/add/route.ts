import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth/middleware'
import { MenuItem } from '@/models/MenuItem'
import { Restaurant } from '@/models/Restaurant'
import { connectToDatabase } from '@/lib/mongodb'
import { getRedisClient } from '@/lib/redis'

const addToCartSchema = z.object({
  tenantId: z.string(),
  restaurantId: z.string(),
  menuItemId: z.string(),
  quantity: z.number().min(1).max(50),
  selectedModifiers: z.array(z.object({
    modifierId: z.string(),
    optionId: z.string(),
    name: z.string(),
    price: z.number().min(0)
  })).optional().default([]),
  specialInstructions: z.string().max(500).optional(),
  idempotencyKey: z.string().uuid()
})

async function addToCartHandler(
  request: NextRequest,
  context: { user: any; authContext: any }
) {
  try {
    const body = await request.json()
    const validatedData = addToCartSchema.parse(body)
    const { tenantId, restaurantId, menuItemId, quantity, selectedModifiers, specialInstructions, idempotencyKey } = validatedData

    // Verify tenant access
    if (context.user.tenantId !== tenantId) {
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

    // Get menu item and validate
    const menuItem = await MenuItem.findOne({
      _id: menuItemId,
      tenantId,
      restaurantId,
      availability: true,
      isDeleted: { $ne: true }
    })

    if (!menuItem) {
      const errorResponse = {
        success: false,
        error: { code: 'ITEM_NOT_FOUND', message: 'Menu item not found or unavailable' }
      }
      await redis.setex(`cart:idempotency:${idempotencyKey}`, 300, JSON.stringify(errorResponse))
      return NextResponse.json(errorResponse, { status: 404 })
    }

    // Get restaurant info for pricing calculation
    const restaurant = await Restaurant.findOne({
      _id: restaurantId,
      tenantId,
      isDeleted: { $ne: true }
    })

    if (!restaurant) {
      const errorResponse = {
        success: false,
        error: { code: 'RESTAURANT_NOT_FOUND', message: 'Restaurant not found' }
      }
      await redis.setex(`cart:idempotency:${idempotencyKey}`, 300, JSON.stringify(errorResponse))
      return NextResponse.json(errorResponse, { status: 404 })
    }

    // Validate modifiers
    let modifierPrice = 0
    const validatedModifiers = []

    for (const selectedMod of selectedModifiers) {
      const modifier = menuItem.modifiers.find(m => m.id === selectedMod.modifierId)
      if (!modifier) {
        const errorResponse = {
          success: false,
          error: { code: 'INVALID_MODIFIER', message: `Modifier ${selectedMod.modifierId} not found` }
        }
        await redis.setex(`cart:idempotency:${idempotencyKey}`, 300, JSON.stringify(errorResponse))
        return NextResponse.json(errorResponse, { status: 400 })
      }

      const option = modifier.options.find(o => o.id === selectedMod.optionId)
      if (!option) {
        const errorResponse = {
          success: false,
          error: { code: 'INVALID_MODIFIER_OPTION', message: `Modifier option ${selectedMod.optionId} not found` }
        }
        await redis.setex(`cart:idempotency:${idempotencyKey}`, 300, JSON.stringify(errorResponse))
        return NextResponse.json(errorResponse, { status: 400 })
      }

      // Server-side price validation
      if (Math.abs(option.price - selectedMod.price) > 0.01) {
        const errorResponse = {
          success: false,
          error: { code: 'PRICE_MISMATCH', message: 'Price validation failed. Please refresh and try again.' }
        }
        await redis.setex(`cart:idempotency:${idempotencyKey}`, 300, JSON.stringify(errorResponse))
        return NextResponse.json(errorResponse, { status: 400 })
      }

      modifierPrice += option.price
      validatedModifiers.push({
        modifierId: selectedMod.modifierId,
        optionId: selectedMod.optionId,
        name: option.name,
        price: option.price
      })
    }

    // Calculate total price with server-side validation
    const unitPrice = menuItem.price + modifierPrice
    const totalPrice = unitPrice * quantity

    // Create cart item
    const cartItem = {
      id: `${menuItemId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      menuItemId,
      menuItem: {
        id: menuItem._id.toString(),
        name: menuItem.name,
        description: menuItem.description,
        price: menuItem.price,
        image: menuItem.image,
        category: menuItem.category
      },
      quantity,
      selectedModifiers: validatedModifiers,
      specialInstructions,
      unitPrice,
      totalPrice,
      addedAt: new Date()
    }

    // Get existing cart from Redis with tenant isolation
    const cartKey = `cart:${tenantId}:${context.user.userId}:${restaurantId}`
    const existingCart = await redis.get(cartKey)
    let cart = existingCart ? JSON.parse(existingCart) : { items: [], restaurantId, tenantId }

    // Prevent cross-restaurant contamination
    if (cart.restaurantId !== restaurantId) {
      cart = { items: [], restaurantId, tenantId }
    }

    // Check if similar item exists (same item + modifiers)
    const existingItemIndex = cart.items.findIndex((item: any) => 
      item.menuItemId === menuItemId &&
      JSON.stringify(item.selectedModifiers.sort()) === JSON.stringify(validatedModifiers.sort())
    )

    if (existingItemIndex >= 0) {
      // Update existing item
      cart.items[existingItemIndex].quantity += quantity
      cart.items[existingItemIndex].totalPrice += totalPrice
    } else {
      // Add new item
      cart.items.push(cartItem)
    }

    // Update cart timestamp
    cart.updatedAt = new Date()

    // Save cart to Redis with 24-hour expiration
    await redis.setex(cartKey, 86400, JSON.stringify(cart))

    const successResponse = {
      success: true,
      data: {
        cartItem,
        cartItemCount: cart.items.reduce((sum: number, item: any) => sum + item.quantity, 0)
      }
    }

    // Cache idempotency result for 5 minutes
    await redis.setex(`cart:idempotency:${idempotencyKey}`, 300, JSON.stringify(successResponse))

    return NextResponse.json(successResponse)

  } catch (error) {
    console.error('Add to cart error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request data', details: error.errors } },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to add item to cart' } },
      { status: 500 }
    )
  }
}

export const POST = withAuth(addToCartHandler)