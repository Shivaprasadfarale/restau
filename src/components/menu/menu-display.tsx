'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { ShoppingCart, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useMenu, MenuItem, SelectedModifier } from '@/lib/menu-context'
import { MenuItemCard } from './menu-item-card'
import { CategoryFilter, CategoryTabs } from './category-filter'
import { SearchFilter } from './search-filter'
import { CartSidebar } from './cart-sidebar'

interface MenuDisplayProps {
  restaurantId: string
  layout?: 'grid' | 'list'
  showCategories?: boolean
  showSearch?: boolean
  showCart?: boolean
  onCheckout?: () => void
}

export function MenuDisplay({
  restaurantId,
  layout = 'grid',
  showCategories = true,
  showSearch = true,
  showCart = true,
  onCheckout
}: MenuDisplayProps) {
  const { 
    state, 
    loadCategories, 
    loadMenuItems, 
    loadRestaurantInfo,
    searchItems,
    addToCart,
    dispatch
  } = useMenu()

  const [showCartSidebar, setShowCartSidebar] = useState(false)
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 1000])

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      await Promise.all([
        loadCategories(restaurantId),
        loadMenuItems(restaurantId),
        loadRestaurantInfo(restaurantId)
      ])
    }
    
    loadData()
  }, [restaurantId])

  // Calculate price range from menu items
  useEffect(() => {
    if (state.menuItems.length > 0) {
      const prices = state.menuItems.map(item => item.pricing?.totalPrice || item.price)
      const min = Math.min(...prices)
      const max = Math.max(...prices)
      setPriceRange([Math.floor(min / 10) * 10, Math.ceil(max / 10) * 10])
    }
  }, [state.menuItems])

  // Filter and search logic
  const filteredItems = useMemo(() => {
    let items = [...state.menuItems]

    // Category filter
    if (state.selectedCategory) {
      items = items.filter(item => item.category === state.selectedCategory)
    }

    // Dietary filters
    if (state.filters.dietary.length > 0) {
      items = items.filter(item => {
        return state.filters.dietary.some(dietary => {
          switch (dietary) {
            case 'vegetarian':
              return item.dietaryInfo.isVeg
            case 'vegan':
              return item.dietaryInfo.isVegan
            case 'gluten-free':
              return item.dietaryInfo.isGlutenFree
            case 'dairy-free':
              return !item.dietaryInfo.allergens.some(allergen => 
                allergen.toLowerCase().includes('dairy') || 
                allergen.toLowerCase().includes('milk')
              )
            default:
              return false
          }
        })
      })
    }

    // Price range filter
    if (state.filters.priceRange) {
      items = items.filter(item => {
        const price = item.pricing?.totalPrice || item.price
        return price >= state.filters.priceRange![0] && price <= state.filters.priceRange![1]
      })
    }

    // Availability filter
    if (state.filters.availability) {
      items = items.filter(item => item.availability)
    }

    return items
  }, [state.menuItems, state.selectedCategory, state.filters])

  // Calculate item counts per category
  const itemCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: filteredItems.length
    }
    
    state.categories.forEach(category => {
      counts[category.id] = filteredItems.filter(item => item.category === category.id).length
    })
    
    return counts
  }, [filteredItems, state.categories])

  const handleCategorySelect = async (categoryId: string | null) => {
    dispatch({ type: 'SET_SELECTED_CATEGORY', payload: categoryId })
    if (categoryId) {
      await loadMenuItems(restaurantId, categoryId)
    } else {
      await loadMenuItems(restaurantId)
    }
  }

  const handleSearch = async (query: string) => {
    dispatch({ type: 'SET_SEARCH_QUERY', payload: query })
    await searchItems(query, restaurantId)
  }

  const handleFiltersChange = (newFilters: any) => {
    dispatch({ type: 'SET_FILTERS', payload: newFilters })
  }

  const handleAddToCart = (item: MenuItem, quantity: number, modifiers: SelectedModifier[] = [], instructions?: string) => {
    addToCart(item, quantity, modifiers, instructions)
  }

  const handleCheckout = () => {
    if (onCheckout) {
      onCheckout()
    } else {
      // Default checkout behavior - could navigate to checkout page
      console.log('Proceeding to checkout with items:', state.cartItems)
    }
  }

  if (state.isLoading && state.menuItems.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading menu...</p>
        </div>
      </div>
    )
  }

  if (state.error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-4" />
          <p className="text-destructive font-medium mb-2">Failed to load menu</p>
          <p className="text-muted-foreground text-sm">{state.error}</p>
          <Button 
            variant="outline" 
            onClick={() => loadMenuItems(restaurantId)}
            className="mt-4"
          >
            Try Again
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Restaurant Status */}
      {state.restaurant && (
        <div className={`p-4 rounded-lg border ${
          state.restaurant.isOpen 
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">{state.restaurant.name}</h2>
              <p className="text-sm">
                {state.restaurant.isOpen ? (
                  'Open now • Ready to serve you!'
                ) : (
                  <>
                    Currently closed
                    {state.restaurant.nextOpenTime && (
                      <> • Opens at {state.restaurant.nextOpenTime.toLocaleTimeString()}</>
                    )}
                  </>
                )}
              </p>
            </div>
            {showCart && (
              <Button
                variant="outline"
                onClick={() => setShowCartSidebar(true)}
                className="relative"
              >
                <ShoppingCart className="h-4 w-4 mr-2" />
                Cart
                {state.cartTotal.itemCount > 0 && (
                  <Badge 
                    variant="destructive" 
                    className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs"
                  >
                    {state.cartTotal.itemCount}
                  </Badge>
                )}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Search and Filters */}
      {showSearch && (
        <SearchFilter
          searchQuery={state.searchQuery}
          onSearchChange={(query) => dispatch({ type: 'SET_SEARCH_QUERY', payload: query })}
          onSearch={handleSearch}
          filters={state.filters}
          onFiltersChange={handleFiltersChange}
          priceRange={priceRange}
          isLoading={state.isLoading}
        />
      )}

      {/* Categories */}
      {showCategories && state.categories.length > 0 && (
        <div className="space-y-4">
          {/* Desktop Categories */}
          <div className="hidden md:block">
            <CategoryFilter
              categories={state.categories}
              selectedCategory={state.selectedCategory}
              onCategorySelect={handleCategorySelect}
              itemCounts={itemCounts}
            />
          </div>
          
          {/* Mobile Categories */}
          <div className="md:hidden">
            <CategoryTabs
              categories={state.categories}
              selectedCategory={state.selectedCategory}
              onCategorySelect={handleCategorySelect}
              itemCounts={itemCounts}
            />
          </div>
        </div>
      )}

      {/* Menu Items */}
      <div className="space-y-4">
        {/* Results Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">
              {state.selectedCategory 
                ? state.categories.find(c => c.id === state.selectedCategory)?.name || 'Category'
                : state.searchQuery 
                ? `Search results for "${state.searchQuery}"`
                : 'All Items'
              }
            </h3>
            <p className="text-sm text-muted-foreground">
              {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''} available
            </p>
          </div>
          
          {state.isLoading && (
            <Loader2 className="h-4 w-4 animate-spin" />
          )}
        </div>

        {/* Items Grid/List */}
        {filteredItems.length > 0 ? (
          <div className={
            layout === 'grid' 
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
              : 'space-y-4'
          }>
            {filteredItems.map((item) => (
              <MenuItemCard
                key={item.id}
                item={item}
                onAddToCart={handleAddToCart}
                isRestaurantOpen={state.restaurant?.isOpen || false}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-muted-foreground mb-4">
              <AlertCircle className="h-12 w-12 mx-auto mb-4" />
              <h3 className="font-medium mb-2">No items found</h3>
              <p className="text-sm">
                {state.searchQuery 
                  ? 'Try adjusting your search or filters'
                  : 'No items available in this category'
                }
              </p>
            </div>
            {(state.searchQuery || state.filters.dietary.length > 0 || state.filters.priceRange) && (
              <Button
                variant="outline"
                onClick={() => {
                  dispatch({ type: 'SET_SEARCH_QUERY', payload: '' })
                  handleFiltersChange({
                    dietary: [],
                    priceRange: null,
                    availability: true
                  })
                  loadMenuItems(restaurantId)
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Cart Sidebar */}
      {showCart && (
        <CartSidebar
          isOpen={showCartSidebar}
          onClose={() => setShowCartSidebar(false)}
          onCheckout={handleCheckout}
        />
      )}
    </div>
  )
}