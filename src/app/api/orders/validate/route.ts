import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { CartService } from '@/lib/services/cart-service'
import { connectToDatabase } from '@/lib/mongodb'
import { MenuItem } from '@/models/MenuItem'
import { Restaurant } from '@/models/Restaurant'

const validateOrderSchema = z.object({
  items: z.array(z.object({
    menuItemId: z.string(),
    quantity: z.number().min(1).max(50),
    selectedModifiers: z.array(z.object({
      modifierId: z.string(),
      optionId: z.string(),
      name: z.string(),
      price: z.number()
    })),
    totalPrice: z.number().min(0)
  })).min(1).max(20),
  restaurantId: z.string(),
  tenantId: z.string()
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validatedData = validateOrderSchema.parse(body)
    
    await connectToDatabase()

    // Check if restaurant is operational
    const restaurant = await Restaurant.findOne({
      _id: validatedData.restaurantId,
      tenantId: validatedData.tenantId,
      isDeleted: { $ne: true }
    })

    if (!restaurant) {
      return NextResponse.json({
        success: false,
        data: {
          valid: false,
          errors: ['Restaurant not found or not available']
        }
      })
    }

    // Check restaurant operating hours
    const now = new Date()
    const currentDay = now.toLocaleDateString('en-US', { weekday: 'lowercase' })
    const currentTime = now.toTimeString().slice(0, 5) // HH:MM format
    
    const todayHours = restaurant.operatingHours?.[currentDay]
    if (!todayHours?.isOpen) {
      return NextResponse.json({
        success: false,
        data: {
          valid: false,
          errors: ['Restaurant is currently closed']
        }
      })
    }

    if (currentTime < todayHours.open || currentTime > todayHours.close) {
      return NextResponse.json({
        success: false,
        data: {
          valid: false,
          errors: [`Restaurant is closed. Operating hours: ${todayHours.open} - ${todayHours.close}`]
        }
      })
    }

    const errors: string[] = []

    // Validate each item
    for (const item of validatedData.items) {
      const menuItem = await MenuItem.findOne({
        _id: item.menuItemId,
        tenantId: validatedData.tenantId,
        restaurantId: validatedData.restaurantId,
        isDeleted: { $ne: true }
      })

      if (!menuItem) {
        errors.push(`Menu item not found`)
        continue
      }

      if (!menuItem.availability) {
        errors.push(`${menuItem.name} is currently unavailable`)
        continue
      }

      // Validate modifiers
      for (const selectedMod of item.selectedModifiers) {
        const modifier = menuItem.modifiers.find((m: any) => m.id === selectedMod.modifierId)
        if (!modifier) {
          errors.push(`Invalid modifier for ${menuItem.name}`)
          continue
        }

        const option = modifier.options.find((o: any) => o.id === selectedMod.optionId)
        if (!option) {
          errors.push(`Invalid modifier option for ${menuItem.name}`)
          continue
        }

        // Check price consistency
        if (Math.abs(option.price - selectedMod.price) > 0.01) {
          errors.push(`Price mismatch for modifier in ${menuItem.name}`)
        }
      }

      // Validate total price calculation
      const expectedModifierPrice = item.selectedModifiers.reduce((sum, mod) => sum + mod.price, 0)
      const expectedUnitPrice = menuItem.price + expectedModifierPrice
      const expectedTotalPrice = expectedUnitPrice * item.quantity

      if (Math.abs(expectedTotalPrice - item.totalPrice) > 0.01) {
        errors.push(`Price calculation error for ${menuItem.name}`)
      }
    }

    // Calculate minimum order value
    const subtotal = validatedData.items.reduce((sum, item) => sum + item.totalPrice, 0)
    if (subtotal < restaurant.minimumOrderValue) {
      errors.push(`Minimum order value is ₹${restaurant.minimumOrderValue}. Current order: ₹${subtotal.toFixed(2)}`)
    }

    return NextResponse.json({
      success: true,
      data: {
        valid: errors.length === 0,
        errors,
        restaurantInfo: {
          name: restaurant.name,
          minimumOrderValue: restaurant.minimumOrderValue,
          deliveryFee: restaurant.deliveryFee,
          operatingHours: todayHours
        }
      }
    })

  } catch (error) {
    console.error('Order validation error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: error.errors
        }
      }, { status: 400 })
    }

    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to validate order'
      }
    }, { status: 500 })
  }
}