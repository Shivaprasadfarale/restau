'use client'

import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react'
import { generateIdempotencyKey } from '@/lib/utils/uuid'
import { Restaurant as BaseRestaurant } from '@/types'

// Extended restaurant type with runtime status properties
export interface Restaurant extends BaseRestaurant {
  isOpen: boolean
  nextOpenTime?: Date
}

// Types
export interface MenuItem {
  id: string
  name: string
  description: string
  price: number
  image: string
  category: string
  modifiers: Modifier[]
  availability: boolean
  preparationTime: number
  tags: string[]
  badges: string[]
  rating?: ReactNode   // ✅ fixed (only once, covers JSX | string | number)
  pricing?: {
    basePrice: number
    gstRate: number
    gstAmount: number
    totalPrice: number
  }
}

export interface Modifier {
  id: string
  name: string
  type: 'radio' | 'checkbox' | 'select'
  options: ModifierOption[]
  required: boolean
  maxSelections?: number
}

export interface ModifierOption {
  id: string
  name: string
  price: number
}

export interface CartItem {
  id: string
  menuItem: MenuItem
  quantity: number
  selectedModifiers: ModifierOption[]
  specialInstructions?: string
  totalPrice: number
}



export interface CartTotal {
  gstBreakdown: any
  roundingAdjustment: undefined
  subtotal: number
  tax: number
  deliveryFee: number
  discount: number
  total: number
  itemCount: number
}

export interface MenuState {
  categories: any[]
  menuItems: MenuItem[]
  cartItems: CartItem[]
  restaurant: Restaurant | null
  cartTotal: CartTotal
  appliedCoupon: any | null
  loading: boolean
  error: string | null
  selectedCategory: string | null
  searchQuery: string
  filters: {
    dietary: string[]
    priceRange: [number, number] | null
    availability: boolean
    preparationTime: number | null
  }
}

// Actions
type MenuAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_CATEGORIES'; payload: any[] }
  | { type: 'SET_MENU_ITEMS'; payload: MenuItem[] }
  | { type: 'SET_RESTAURANT'; payload: Restaurant }
  | { type: 'ADD_TO_CART'; payload: CartItem }
  | { type: 'UPDATE_CART_ITEM'; payload: { id: string; updates: Partial<CartItem> } }
  | { type: 'REMOVE_FROM_CART'; payload: string }
  | { type: 'CLEAR_CART' }
  | { type: 'APPLY_COUPON'; payload: any }
  | { type: 'REMOVE_COUPON' }
  | { type: 'CALCULATE_TOTAL' }
  | { type: 'SET_SELECTED_CATEGORY'; payload: string | null }
  | { type: 'SET_SEARCH_QUERY'; payload: string }
  | { type: 'SET_FILTERS'; payload: any }
  | { type: 'SET_CART_ITEMS'; payload: CartItem[] }
  | { type: 'SET_CART_TOTAL'; payload: CartTotal }

// Initial state
const initialState: MenuState = {
  categories: [],
  menuItems: [],
  cartItems: [],
  restaurant: null,
  cartTotal: {
    subtotal: 0,
    tax: 0,
    deliveryFee: 0,
    discount: 0,
    total: 0,
    itemCount: 0
  },
  appliedCoupon: null,
  loading: false,
  error: null,
  selectedCategory: null,
  searchQuery: '',
  filters: {
    dietary: [],
    priceRange: null,
    availability: true,
    preparationTime: null
  }
}

