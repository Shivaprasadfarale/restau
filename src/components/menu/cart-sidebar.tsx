'use client'

import React, { useState } from 'react'
import { X, Plus, Minus, ShoppingCart, Trash2, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { CartItem, useMenu } from '@/lib/menu-context'

interface CartSidebarProps {
  isOpen: boolean
  onClose: () => void
  onCheckout: () => void
}

export function CartSidebar({ isOpen, onClose, onCheckout }: CartSidebarProps) {
  const { state, updateCartItem, removeFromCart, clearCart, validateCoupon, updateCartItemAPI, removeFromCartAPI, clearCartAPI } = useMenu()
  const [couponCode, setCouponCode] = useState('')
  const [couponLoading, setCouponLoading] = useState(false)
  const [couponMessage, setCouponMessage] = useState('')

  if (!isOpen) return null

  const { cartItems, cartTotal, restaurant } = state
  const isEmpty = cartItems.length === 0

  const handleQuantityChange = async (itemId: string, newQuantity: number) => {
    if (!restaurant) return

    try {
      if (newQuantity <= 0) {
        await removeFromCartAPI(restaurant.tenantId || '', restaurant.id, itemId)
      } else {
        await updateCartItemAPI(restaurant.tenantId || '', restaurant.id, itemId, newQuantity)
      }
    } catch (error) {
      console.error('Failed to update cart item:', error)
    }
  }

  const handleApplyCoupon = async () => {
    if (!couponCode.trim() || !restaurant) return

    setCouponLoading(true)
    setCouponMessage('')

    try {
      const result = await validateCoupon(couponCode.trim(), restaurant.id)
      if (result.valid) {
        setCouponMessage(`Coupon applied! You saved ₹${result.discount}`)
        setCouponCode('')
      } else {
        setCouponMessage(result.message || 'Invalid coupon code')
      }
    } catch (error) {
      setCouponMessage('Failed to apply coupon')
    } finally {
      setCouponLoading(false)
    }
  }

  const canCheckout = !isEmpty &&
    restaurant &&
    cartTotal.total >= restaurant.minimumOrderValue &&
    restaurant.isOpen

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="flex-1 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sidebar */}
      <div className="w-full max-w-md bg-background shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            <h2 className="font-semibold">Your Cart</h2>
            {cartTotal.itemCount > 0 && (
              <Badge variant="secondary">{cartTotal.itemCount}</Badge>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <ShoppingCart className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-2">Your cart is empty</h3>
              <p className="text-muted-foreground text-sm">
                Add some delicious items to get started!
              </p>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {/* Restaurant Status */}
              {restaurant && (
                <div className={`p-3 rounded-lg text-sm ${restaurant.isOpen
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
                  }`}>
                  {restaurant.isOpen ? (
                    <span>✓ Restaurant is open</span>
                  ) : (
                    <div>
                      <div>⚠ Restaurant is currently closed</div>
                      {restaurant.nextOpenTime && (
                        <div className="text-xs mt-1">
                          Opens at {restaurant.nextOpenTime.toLocaleTimeString()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Cart Items */}
              <div className="space-y-3">
                {cartItems.map((item: CartItem) => (
                  <CartItemCard
                    key={item.id}
                    item={item}
                    onQuantityChange={(quantity) => handleQuantityChange(item.id, quantity)}
                    onRemove={async () => {
                      if (restaurant) {
                        await removeFromCartAPI(restaurant.tenantId || '', restaurant.id, item.id)
                      }
                    }}
                  />
                ))}
              </div>

              {/* Coupon Section */}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter coupon code"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={handleApplyCoupon}
                    disabled={!couponCode.trim() || couponLoading}
                  >
                    <Tag className="h-4 w-4 mr-1" />
                    Apply
                  </Button>
                </div>
                {couponMessage && (
                  <p className={`text-sm ${couponMessage.includes('saved') ? 'text-green-600' : 'text-red-600'
                    }`}>
                    {couponMessage}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!isEmpty && (
          <div className="border-t p-4 space-y-4">
            {/* Order Summary */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>₹{cartTotal.subtotal}</span>
              </div>
              {cartTotal.tax > 0 && (
                <div className="flex justify-between">
                  <span>Tax & Fees</span>
                  <span>₹{cartTotal.tax}</span>
                </div>
              )}
              {cartTotal.deliveryFee > 0 && (
                <div className="flex justify-between">
                  <span>Delivery Fee</span>
                  <span>₹{cartTotal.deliveryFee}</span>
                </div>
              )}
              {cartTotal.discount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount</span>
                  <span>-₹{cartTotal.discount}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span>₹{cartTotal.total}</span>
              </div>
            </div>

            {/* Minimum Order Warning */}
            {restaurant && cartTotal.total < restaurant.minimumOrderValue && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-700">
                Minimum order value is ₹{restaurant.minimumOrderValue}.
                Add ₹{restaurant.minimumOrderValue - cartTotal.total} more to proceed.
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-2">
              <Button
                onClick={onCheckout}
                disabled={!canCheckout}
                className="w-full"
                size="lg"
              >
                {!restaurant?.isOpen
                  ? 'Restaurant Closed'
                  : cartTotal.total < (restaurant?.minimumOrderValue || 0)
                    ? `Add ₹${(restaurant?.minimumOrderValue || 0) - cartTotal.total} more`
                    : `Proceed to Checkout • ₹${cartTotal.total}`
                }
              </Button>

              <Button
                variant="outline"
                onClick={async () => {
                  if (restaurant) {
                    await clearCartAPI(restaurant.tenantId || '', restaurant.id)
                  }
                }}
                className="w-full"
              >
                Clear Cart
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface CartItemCardProps {
  item: CartItem
  onQuantityChange: (quantity: number) => void
  onRemove: () => void | Promise<void>
}

function CartItemCard({ item, onQuantityChange, onRemove }: CartItemCardProps) {
  const basePrice = item.menuItem.pricing?.totalPrice || item.menuItem.price
  const modifierPrice = item.selectedModifiers.reduce((sum: number, mod: any) => sum + mod.price, 0)
  const unitPrice = basePrice + modifierPrice

  return (
    <div className="bg-card border rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h4 className="font-medium text-sm">{item.menuItem.name}</h4>
          <p className="text-xs text-muted-foreground line-clamp-1">
            {item.menuItem.description}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {/* Modifiers */}
      {item.selectedModifiers.length > 0 && (
        <div className="text-xs text-muted-foreground">
          <div className="font-medium">Customizations:</div>
          <ul className="list-disc list-inside">
            {item.selectedModifiers.map((mod: any, index: number) => (
              <li key={index}>
                {mod.name} {mod.price > 0 && `(+₹${mod.price})`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Special Instructions */}
      {item.specialInstructions && (
        <div className="text-xs text-muted-foreground">
          <span className="font-medium">Note:</span> {item.specialInstructions}
        </div>
      )}

      {/* Quantity and Price */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => onQuantityChange(item.quantity - 1)}
            className="h-6 w-6"
          >
            <Minus className="h-3 w-3" />
          </Button>
          <span className="text-sm font-medium min-w-[1.5rem] text-center">
            {item.quantity}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onQuantityChange(item.quantity + 1)}
            className="h-6 w-6"
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>

        <div className="text-right">
          <div className="text-sm font-medium">₹{item.totalPrice}</div>
          <div className="text-xs text-muted-foreground">
            ₹{unitPrice} each
          </div>
        </div>
      </div>
    </div>
  )
}