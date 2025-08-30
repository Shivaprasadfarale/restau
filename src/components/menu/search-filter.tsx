'use client'

import React, { useState, useEffect } from 'react'
import { Search, Filter, X, Leaf, Flame, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

export interface MenuFilters {
  dietary: string[]
  priceRange: [number, number] | null
  availability: boolean
  preparationTime: number | null
}

interface SearchFilterProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  filters: MenuFilters
  onFiltersChange: (filters: MenuFilters) => void
  priceRange?: [number, number]
  isLoading?: boolean
}

const DIETARY_OPTIONS = [
  { id: 'veg', label: 'Vegetarian', icon: Leaf, color: 'text-green-600' },
  { id: 'vegan', label: 'Vegan', icon: Leaf, color: 'text-green-600' },
  { id: 'glutenFree', label: 'Gluten Free', icon: Leaf, color: 'text-blue-600' },
  { id: 'spicy', label: 'Spicy', icon: Flame, color: 'text-red-600' },
  { id: 'noAllergens', label: 'No Common Allergens', icon: Leaf, color: 'text-purple-600' }
]

export function SearchFilter({
  searchQuery,
  onSearchChange,
  filters,
  onFiltersChange,
  priceRange = [0, 1000],
  isLoading = false
}: SearchFilterProps) {
  const [localQuery, setLocalQuery] = useState(searchQuery)
  const [isFilterOpen, setIsFilterOpen] = useState(false)

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearchChange(localQuery)
    }, 300)

    return () => clearTimeout(timer)
  }, [localQuery, onSearchChange])

  const handleDietaryChange = (dietaryId: string, checked: boolean) => {
    const newDietary = checked
      ? [...filters.dietary, dietaryId]
      : filters.dietary.filter(id => id !== dietaryId)
    
    onFiltersChange({
      ...filters,
      dietary: newDietary
    })
  }

  const handlePriceRangeChange = (value: number[]) => {
    onFiltersChange({
      ...filters,
      priceRange: [value[0], value[1]]
    })
  }

  const clearFilters = () => {
    onFiltersChange({
      dietary: [],
      priceRange: null,
      availability: true,
      preparationTime: null
    })
  }

  const getActiveFilterCount = () => {
    let count = 0
    if (filters.dietary.length > 0) count++
    if (filters.priceRange) count++
    if (!filters.availability) count++
    if (filters.preparationTime) count++
    return count
  }

  const activeFilterCount = getActiveFilterCount()

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          placeholder="Search menu items..."
          value={localQuery}
          onChange={(e) => setLocalQuery(e.target.value)}
          className="pl-10 pr-4"
          disabled={isLoading}
        />
        {localQuery && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setLocalQuery('')
              onSearchChange('')
            }}
            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Filter Button and Active Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Filters</h4>
                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    Clear All
                  </Button>
                )}
              </div>

              <Separator />

              {/* Dietary Preferences */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Dietary Preferences</Label>
                <div className="space-y-2">
                  {DIETARY_OPTIONS.map((option) => {
                    const Icon = option.icon
                    return (
                      <div key={option.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={option.id}
                          checked={filters.dietary.includes(option.id)}
                          onCheckedChange={(checked) => 
                            handleDietaryChange(option.id, checked as boolean)
                          }
                        />
                        <Label 
                          htmlFor={option.id} 
                          className="flex items-center gap-2 text-sm cursor-pointer"
                        >
                          <Icon className={`h-4 w-4 ${option.color}`} />
                          {option.label}
                        </Label>
                      </div>
                    )
                  })}
                </div>
              </div>

              <Separator />

              {/* Price Range */}
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Price Range
                </Label>
                <div className="px-2">
                  <Slider
                    value={filters.priceRange || priceRange}
                    onValueChange={handlePriceRangeChange}
                    max={priceRange[1]}
                    min={priceRange[0]}
                    step={10}
                    className="w-full"
                  />
                  <div className="flex justify-between text-sm text-muted-foreground mt-2">
                    <span>₹{filters.priceRange?.[0] || priceRange[0]}</span>
                    <span>₹{filters.priceRange?.[1] || priceRange[1]}</span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Availability */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="availability"
                  checked={filters.availability}
                  onCheckedChange={(checked) => 
                    onFiltersChange({
                      ...filters,
                      availability: checked as boolean
                    })
                  }
                />
                <Label htmlFor="availability" className="text-sm cursor-pointer">
                  Show only available items
                </Label>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Active Filter Badges */}
        {filters.dietary.map((dietaryId) => {
          const option = DIETARY_OPTIONS.find(opt => opt.id === dietaryId)
          if (!option) return null
          
          return (
            <Badge key={dietaryId} variant="secondary" className="gap-1">
              <option.icon className="h-3 w-3" />
              {option.label}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDietaryChange(dietaryId, false)}
                className="h-3 w-3 p-0 hover:bg-transparent"
              >
                <X className="h-2 w-2" />
              </Button>
            </Badge>
          )
        })}

        {filters.priceRange && (
          <Badge variant="secondary" className="gap-1">
            ₹{filters.priceRange[0]} - ₹{filters.priceRange[1]}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onFiltersChange({ ...filters, priceRange: null })}
              className="h-3 w-3 p-0 hover:bg-transparent"
            >
              <X className="h-2 w-2" />
            </Button>
          </Badge>
        )}

        {!filters.availability && (
          <Badge variant="secondary" className="gap-1">
            Including unavailable
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onFiltersChange({ ...filters, availability: true })}
              className="h-3 w-3 p-0 hover:bg-transparent"
            >
              <X className="h-2 w-2" />
            </Button>
          </Badge>
        )}
      </div>
    </div>
  )
}