'use client'

import { useState } from 'react'
import { Plus, Minus, Star, Clock, Leaf, Flame } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useMenu, MenuItem as BaseMenuItem } from '@/lib/menu-context'
import { MenuItemImage } from '@/components/ui/optimized-image'
import { extractPublicIdFromUrl } from '@/lib/image-utils'

// ✅ Extend MenuItem to include dietaryInfo
interface MenuItem extends BaseMenuItem {
  dietaryInfo?: {
    isVeg?: boolean
    isVegan?: boolean
    isSpicy?: boolean
  }
}

interface MenuItemCardProps {
  item: MenuItem
  onItemClick?: (item: MenuItem) => void
}

export function MenuItemCard({ item, onItemClick }: MenuItemCardProps) {
  const { addToCart, addToCartAPI, state } = useMenu()
  const [quantity, setQuantity] = useState(0)
  const [isAdding, setIsAdding] = useState(false)

  const price = item.pricing?.totalPrice || item.price
  const hasModifiers = item.modifiers && item.modifiers.length > 0

  const handleAddToCart = async () => {
    if (hasModifiers) {
      onItemClick?.(item)
      return
    }

    if (!state.restaurant) return

    setIsAdding(true)
    try {
      const result = await addToCartAPI(
        state.restaurant._id || '',
        state.restaurant.id,
        item.id,
        1,
        []
      )
      
      if (result.success) {
        setQuantity(prev => prev + 1)
      } else {
        console.error('Failed to add to cart:', result.error)
      }
    } catch (error) {
      console.error('Error adding to cart:', error)
    } finally {
      setIsAdding(false)
    }
  }

  const handleQuantityChange = async (newQuantity: number) => {
    if (newQuantity < 0 || !state.restaurant) return
    
    if (newQuantity === 0) {
      setQuantity(0)
      return
    }

    const difference = newQuantity - quantity
    if (difference > 0) {
      try {
        const result = await addToCartAPI(
          state.restaurant._id || '',
          state.restaurant.id,
          item.id,
          difference,
          []
        )
        
        if (result.success) {
          setQuantity(newQuantity)
        } else {
          console.error('Failed to update cart:', result.error)
        }
      } catch (error) {
        console.error('Error updating cart:', error)
      }
    }
  }

  const getDietaryBadges = () => {
    const badges = []
    if (item.dietaryInfo?.isVeg)
      badges.push({ label: 'Veg', color: 'bg-green-100 text-green-700', icon: Leaf })
    if (item.dietaryInfo?.isVegan)
      badges.push({ label: 'Vegan', color: 'bg-green-100 text-green-700', icon: Leaf })
    if (item.dietaryInfo?.isSpicy)
      badges.push({ label: 'Spicy', color: 'bg-red-100 text-red-700', icon: Flame })
    return badges
  }

  return (
    <div className="bg-card border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
      {/* Image */}
      <div className="relative h-48 w-full">
        {item.image && extractPublicIdFromUrl(item.image) ? (
          <MenuItemImage
            publicId={extractPublicIdFromUrl(item.image)!}
            alt={item.name}
            className="w-full h-full"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        ) : (
          <div className="w-full h-full bg-gray-200 flex items-center justify-center">
            <span className="text-gray-400">No image</span>
          </div>
        )}

        {/* Badges */}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
          {item.badges?.map(badge => (
            <Badge key={badge} variant="secondary" className="text-xs">
              {badge}
            </Badge>
          ))}
        </div>

        {/* Availability overlay */}
        {!item.availability && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="text-white font-medium">Currently Unavailable</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Header */}
        <div className="flex justify-between items-start mb-2">
          <div className="flex-1">
            <h3 className="font-semibold text-lg line-clamp-1">{item.name}</h3>
            <p className="text-muted-foreground text-sm line-clamp-2 mt-1">
              {item.description}
            </p>
          </div>
        </div>

        {/* Dietary badges */}
        <div className="flex flex-wrap gap-1 mb-3">
          {getDietaryBadges().map(({ label, color, icon: Icon }) => (
            <div
              key={label}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${color}`}
            >
              <Icon className="h-3 w-3" />
              {label}
            </div>
          ))}
        </div>

        {/* Prep time and rating */}
        <div className="flex items-center gap-4 mb-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            <span>{item.preparationTime} min</span>
          </div>
          {item.rating && (
            <div className="flex items-center gap-1">
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              <span>{item.rating}</span>
            </div>
          )}
        </div>

        {/* Price and Add to Cart */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-lg font-bold">₹{price}</span>
            {item.pricing && (
              <span className="text-xs text-muted-foreground">
                +₹{item.pricing.gstAmount} tax
              </span>
            )}
          </div>

          {!item.availability ? (
            <Button disabled variant="outline">
              Unavailable
            </Button>
          ) : quantity === 0 ? (
            <Button
              onClick={handleAddToCart}
              disabled={isAdding}
              className="min-w-[100px]"
            >
              {isAdding ? 'Adding...' : hasModifiers ? 'Customize' : 'Add'}
              {!hasModifiers && <Plus className="h-4 w-4 ml-1" />}
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleQuantityChange(quantity - 1)}
                className="h-8 w-8"
              >
                <Minus className="h-3 w-3" />
              </Button>
              <span className="font-medium min-w-[2rem] text-center">
                {quantity}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleQuantityChange(quantity + 1)}
                className="h-8 w-8"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>

        {/* Modifiers indicator */}
        {hasModifiers && (
          <p className="text-xs text-muted-foreground mt-2">
            Customization available
          </p>
        )}
      </div>
    </div>
  )
}
