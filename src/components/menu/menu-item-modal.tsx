'use client'

import React, { useState } from 'react'
import { X, Plus, Minus, Star, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useMenu, MenuItem, ModifierOption } from '@/lib/menu-context'
import Image from 'next/image'

interface MenuItemModalProps {
    item: MenuItem | null
    isOpen: boolean
    onClose: () => void
}

export function MenuItemModal({ item, isOpen, onClose }: MenuItemModalProps) {
    const { addToCart } = useMenu()
    const [quantity, setQuantity] = useState(1)
    const [selectedModifiers, setSelectedModifiers] = useState<ModifierOption[]>([])
    const [specialInstructions, setSpecialInstructions] = useState('')
    const [isAdding, setIsAdding] = useState(false)

    if (!isOpen || !item) return null

    const basePrice = item.pricing?.totalPrice || item.price
    const modifierPrice = selectedModifiers.reduce((sum, mod) => sum + mod.price, 0)
    const unitPrice = basePrice + modifierPrice
    const totalPrice = unitPrice * quantity

    const handleModifierChange = (modifier: any, option: ModifierOption, checked: boolean) => {
        setSelectedModifiers(prev => {
            if (modifier.type === 'radio') {
                const filtered = prev.filter(mod => !modifier.options.some((opt: any) => opt.id === mod.id))
                return checked ? [...filtered, option] : filtered
            } else {
                if (checked) {
                    const currentCount = prev.filter(mod =>
                        modifier.options.some((opt: any) => opt.id === mod.id)
                    ).length

                    if (modifier.maxSelections && currentCount >= modifier.maxSelections) {
                        return prev
                    }
                    return [...prev, option]
                } else {
                    return prev.filter(mod => mod.id !== option.id)
                }
            }
        })
    }

    const isModifierSelected = (option: ModifierOption) => {
        return selectedModifiers.some(mod => mod.id === option.id)
    }

    const canAddToCart = () => {
        return item.modifiers?.every(modifier => {
            if (!modifier.required) return true
            return selectedModifiers.some(selected =>
                modifier.options.some(option => option.id === selected.id)
            )
        }) ?? true
    }

    const handleAddToCart = async () => {
        if (!canAddToCart()) return

        setIsAdding(true)
        try {
            const cartItem = {
                id: `${item.id}-${Date.now()}`,
                menuItem: item,
                quantity,
                selectedModifiers,
                specialInstructions: specialInstructions.trim() || undefined,
                totalPrice
            }
            addToCart(cartItem)
            onClose()
            setQuantity(1)
            setSelectedModifiers([])
            setSpecialInstructions('')
        } catch (error) {
            console.error('Error adding to cart:', error)
        } finally {
            setIsAdding(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            <div className="relative bg-background rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden">
                <div className="relative">
                    <div className="relative h-64 w-full">
                        <Image
                            src={item.image}
                            alt={item.name}
                            fill
                            className="object-cover"
                            sizes="(max-width: 768px) 100vw, 50vw"
                        />
                        <div className="absolute top-4 right-4">
                            <Button
                                variant="secondary"
                                size="icon"
                                onClick={onClose}
                                className="rounded-full"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="p-6 overflow-y-auto max-h-[calc(90vh-16rem)]">
                    <div className="mb-6">
                        <div className="flex items-start justify-between mb-2">
                            <h2 className="text-2xl font-bold">{item.name}</h2>
                            <div className="flex items-center gap-2">
                                {item.badges?.map((badge) => (
                                    <Badge key={badge} variant="secondary">
                                        {badge}
                                    </Badge>
                                ))}
                            </div>
                        </div>

                        <p className="text-muted-foreground mb-4">{item.description}</p>

                        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
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

                        <div className="text-xl font-bold">₹{basePrice}</div>
                    </div>

                    {item.modifiers && item.modifiers.length > 0 && (
                        <div className="space-y-6 mb-6">
                            {item.modifiers.map((modifier) => (
                                <div key={modifier.id} className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-semibold">
                                            {modifier.name}
                                            {modifier.required && <span className="text-red-500 ml-1">*</span>}
                                        </h3>
                                        {modifier.maxSelections && modifier.maxSelections > 1 && (
                                            <span className="text-sm text-muted-foreground">
                                                Max {modifier.maxSelections}
                                            </span>
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        {modifier.options.map((option) => {
                                            const isSelected = isModifierSelected(option)
                                            const isDisabled = !!(
                                                !isSelected &&
                                                modifier.maxSelections &&
                                                selectedModifiers.filter(mod =>
                                                    modifier.options.some(opt => opt.id === mod.id)
                                                ).length >= modifier.maxSelections
                                            )

                                            return (
                                                <label
                                                    key={option.id}
                                                    className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${isSelected
                                                            ? 'border-primary bg-primary/5'
                                                            : isDisabled
                                                                ? 'border-muted bg-muted/50 cursor-not-allowed'
                                                                : 'border-border hover:border-primary/50'
                                                        }`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <input
                                                            type={modifier.type === 'radio' ? 'radio' : 'checkbox'}
                                                            name={modifier.type === 'radio' ? modifier.id : undefined}
                                                            checked={Boolean(isSelected)}
                                                            disabled={isDisabled}
                                                            onChange={(e) => handleModifierChange(modifier, option, e.target.checked)}
                                                            className="w-4 h-4"
                                                        />
                                                        <span className={isDisabled ? 'text-muted-foreground' : ''}>
                                                            {option.name}
                                                        </span>
                                                    </div>
                                                    {option.price > 0 && (
                                                        <span className={`font-medium ${isDisabled ? 'text-muted-foreground' : ''}`}>
                                                            +₹{option.price}
                                                        </span>
                                                    )}
                                                </label>
                                            )
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="space-y-2 mb-6">
                        <Label htmlFor="instructions">Special Instructions (Optional)</Label>
                        <Input
                            id="instructions"
                            placeholder="Any special requests..."
                            value={specialInstructions}
                            onChange={(e) => setSpecialInstructions(e.target.value)}
                            maxLength={200}
                        />
                        <p className="text-xs text-muted-foreground">
                            {specialInstructions.length}/200 characters
                        </p>
                    </div>

                    <Separator className="mb-6" />

                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <span className="font-medium">Quantity:</span>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                    className="h-8 w-8"
                                >
                                    <Minus className="h-3 w-3" />
                                </Button>
                                <span className="font-medium min-w-[2rem] text-center">{quantity}</span>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setQuantity(quantity + 1)}
                                    className="h-8 w-8"
                                >
                                    <Plus className="h-3 w-3" />
                                </Button>
                            </div>
                        </div>

                        <div className="text-right">
                            <div className="text-lg font-bold">₹{totalPrice}</div>
                            <div className="text-sm text-muted-foreground">
                                ₹{unitPrice} × {quantity}
                            </div>
                        </div>
                    </div>

                    <Button
                        onClick={handleAddToCart}
                        disabled={!canAddToCart() || isAdding}
                        className="w-full"
                        size="lg"
                    >
                        {isAdding ? 'Adding to Cart...' : `Add to Cart • ₹${totalPrice}`}
                    </Button>

                    {!canAddToCart() && (
                        <p className="text-sm text-red-500 text-center mt-2">
                            Please select all required options
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}