// Reducer
function menuReducer(state: MenuState, action: MenuAction): MenuState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload }

    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false }

    case 'SET_CATEGORIES':
      return { ...state, categories: action.payload }

    case 'SET_MENU_ITEMS':
      return { ...state, menuItems: action.payload }

    case 'SET_RESTAURANT':
      return { ...state, restaurant: action.payload }

    case 'ADD_TO_CART': {
      const existingItemIndex = state.cartItems.findIndex(
        item => item.id === action.payload.id
      )

      let newCartItems: CartItem[]
      if (existingItemIndex >= 0) {
        // Update existing item
        newCartItems = [...state.cartItems]
        const existingItem = newCartItems[existingItemIndex]
        if (existingItem) {
          newCartItems[existingItemIndex] = {
            ...existingItem,
            quantity: existingItem.quantity + action.payload.quantity,
            totalPrice: existingItem.totalPrice + action.payload.totalPrice
          }
        }
      } else {
        // Add new item
        newCartItems = [...state.cartItems, action.payload]
      }

      return { ...state, cartItems: newCartItems }
    }

    case 'UPDATE_CART_ITEM': {
      const newCartItems = state.cartItems.map(item =>
        item.id === action.payload.id
          ? { ...item, ...action.payload.updates }
          : item
      )
      return { ...state, cartItems: newCartItems }
    }

    case 'REMOVE_FROM_CART': {
      const newCartItems = state.cartItems.filter(item => item.id !== action.payload)
      return { ...state, cartItems: newCartItems }
    }

    case 'CLEAR_CART':
      return { 
        ...state, 
        cartItems: [], 
        appliedCoupon: null,
        cartTotal: {
          subtotal: 0,
          tax: 0,
          deliveryFee: 0,
          discount: 0,
          total: 0,
          itemCount: 0
        }
      }

    case 'APPLY_COUPON':
      return { ...state, appliedCoupon: action.payload }

    case 'REMOVE_COUPON':
      return { ...state, appliedCoupon: null }

    case 'CALCULATE_TOTAL': {
      const subtotal = state.cartItems.reduce((sum, item) => sum + item.totalPrice, 0)
      const itemCount = state.cartItems.reduce((sum, item) => sum + item.quantity, 0)
      
      let tax = 0
      let deliveryFee = 0
      let discount = 0

      if (state.restaurant) {
        tax = Math.round(subtotal * state.restaurant.taxRate)
        deliveryFee = state.restaurant.deliveryFee
      }

      if (state.appliedCoupon) {
        discount = state.appliedCoupon.discount || 0
      }

      const total = subtotal + tax + deliveryFee - discount

      return {
        ...state,
        cartTotal: {
          subtotal,
          tax,
          deliveryFee,
          discount,
          total: Math.max(0, total),
          itemCount
        }
      }
    }

    case 'SET_SELECTED_CATEGORY':
      return { ...state, selectedCategory: action.payload }

    case 'SET_SEARCH_QUERY':
      return { ...state, searchQuery: action.payload }

    case 'SET_FILTERS':
      return { ...state, filters: action.payload }

    case 'SET_CART_ITEMS':
      return { ...state, cartItems: action.payload }

    case 'SET_CART_TOTAL':
      return { ...state, cartTotal: action.payload }

    default:
      return state
  }
}

// Context
const MenuContext = createContext<{
  state: MenuState
  dispatch: React.Dispatch<MenuAction>
  // Actions
  addToCart: (item: CartItem) => void
  updateCartItem: (id: string, updates: Partial<CartItem>) => void
  removeFromCart: (id: string) => void
  clearCart: () => void
  validateCoupon: (code: string, restaurantId: string) => Promise<{ valid: boolean; discount?: number; message?: string }>
  loadCategories: (tenantId: string, restaurantId: string) => Promise<void>
  loadMenuItems: (tenantId: string, restaurantId: string, categoryId?: string) => Promise<void>
  loadRestaurantInfo: (tenantId: string, restaurantId: string) => Promise<void>
  searchItems: (query: string, tenantId: string, restaurantId: string) => Promise<void>
  // New cart API methods
  addToCartAPI: (tenantId: string, restaurantId: string, menuItemId: string, quantity: number, selectedModifiers: any[], specialInstructions?: string) => Promise<{ success: boolean; error?: string }>
  updateCartItemAPI: (tenantId: string, restaurantId: string, cartItemId: string, quantity: number) => Promise<{ success: boolean; error?: string }>
  removeFromCartAPI: (tenantId: string, restaurantId: string, cartItemId: string) => Promise<{ success: boolean; error?: string }>
  clearCartAPI: (tenantId: string, restaurantId: string) => Promise<{ success: boolean; error?: string }>
  loadCartFromAPI: (tenantId: string, restaurantId: string) => Promise<void>
  calculateCartTotal: (tenantId: string, restaurantId: string, appliedCouponCode?: string) => Promise<void>
} | null>(null)

