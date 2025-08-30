import { getRedisClient } from '@/lib/redis'
import { MenuItem } from '@/models/MenuItem'
import { Restaurant } from '@/models/Restaurant'
import { Coupon } from '@/models/Coupon'
import { connectToDatabase } from '@/lib/mongodb'

export interface CartItem {
  id: string
  menuItemId: string
  menuItem: {
    id: string
    name: string
    description: string
    price: number
    image: string
    category: string
  }
  quantity: number
  selectedModifiers: Array<{
    modifierId: string
    optionId: string
    name: string
    price: number
  }>
  specialInstructions?: string
  unitPrice: number
  totalPrice: number
  addedAt: Date
}

export interface CartTotal {
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

export class CartService {
  private static getCartKey(tenantId: string, userId: string, restaurantId: string): string {
    return `cart:${tenantId}:${userId}:${restaurantId}`
  }

  static async getCart(tenantId: string, userId: string, restaurantId: string) {
    const redis = await getRedisClient()
    const cartKey = this.getCartKey(tenantId, userId, restaurantId)
    const existingCart = await redis.get(cartKey)
    
    if (!existingCart) {
      return { items: [], restaurantId, tenantId, itemCount: 0, updatedAt: null }
    }

    const cart = JSON.parse(existingCart)
    
    // Prevent cross-restaurant contamination
    if (cart.restaurantId !== restaurantId) {
      return { items: [], restaurantId, tenantId, itemCount: 0, updatedAt: null }
    }

    const itemCount = cart.items.reduce((sum: number, item: CartItem) => sum + item.quantity, 0)
    
    return {
      items: cart.items,
      restaurantId: cart.restaurantId,
      tenantId: cart.tenantId,
      itemCount,
      updatedAt: cart.updatedAt
    }
  }

  static async saveCart(tenantId: string, userId: string, restaurantId: string, items: CartItem[]) {
    const redis = await getRedisClient()
    const cartKey = this.getCartKey(tenantId, userId, restaurantId)
    
    const cart = {
      items,
      restaurantId,
      tenantId,
      updatedAt: new Date()
    }

    // Save cart with 24-hour expiration
    await redis.setex(cartKey, 86400, JSON.stringify(cart))
    
    return cart
  }

  static async clearCart(tenantId: string, userId: string, restaurantId: string) {
    const redis = await getRedisClient()
    const cartKey = this.getCartKey(tenantId, userId, restaurantId)
    await redis.del(cartKey)
  }

  static async validateCartPrices(tenantId: string, restaurantId: string, items: CartItem[]): Promise<{ valid: boolean; errors: string[] }> {
    await connectToDatabase()
    const errors: string[] = []

    for (const item of items) {
      const menuItem = await MenuItem.findOne({
        _id: item.menuItemId,
        tenantId,
        restaurantId,
        availability: true,
        isDeleted: { $ne: true }
      })

      if (!menuItem) {
        errors.push(`Menu item ${item.menuItem.name} is no longer available`)
        continue
      }

      // Validate base price
      if (Math.abs(menuItem.price - item.menuItem.price) > 0.01) {
        errors.push(`Price mismatch for ${item.menuItem.name}`)
        continue
      }

      // Validate modifier prices
      let expectedModifierPrice = 0
      for (const selectedMod of item.selectedModifiers) {
        const modifier = menuItem.modifiers.find((m: any) => m.id === selectedMod.modifierId)
        if (!modifier) {
          errors.push(`Modifier ${selectedMod.name} not found for ${item.menuItem.name}`)
          continue
        }

        const option = modifier.options.find((o: any) => o.id === selectedMod.optionId)
        if (!option) {
          errors.push(`Modifier option ${selectedMod.name} not found`)
          continue
        }

        if (Math.abs(option.price - selectedMod.price) > 0.01) {
          errors.push(`Modifier price mismatch for ${selectedMod.name}`)
          continue
        }

        expectedModifierPrice += option.price
      }

      // Validate total price calculation
      const expectedUnitPrice = menuItem.price + expectedModifierPrice
      const expectedTotalPrice = expectedUnitPrice * item.quantity

      if (Math.abs(expectedTotalPrice - item.totalPrice) > 0.01) {
        errors.push(`Total price mismatch for ${item.menuItem.name}`)
      }
    }

    return { valid: errors.length === 0, errors }
  }

  static async calculateCartTotal(
    tenantId: string, 
    restaurantId: string, 
    items: CartItem[], 
    appliedCouponCode?: string,
    userId?: string
  ): Promise<CartTotal> {
    await connectToDatabase()

    // Calculate subtotal
    const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0)
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0)

    // Get restaurant info
    const restaurant = await Restaurant.findOne({
      _id: restaurantId,
      tenantId,
      isDeleted: { $ne: true }
    })

    if (!restaurant) {
      throw new Error('Restaurant not found')
    }

    // Calculate GST with proper rounding rules
    const taxRate = restaurant.taxRate || 0.05 // Default 5% GST
    const taxAmount = subtotal * taxRate
    
    // GST breakdown (CGST + SGST for intrastate)
    const cgst = Math.round((taxAmount / 2) * 100) / 100
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
    if (appliedCouponCode && userId) {
      const coupon = await Coupon.findByCode(tenantId, restaurantId, appliedCouponCode)
      if (coupon) {
        const validation = coupon.isValid(subtotal)
        if (validation.valid) {
          discount = coupon.calculateDiscount(subtotal)
        }
      }
    }

    // Calculate total with rounding adjustment
    const preRoundTotal = subtotal + totalTax + deliveryFee - discount
    const roundedTotal = Math.round(preRoundTotal * 100) / 100
    const roundingAdjustment = roundedTotal - preRoundTotal

    return {
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
  }
}
