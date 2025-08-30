'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'

interface Category {
  id: string
  name: string
  description?: string
  image?: string
  sortOrder: number
  itemCount?: number
}

interface CategoryFilterProps {
  categories: Category[]
  selectedCategory: string | null
  onCategorySelect: (categoryId: string | null) => void
  itemCounts?: Record<string, number>
}

export function CategoryFilter({ 
  categories, 
  selectedCategory, 
  onCategorySelect,
  itemCounts = {}
}: CategoryFilterProps) {
  const sortedCategories = [...categories].sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg">Categories</h3>
      
      <div className="space-y-2">
        {/* All Items */}
        <Button
          variant={selectedCategory === null ? "default" : "ghost"}
          onClick={() => onCategorySelect(null)}
          className="w-full justify-between"
        >
          <span>All Items</span>
          <Badge variant="secondary">
            {Object.values(itemCounts).reduce((sum, count) => sum + count, 0)}
          </Badge>
        </Button>

        {/* Category List */}
        {sortedCategories.map((category) => {
          const count = itemCounts[category.id] || 0
          const isSelected = selectedCategory === category.id

          return (
            <Button
              key={category.id}
              variant={isSelected ? "default" : "ghost"}
              onClick={() => onCategorySelect(category.id)}
              className="w-full justify-between"
              disabled={count === 0}
            >
              <span className="truncate">{category.name}</span>
              <Badge variant={isSelected ? "secondary" : "outline"}>
                {count}
              </Badge>
            </Button>
          )
        })}
      </div>
    </div>
  )
}

interface CategoryTabsProps {
  categories: Category[]
  selectedCategory: string | null
  onCategorySelect: (categoryId: string | null) => void
  itemCounts?: Record<string, number>
}

export function CategoryTabs({ 
  categories, 
  selectedCategory, 
  onCategorySelect,
  itemCounts = {}
}: CategoryTabsProps) {
  const sortedCategories = [...categories].sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <ScrollArea className="w-full">
      <div className="flex gap-2 pb-2">
        {/* All Items Tab */}
        <Button
          variant={selectedCategory === null ? "default" : "outline"}
          onClick={() => onCategorySelect(null)}
          className="whitespace-nowrap"
        >
          All Items
          <Badge variant="secondary" className="ml-2">
            {Object.values(itemCounts).reduce((sum, count) => sum + count, 0)}
          </Badge>
        </Button>

        {/* Category Tabs */}
        {sortedCategories.map((category) => {
          const count = itemCounts[category.id] || 0
          const isSelected = selectedCategory === category.id

          return (
            <Button
              key={category.id}
              variant={isSelected ? "default" : "outline"}
              onClick={() => onCategorySelect(category.id)}
              className="whitespace-nowrap"
              disabled={count === 0}
            >
              {category.name}
              <Badge 
                variant={isSelected ? "secondary" : "outline"} 
                className="ml-2"
              >
                {count}
              </Badge>
            </Button>
          )
        })}
      </div>
    </ScrollArea>
  )
}