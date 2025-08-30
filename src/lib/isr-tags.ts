/**
 * ISR (Incremental Static Regeneration) tag utilities for Next.js
 * These tags are used for cache invalidation when data changes
 */

export const ISRTags = {
  // Menu-related tags
  menu: {
    categories: (tenantId: string, restaurantId: string) => 
      `menu-categories-${tenantId}-${restaurantId}`,
    items: (tenantId: string, restaurantId: string) => 
      `menu-items-${tenantId}-${restaurantId}`,
    item: (tenantId: string, restaurantId: string, itemId: string) => 
      `menu-item-${tenantId}-${restaurantId}-${itemId}`,
    categoryItems: (tenantId: string, restaurantId: string, categoryId: string) => 
      `menu-category-${tenantId}-${restaurantId}-${categoryId}`,
    search: (tenantId: string, restaurantId: string) => 
      `menu-search-${tenantId}-${restaurantId}`,
    availability: (tenantId: string, restaurantId: string) => 
      `menu-availability-${tenantId}-${restaurantId}`
  },
  
  // Restaurant-related tags
  restaurant: {
    info: (tenantId: string, restaurantId: string) => 
      `restaurant-${tenantId}-${restaurantId}`,
    settings: (tenantId: string, restaurantId: string) => 
      `restaurant-settings-${tenantId}-${restaurantId}`,
    hours: (tenantId: string, restaurantId: string) => 
      `restaurant-hours-${tenantId}-${restaurantId}`
  },
  
  // Order-related tags
  orders: {
    user: (tenantId: string, userId: string) => 
      `orders-user-${tenantId}-${userId}`,
    restaurant: (tenantId: string, restaurantId: string) => 
      `orders-restaurant-${tenantId}-${restaurantId}`,
    live: (tenantId: string, restaurantId: string) => 
      `orders-live-${tenantId}-${restaurantId}`
  },
  
  // User-related tags
  user: {
    profile: (tenantId: string, userId: string) => 
      `user-profile-${tenantId}-${userId}`,
    addresses: (tenantId: string, userId: string) => 
      `user-addresses-${tenantId}-${userId}`
  }
}

/**
 * Generate all menu-related tags for a restaurant
 */
export function getMenuTags(tenantId: string, restaurantId: string): string[] {
  return [
    ISRTags.menu.categories(tenantId, restaurantId),
    ISRTags.menu.items(tenantId, restaurantId),
    ISRTags.menu.search(tenantId, restaurantId),
    ISRTags.menu.availability(tenantId, restaurantId)
  ]
}

/**
 * Generate all restaurant-related tags
 */
export function getRestaurantTags(tenantId: string, restaurantId: string): string[] {
  return [
    ISRTags.restaurant.info(tenantId, restaurantId),
    ISRTags.restaurant.settings(tenantId, restaurantId),
    ISRTags.restaurant.hours(tenantId, restaurantId)
  ]
}

/**
 * Generate cache keys for Redis
 */
export const CacheKeys = {
  menu: {
    categories: (tenantId: string, restaurantId: string) => 
      `cache:menu:categories:${tenantId}:${restaurantId}`,
    items: (tenantId: string, restaurantId: string) => 
      `cache:menu:items:${tenantId}:${restaurantId}`,
    item: (tenantId: string, restaurantId: string, itemId: string) => 
      `cache:menu:item:${tenantId}:${restaurantId}:${itemId}`,
    search: (tenantId: string, restaurantId: string, query: string) => 
      `cache:menu:search:${tenantId}:${restaurantId}:${Buffer.from(query).toString('base64')}`,
    availability: (tenantId: string, restaurantId: string) => 
      `cache:menu:availability:${tenantId}:${restaurantId}`
  },
  
  session: {
    user: (userId: string, sessionId: string) => 
      `cache:session:${userId}:${sessionId}`,
    rateLimit: (key: string, identifier: string) => 
      `cache:ratelimit:${key}:${identifier}`
  }
}

/**
 * Cache TTL (Time To Live) constants in seconds
 */
export const CacheTTL = {
  menu: {
    categories: 1800, // 30 minutes
    items: 1800, // 30 minutes
    item: 3600, // 1 hour
    search: 600, // 10 minutes
    availability: 300 // 5 minutes
  },
  
  session: {
    user: 900, // 15 minutes
    rateLimit: 3600 // 1 hour
  },
  
  restaurant: {
    info: 3600, // 1 hour
    settings: 1800, // 30 minutes
    hours: 86400 // 24 hours
  }
}