// Provider
export function MenuProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(menuReducer, initialState)

  // Calculate total whenever cart items, restaurant, or coupon changes
  useEffect(() => {
    dispatch({ type: 'CALCULATE_TOTAL' })
  }, [state.cartItems, state.restaurant, state.appliedCoupon])

  // Actions
  const addToCart = (item: CartItem) => {
    dispatch({ type: 'ADD_TO_CART', payload: item })
  }

  const updateCartItem = (id: string, updates: Partial<CartItem>) => {
    dispatch({ type: 'UPDATE_CART_ITEM', payload: { id, updates } })
  }

  const removeFromCart = (id: string) => {
    dispatch({ type: 'REMOVE_FROM_CART', payload: id })
  }

  const clearCart = () => {
    dispatch({ type: 'CLEAR_CART' })
  }

  const validateCoupon = async (code: string, restaurantId: string) => {
    try {
      // Get current user from auth context
      const userResponse = await fetch('/api/auth/me')
      const userResult = await userResponse.json()
      
      if (!userResult.success) {
        return { valid: false, message: 'Authentication required' }
      }

      const response = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          code, 
          restaurantId, 
          tenantId: userResult.data.tenantId,
          orderTotal: state.cartTotal.subtotal,
          userId: userResult.data.id,
          idempotencyKey: generateIdempotencyKey()
        }),
      })

      const result = await response.json()

      if (result.success && result.data.valid) {
        dispatch({ type: 'APPLY_COUPON', payload: result.data.coupon })
        return { valid: true, discount: result.data.discount, message: 'Coupon applied successfully' }
      } else {
        return { valid: false, message: result.data?.reason || 'Invalid coupon code' }
      }
    } catch (error) {
      return { valid: false, message: 'Failed to validate coupon' }
    }
  }

  const loadCategories = async (tenantId: string, restaurantId: string) => {
    dispatch({ type: 'SET_LOADING', payload: true })
    try {
      const response = await fetch(`/api/menu/categories?tenantId=${tenantId}&restaurantId=${restaurantId}`)
      const result = await response.json()
      
      if (result.success) {
        dispatch({ type: 'SET_CATEGORIES', payload: result.data })
      } else {
        dispatch({ type: 'SET_ERROR', payload: result.message })
      }
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to load categories' })
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false })
    }
  }

  const loadMenuItems = async (tenantId: string, restaurantId: string, categoryId?: string) => {
    dispatch({ type: 'SET_LOADING', payload: true })
    try {
      const params = new URLSearchParams({ tenantId, restaurantId })
      if (categoryId) params.append('categoryId', categoryId)
      
      const response = await fetch(`/api/menu/items?${params}`)
      const result = await response.json()
      
      if (result.success) {
        dispatch({ type: 'SET_MENU_ITEMS', payload: result.data })
      } else {
        dispatch({ type: 'SET_ERROR', payload: result.message })
      }
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to load menu items' })
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false })
    }
  }

  const loadRestaurantInfo = async (tenantId: string, restaurantId: string) => {
    try {
      const response = await fetch(`/api/restaurants/${restaurantId}?tenantId=${tenantId}`)
      const result = await response.json()
      
      if (result.success) {
        dispatch({ type: 'SET_RESTAURANT', payload: result.data })
      }
    } catch (error) {
      console.error('Failed to load restaurant info:', error)
    }
  }

  const searchItems = async (query: string, tenantId: string, restaurantId: string) => {
    if (!query.trim()) {
      loadMenuItems(tenantId, restaurantId)
      return
    }

    dispatch({ type: 'SET_LOADING', payload: true })
    try {
      const response = await fetch(`/api/menu/search?q=${encodeURIComponent(query)}&tenantId=${tenantId}&restaurantId=${restaurantId}`)
      const result = await response.json()
      
      if (result.success) {
        dispatch({ type: 'SET_MENU_ITEMS', payload: result.data })
      } else {
        dispatch({ type: 'SET_ERROR', payload: result.message })
      }
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to search items' })
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false })
    }
  }

  // New cart API methods
  const addToCartAPI = async (
    tenantId: string, 
    restaurantId: string, 
    menuItemId: string, 
    quantity: number, 
    selectedModifiers: any[], 
    specialInstructions?: string
  ) => {
    try {
      const response = await fetch('/api/cart/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenantId,
          restaurantId,
          menuItemId,
          quantity,
          selectedModifiers,
          specialInstructions,
          idempotencyKey: generateIdempotencyKey()
        }),
      })

      const result = await response.json()
      
      if (result.success) {
        // Reload cart from API to sync state
        await loadCartFromAPI(tenantId, restaurantId)
        return { success: true }
      } else {
        return { success: false, error: result.error?.message || 'Failed to add item to cart' }
      }
    } catch (error) {
      return { success: false, error: 'Failed to add item to cart' }
    }
  }

  const updateCartItemAPI = async (tenantId: string, restaurantId: string, cartItemId: string, quantity: number) => {
    try {
      const response = await fetch('/api/cart/update', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenantId,
          restaurantId,
          cartItemId,
          quantity,
          idempotencyKey: generateIdempotencyKey()
        }),
      })

      const result = await response.json()
      
      if (result.success) {
        // Reload cart from API to sync state
        await loadCartFromAPI(tenantId, restaurantId)
        return { success: true }
      } else {
        return { success: false, error: result.error?.message || 'Failed to update cart item' }
      }
    } catch (error) {
      return { success: false, error: 'Failed to update cart item' }
    }
  }

  const removeFromCartAPI = async (tenantId: string, restaurantId: string, cartItemId: string) => {
    try {
      const response = await fetch('/api/cart/remove', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenantId,
          restaurantId,
          cartItemId,
          idempotencyKey: generateIdempotencyKey()
        }),
      })

      const result = await response.json()
      
      if (result.success) {
        // Reload cart from API to sync state
        await loadCartFromAPI(tenantId, restaurantId)
        return { success: true }
      } else {
        return { success: false, error: result.error?.message || 'Failed to remove item from cart' }
      }
    } catch (error) {
      return { success: false, error: 'Failed to remove item from cart' }
    }
  }

  const clearCartAPI = async (tenantId: string, restaurantId: string) => {
    try {
      const response = await fetch('/api/cart/clear', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenantId,
          restaurantId,
          idempotencyKey: generateIdempotencyKey()
        }),
      })

      const result = await response.json()
      
      if (result.success) {
        // Clear local cart state
        dispatch({ type: 'CLEAR_CART' })
        return { success: true }
      } else {
        return { success: false, error: result.error?.message || 'Failed to clear cart' }
      }
    } catch (error) {
      return { success: false, error: 'Failed to clear cart' }
    }
  }

  const loadCartFromAPI = async (tenantId: string, restaurantId: string) => {
    try {
      const response = await fetch(`/api/cart/get?tenantId=${tenantId}&restaurantId=${restaurantId}`)
      const result = await response.json()
      
      if (result.success) {
        // Convert API cart items to local cart format
        const cartItems = result.data.items.map((item: any) => ({
          id: item.id,
          menuItem: item.menuItem,
          quantity: item.quantity,
          selectedModifiers: item.selectedModifiers,
          specialInstructions: item.specialInstructions,
          totalPrice: item.totalPrice
        }))
        
        // Update cart items in state
        dispatch({ type: 'SET_CART_ITEMS', payload: cartItems })
      }
    } catch (error) {
      console.error('Failed to load cart from API:', error)
    }
  }

  const calculateCartTotal = async (tenantId: string, restaurantId: string, appliedCouponCode?: string) => {
    try {
      const response = await fetch('/api/cart/calculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenantId,
          restaurantId,
          appliedCouponCode
        }),
      })

      const result = await response.json()
      
      if (result.success) {
        // Update cart total in state
        dispatch({ type: 'SET_CART_TOTAL', payload: result.data })
      }
    } catch (error) {
      console.error('Failed to calculate cart total:', error)
    }
  }

  return (
    <MenuContext.Provider
      value={{
        state,
        dispatch,
        addToCart,
        updateCartItem,
        removeFromCart,
        clearCart,
        validateCoupon,
        loadCategories,
        loadMenuItems,
        loadRestaurantInfo,
        searchItems,
        addToCartAPI,
        updateCartItemAPI,
        removeFromCartAPI,
        clearCartAPI,
        loadCartFromAPI,
        calculateCartTotal,
      }}
    >
      {children}
    </MenuContext.Provider>
  )
}

// Hook
export function useMenu() {
  const context = useContext(MenuContext)
  if (!context) {
    throw new Error('useMenu must be used within a MenuProvider')
  }
  return context
}
