import { MenuItem, Category, Restaurant } from '@/models'
import { connectToDatabase } from '@/lib/mongodb'
import { RedisService } from '@/lib/redis'
import crypto from 'crypto'

export interface MenuServiceOptions {
  tenantId: string
  restaurantId: string
  useCache?: boolean
  includeDrafts?: boolean
}

export interface MenuCacheKey {
  categories: string
  items: string
  itemsByCategory: (categoryId: string) => string
  search: (query: string) => string
}

class MenuService {
  constructor() {
    // Redis is handled by RedisService
  }

  private getCacheKeys(tenantId: string, restaurantId: string): MenuCacheKey {
    const prefix = `menu:${tenantId}:${restaurantId}`
    return {
      categories: `${prefix}:categories`,
      items: `${prefix}:items`,
      itemsByCategory: (categoryId: string) => `${prefix}:category:${categoryId}:items`,
      search: (query: string) => `${prefix}:search:${crypto.createHash('md5').update(query).digest('hex')}`
    }
  }

  private async getFromCache<T>(key: string): Promise<T | null> {
    try {
      const cached = await RedisService.get(key)
      return cached ? JSON.parse(cached) : null
    } catch (error) {
      console.error('Cache get error:', error)
      return null
    }
  }

  private async setCache(key: string, data: any, ttl: number = 3600): Promise<void> {
    try {
      await RedisService.set(key, JSON.stringify(data), ttl)
    } catch (error) {
      console.error('Cache set error:', error)
    }
  }

  private async invalidateCache(pattern: string): Promise<void> {
    try {
      await RedisService.invalidatePattern(pattern)
    } catch (error) {
      console.error('Cache invalidation error:', error)
    }
  }

  private generateETag(data: any): string {
    return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex')
  }

  /**
   * Get all categories for a restaurant
   */
  async getCategories(options: MenuServiceOptions): Promise<{
    data: any[]
    etag: string
    lastModified: Date
  }> {
    await connectToDatabase()

    const cacheKeys = this.getCacheKeys(options.tenantId, options.restaurantId)

    // Try cache first
    if (options.useCache !== false) {
      const cached = await this.getFromCache<any>(cacheKeys.categories)
      if (cached) {
        return cached
      }
    }

    // Fetch from database
    const categories = await (Category as any).findByRestaurant(options.tenantId, options.restaurantId)

    const result = {
      data: categories,
      etag: this.generateETag(categories),
      lastModified: new Date()
    }

    // Cache the result
    await this.setCache(cacheKeys.categories, result, 1800) // 30 minutes

    return result
  }

  /**
   * Get all menu items for a restaurant
   */
  async getMenuItems(options: MenuServiceOptions & {
    categoryId?: string
    includeUnavailable?: boolean
    includeModifiers?: boolean
  }): Promise<{
    data: any[]
    etag: string
    lastModified: Date
  }> {
    await connectToDatabase()

    const cacheKeys = this.getCacheKeys(options.tenantId, options.restaurantId)
    const cacheKey = options.categoryId
      ? cacheKeys.itemsByCategory(options.categoryId)
      : cacheKeys.items

    // Try cache first
    if (options.useCache !== false) {
      const cached = await this.getFromCache<any>(cacheKey)
      if (cached) {
        return cached
      }
    }

    // Build query
    const query: any = {
      tenantId: options.tenantId,
      restaurantId: options.restaurantId,
      isDeleted: { $ne: true }
    }

    if (options.categoryId) {
      query.category = options.categoryId
    }

    if (!options.includeUnavailable) {
      query.availability = true
    }

    // Fetch from database
    const items = await (MenuItem as any).find(query)
      .sort({ category: 1, name: 1 })
      .populate('restaurantId', 'name')
      .exec()

    const result = {
      data: items,
      etag: this.generateETag(items),
      lastModified: new Date()
    }

    // Cache the result
    await this.setCache(cacheKey, result, 1800) // 30 minutes

    return result
  }

  /**
   * Get a single menu item by ID
   */
  async getMenuItem(
    itemId: string,
    options: MenuServiceOptions
  ): Promise<any | null> {
    await connectToDatabase()

    const item = await (MenuItem as any).findOne({
      _id: itemId,
      tenantId: options.tenantId,
      restaurantId: options.restaurantId,
      isDeleted: { $ne: true }
    }).populate('restaurantId', 'name').exec()

    return item
  }

  /**
   * Search menu items
   */
  async searchItems(
    query: string,
    options: MenuServiceOptions & {
      limit?: number
      includeUnavailable?: boolean
    }
  ): Promise<{
    data: any[]
    etag: string
    lastModified: Date
  }> {
    await connectToDatabase()

    const cacheKeys = this.getCacheKeys(options.tenantId, options.restaurantId)
    const cacheKey = cacheKeys.search(query)

    // Try cache first
    if (options.useCache !== false) {
      const cached = await this.getFromCache<any>(cacheKey)
      if (cached) {
        return cached
      }
    }

    // Build search query
    const searchQuery: any = {
      tenantId: options.tenantId,
      restaurantId: options.restaurantId,
      isDeleted: { $ne: true },
      $text: { $search: query }
    }

    if (!options.includeUnavailable) {
      searchQuery.availability = true
    }

    // Fetch from database
    const items = await (MenuItem as any).find(searchQuery, {
      score: { $meta: 'textScore' }
    })
      .sort({ score: { $meta: 'textScore' } })
      .limit(options.limit || 20)
      .populate('restaurantId', 'name')
      .exec()

    const result = {
      data: items,
      etag: this.generateETag(items),
      lastModified: new Date()
    }

    // Cache the result (shorter TTL for search)
    await this.setCache(cacheKey, result, 600) // 10 minutes

    return result
  }

  /**
   * Check restaurant operating hours and availability
   */
  async checkRestaurantAvailability(options: MenuServiceOptions): Promise<{
    isOpen: boolean
    nextOpenTime?: Date
    operatingHours: any
  }> {
    await connectToDatabase()

    const restaurant = await (Restaurant as any).findOne({
      _id: options.restaurantId,
      tenantId: options.tenantId,
      isActive: true
    }).exec()

    if (!restaurant) {
      return {
        isOpen: false,
        operatingHours: null
      }
    }

    const isOpen = restaurant.isOpenNow()

    return {
      isOpen,
      operatingHours: restaurant.operatingHours,
      nextOpenTime: isOpen ? undefined : this.calculateNextOpenTime(restaurant.operatingHours)
    }
  }

  private calculateNextOpenTime(operatingHours: any): Date | undefined {
    const now = new Date()
    const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()

    // Check if restaurant opens later today
    const todayHours = operatingHours[currentDay]
    if (todayHours && todayHours.isOpen) {
      const [openHour, openMinute] = todayHours.open.split(':').map(Number)
      const openTime = new Date(now)
      openTime.setHours(openHour, openMinute, 0, 0)

      if (openTime > now) {
        return openTime
      }
    }

    // Check next 7 days
    for (let i = 1; i <= 7; i++) {
      const nextDate = new Date(now)
      nextDate.setDate(now.getDate() + i)
      const dayName = nextDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()

      const dayHours = operatingHours[dayName]
      if (dayHours && dayHours.isOpen) {
        const [openHour, openMinute] = dayHours.open.split(':').map(Number)
        nextDate.setHours(openHour, openMinute, 0, 0)
        return nextDate
      }
    }

    return undefined
  }

  /**
   * Get menu with pricing calculations including GST
   */
  async getMenuWithPricing(
    options: MenuServiceOptions & {
      categoryId?: string
      includeModifiers?: boolean
    }
  ): Promise<{
    data: any[]
    etag: string
    lastModified: Date
    restaurant: any
  }> {
    await connectToDatabase()

    // Get restaurant for tax calculations
    const restaurant = await (Restaurant as any).findOne({
      _id: options.restaurantId,
      tenantId: options.tenantId
    }).exec()

    if (!restaurant) {
      throw new Error('Restaurant not found')
    }

    // Get menu items
    const menuResult = await this.getMenuItems(options)

    // Calculate pricing with GST
    const itemsWithPricing = menuResult.data.map(item => {
      const basePrice = item.price
      const gstAmount = Math.round(basePrice * restaurant.taxRate)
      const totalPrice = basePrice + gstAmount

      return {
        ...item.toObject(),
        pricing: {
          basePrice,
          gstRate: restaurant.taxRate,
          gstAmount,
          totalPrice
        }
      }
    })

    return {
      data: itemsWithPricing,
      etag: this.generateETag({ items: itemsWithPricing, restaurant: restaurant._id }),
      lastModified: menuResult.lastModified,
      restaurant: {
        id: restaurant._id,
        name: restaurant.name,
        taxRate: restaurant.taxRate,
        deliveryFee: restaurant.deliveryFee,
        minimumOrderValue: restaurant.minimumOrderValue
      }
    }
  }

  /**
   * Update menu item with availability toggle and operating hours validation
   */
  async updateMenuItem(
    itemId: string,
    options: MenuServiceOptions & {
      updates: {
        availability?: boolean
        price?: number
        preparationTime?: number
      }
      updatedBy: string
    }
  ): Promise<any | null> {
    await connectToDatabase()

    // Validate operating hours if availability is being set to true
    if (options.updates.availability === true) {
      const restaurantAvailability = await this.checkRestaurantAvailability({
        tenantId: options.tenantId,
        restaurantId: options.restaurantId
      })

      // Log warning if making item available when restaurant is closed
      if (!restaurantAvailability.isOpen) {
        console.warn(`Item ${itemId} made available while restaurant is closed`)
      }
    }

    const updateData: any = {
      ...options.updates,
      lastModifiedAt: new Date(),
      updatedBy: options.updatedBy
    }

    const updatedItem = await (MenuItem as any).findOneAndUpdate(
      {
        _id: itemId,
        tenantId: options.tenantId,
        restaurantId: options.restaurantId,
        isDeleted: { $ne: true }
      },
      { $set: updateData },
      { new: true, runValidators: true }
    ).populate('restaurantId', 'name').exec()

    return updatedItem
  }

  /**
   * Calculate modifier pricing with GST compliance
   */
  calculateModifierPricing(
    modifiers: any[],
    selectedModifiers: any[],
    taxRate: number
  ): {
    modifierTotal: number
    modifierGst: number
    modifierTotalWithGst: number
    breakdown: any[]
  } {
    let modifierTotal = 0
    const breakdown: any[] = []

    selectedModifiers.forEach(selected => {
      const modifier = modifiers.find(m => m._id.toString() === selected.modifierId)
      if (modifier) {
        const option = modifier.options.find((opt: any) => opt._id.toString() === selected.optionId)
        if (option) {
          const basePrice = option.price
          const gstAmount = Math.round(basePrice * taxRate)
          const totalPrice = basePrice + gstAmount

          modifierTotal += basePrice
          breakdown.push({
            modifierId: selected.modifierId,
            optionId: selected.optionId,
            name: `${modifier.name} - ${option.name}`,
            basePrice,
            gstAmount,
            totalPrice
          })
        }
      }
    })

    const modifierGst = Math.round(modifierTotal * taxRate)
    const modifierTotalWithGst = modifierTotal + modifierGst

    return {
      modifierTotal,
      modifierGst,
      modifierTotalWithGst,
      breakdown
    }
  }

  /**
   * Validate item availability against restaurant operating hours
   */
  async validateItemAvailability(
    itemId: string,
    options: MenuServiceOptions,
    scheduledFor?: Date
  ): Promise<{
    isAvailable: boolean
    reason?: string
    availableAt?: Date
  }> {
    await connectToDatabase()

    // Get item
    const item = await this.getMenuItem(itemId, options)
    if (!item) {
      return {
        isAvailable: false,
        reason: 'Item not found'
      }
    }

    // Check if item is marked as available
    if (!item.availability) {
      return {
        isAvailable: false,
        reason: 'Item is currently unavailable'
      }
    }

    // Check restaurant availability
    const restaurantAvailability = await this.checkRestaurantAvailability(options)

    // If ordering for now, check current availability
    if (!scheduledFor) {
      if (!restaurantAvailability.isOpen) {
        return {
          isAvailable: false,
          reason: 'Restaurant is currently closed',
          availableAt: restaurantAvailability.nextOpenTime
        }
      }
    } else {
      // For scheduled orders, validate against future operating hours
      const scheduledDay = scheduledFor.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
      const scheduledTime = scheduledFor.toTimeString().slice(0, 5)

      const dayHours = restaurantAvailability.operatingHours[scheduledDay]
      if (!dayHours || !dayHours.isOpen || scheduledTime < dayHours.open || scheduledTime > dayHours.close) {
        return {
          isAvailable: false,
          reason: 'Restaurant is closed at the scheduled time'
        }
      }
    }

    return {
      isAvailable: true
    }
  }

  /**
   * Enhanced search with better caching and filtering
   */
  async searchItemsEnhanced(
    query: string,
    options: MenuServiceOptions & {
      limit?: number
      includeUnavailable?: boolean
      filters?: {
        category?: string
        dietaryInfo?: {
          isVeg?: boolean
          isVegan?: boolean
          isGlutenFree?: boolean
        }
        priceRange?: {
          min?: number
          max?: number
        }
        badges?: string[]
      }
    }
  ): Promise<{
    data: any[]
    etag: string
    lastModified: Date
    facets: {
      categories: { name: string; count: number }[]
      priceRanges: { range: string; count: number }[]
      dietaryOptions: { option: string; count: number }[]
    }
  }> {
    await connectToDatabase()

    const cacheKeys = this.getCacheKeys(options.tenantId, options.restaurantId)
    const filterHash = crypto.createHash('md5').update(JSON.stringify(options.filters || {})).digest('hex')
    const cacheKey = `${cacheKeys.search(query)}:${filterHash}`

    // Try cache first
    if (options.useCache !== false) {
      const cached = await this.getFromCache<any>(cacheKey)
      if (cached) {
        return cached
      }
    }

    // Build search query
    const searchQuery: any = {
      tenantId: options.tenantId,
      restaurantId: options.restaurantId,
      isDeleted: { $ne: true },
      $text: { $search: query }
    }

    if (!options.includeUnavailable) {
      searchQuery.availability = true
    }

    // Apply filters
    if (options.filters) {
      if (options.filters.category) {
        searchQuery.category = options.filters.category
      }

      if (options.filters.dietaryInfo) {
        if (options.filters.dietaryInfo.isVeg !== undefined) {
          searchQuery['dietaryInfo.isVeg'] = options.filters.dietaryInfo.isVeg
        }
        if (options.filters.dietaryInfo.isVegan !== undefined) {
          searchQuery['dietaryInfo.isVegan'] = options.filters.dietaryInfo.isVegan
        }
        if (options.filters.dietaryInfo.isGlutenFree !== undefined) {
          searchQuery['dietaryInfo.isGlutenFree'] = options.filters.dietaryInfo.isGlutenFree
        }
      }

      if (options.filters.priceRange) {
        const priceFilter: any = {}
        if (options.filters.priceRange.min !== undefined) {
          priceFilter.$gte = options.filters.priceRange.min
        }
        if (options.filters.priceRange.max !== undefined) {
          priceFilter.$lte = options.filters.priceRange.max
        }
        if (Object.keys(priceFilter).length > 0) {
          searchQuery.price = priceFilter
        }
      }

      if (options.filters.badges && options.filters.badges.length > 0) {
        searchQuery.badges = { $in: options.filters.badges }
      }
    }

    // Execute search with aggregation for facets
    const [items, facets] = await Promise.all([
      (MenuItem as any).find(searchQuery, {
        score: { $meta: 'textScore' }
      })
        .sort({ score: { $meta: 'textScore' } })
        .limit(options.limit || 20)
        .populate('restaurantId', 'name')
        .exec(),

      // Get facets for filtering
      (MenuItem as any).aggregate([
        { $match: { ...searchQuery, $text: undefined } }, // Remove text search for facets
        {
          $facet: {
            categories: [
              { $group: { _id: '$category', count: { $sum: 1 } } },
              { $project: { name: '$_id', count: 1, _id: 0 } },
              { $sort: { count: -1 } }
            ],
            priceRanges: [
              {
                $bucket: {
                  groupBy: '$price',
                  boundaries: [0, 100, 300, 500, 1000, 10000],
                  default: '1000+',
                  output: { count: { $sum: 1 } }
                }
              },
              {
                $project: {
                  range: {
                    $switch: {
                      branches: [
                        { case: { $eq: ['$_id', 0] }, then: '₹0-100' },
                        { case: { $eq: ['$_id', 100] }, then: '₹100-300' },
                        { case: { $eq: ['$_id', 300] }, then: '₹300-500' },
                        { case: { $eq: ['$_id', 500] }, then: '₹500-1000' },
                        { case: { $eq: ['$_id', 1000] }, then: '₹1000+' }
                      ],
                      default: '₹1000+'
                    }
                  },
                  count: 1,
                  _id: 0
                }
              }
            ],
            dietaryOptions: [
              {
                $project: {
                  options: [
                    { $cond: [{ $eq: ['$dietaryInfo.isVeg', true] }, 'Vegetarian', null] },
                    { $cond: [{ $eq: ['$dietaryInfo.isVegan', true] }, 'Vegan', null] },
                    { $cond: [{ $eq: ['$dietaryInfo.isGlutenFree', true] }, 'Gluten Free', null] }
                  ]
                }
              },
              { $unwind: '$options' },
              { $match: { options: { $ne: null } } },
              { $group: { _id: '$options', count: { $sum: 1 } } },
              { $project: { option: '$_id', count: 1, _id: 0 } }
            ]
          }
        }
      ])
    ])

    const result = {
      data: items,
      etag: this.generateETag({ items, facets }),
      lastModified: new Date(),
      facets: facets[0] || { categories: [], priceRanges: [], dietaryOptions: [] }
    }

    // Cache the result (shorter TTL for search)
    await this.setCache(cacheKey, result, 600) // 10 minutes

    return result
  }

  /**
   * Bulk update menu items with dry-run support
   */
  async bulkUpdateItems(options: {
    tenantId: string
    restaurantId: string
    itemIds: string[]
    action: 'enable' | 'disable' | 'update_price' | 'update_preparation_time'
    value?: boolean | number
    updatedBy: string
    dryRun?: boolean
  }): Promise<{
    success: number
    failed: number
    errors: any[]
    affectedItems: any[]
  }> {
    await connectToDatabase()

    const results = {
      success: 0,
      failed: 0,
      errors: [] as any[],
      affectedItems: [] as any[]
    }

    // Validate all items exist first
    const existingItems = await (MenuItem as any).find({
      _id: { $in: options.itemIds },
      tenantId: options.tenantId,
      restaurantId: options.restaurantId,
      isDeleted: { $ne: true }
    }).select('_id name availability price preparationTime').exec()

    const existingItemIds = existingItems.map((item: any) => item._id.toString())
    const missingItemIds = options.itemIds.filter(id => !existingItemIds.includes(id))

    if (missingItemIds.length > 0) {
      results.errors.push({
        type: 'ITEMS_NOT_FOUND',
        itemIds: missingItemIds,
        message: 'Some items were not found'
      })
      results.failed += missingItemIds.length
    }

    // Prepare update data based on action
    let updateData: any = {
      lastModifiedAt: new Date(),
      updatedBy: options.updatedBy
    }

    switch (options.action) {
      case 'enable':
        updateData.availability = true
        break
      case 'disable':
        updateData.availability = false
        break
      case 'update_price':
        if (typeof options.value !== 'number' || options.value < 0) {
          results.errors.push({
            type: 'INVALID_PRICE',
            message: 'Price must be a positive number'
          })
          return results
        }
        updateData.price = options.value
        break
      case 'update_preparation_time':
        if (typeof options.value !== 'number' || options.value < 1 || options.value > 180) {
          results.errors.push({
            type: 'INVALID_PREPARATION_TIME',
            message: 'Preparation time must be between 1 and 180 minutes'
          })
          return results
        }
        updateData.preparationTime = options.value
        break
    }

    // If dry run, just return what would be affected
    if (options.dryRun) {
      results.affectedItems = existingItems.map((item: any) => ({
        id: item._id,
        name: item.name,
        currentValue: item[options.action === 'enable' || options.action === 'disable' ? 'availability' :
          options.action === 'update_price' ? 'price' : 'preparationTime'],
        newValue: updateData[options.action === 'enable' || options.action === 'disable' ? 'availability' :
          options.action === 'update_price' ? 'price' : 'preparationTime']
      }))
      results.success = existingItems.length
      return results
    }

    // Perform actual update
    try {
      const updateResult = await (MenuItem as any).updateMany(
        {
          _id: { $in: existingItemIds },
          tenantId: options.tenantId,
          restaurantId: options.restaurantId,
          isDeleted: { $ne: true }
        },
        { $set: updateData },
        { runValidators: true }
      )

      results.success = updateResult.modifiedCount
      results.affectedItems = existingItems.map((item: any) => ({
        id: item._id,
        name: item.name,
        updated: true
      }))

      // Log the bulk operation for audit
      console.log(`Bulk ${options.action} operation by ${options.updatedBy}: ${results.success} items updated`)

    } catch (error: any) {
      console.error('Bulk update error:', error)
      results.errors.push({
        type: 'UPDATE_ERROR',
        message: error.message
      })
      results.failed = existingItems.length
    }

    return results
  }

  /**
   * Get menu pricing with GST breakdown for cart calculations
   */
  async calculateCartPricing(
    items: Array<{
      itemId: string
      quantity: number
      selectedModifiers: Array<{
        modifierId: string
        optionId: string
      }>
    }>,
    options: MenuServiceOptions
  ): Promise<{
    items: Array<{
      itemId: string
      name: string
      basePrice: number
      modifierPrice: number
      totalItemPrice: number
      gstAmount: number
      finalPrice: number
      quantity: number
      lineTotal: number
    }>
    subtotal: number
    totalGst: number
    grandTotal: number
    gstBreakdown: {
      cgst: number
      sgst: number
      igst: number
    }
  }> {
    await connectToDatabase()

    // Get restaurant for tax rate
    const restaurant = await (Restaurant as any).findOne({
      _id: options.restaurantId,
      tenantId: options.tenantId
    }).exec()

    if (!restaurant) {
      throw new Error('Restaurant not found')
    }

    const taxRate = restaurant.taxRate
    const itemIds = items.map(item => item.itemId)

    // Get all menu items
    const menuItems = await (MenuItem as any).find({
      _id: { $in: itemIds },
      tenantId: options.tenantId,
      restaurantId: options.restaurantId,
      availability: true,
      isDeleted: { $ne: true }
    }).exec()

    const pricedItems = []
    let subtotal = 0
    let totalGst = 0

    for (const cartItem of items) {
      const menuItem = menuItems.find((item: any) => item._id.toString() === cartItem.itemId)
      if (!menuItem) {
        throw new Error(`Menu item ${cartItem.itemId} not found or unavailable`)
      }

      // Calculate base price
      const basePrice = menuItem.price

      // Calculate modifier pricing
      const modifierPricing = this.calculateModifierPricing(
        menuItem.modifiers,
        cartItem.selectedModifiers,
        taxRate
      )

      const totalItemPrice = basePrice + modifierPricing.modifierTotal
      const gstAmount = Math.round(totalItemPrice * taxRate)
      const finalPrice = totalItemPrice + gstAmount
      const lineTotal = finalPrice * cartItem.quantity

      pricedItems.push({
        itemId: cartItem.itemId,
        name: menuItem.name,
        basePrice,
        modifierPrice: modifierPricing.modifierTotal,
        totalItemPrice,
        gstAmount,
        finalPrice,
        quantity: cartItem.quantity,
        lineTotal
      })

      subtotal += totalItemPrice * cartItem.quantity
      totalGst += gstAmount * cartItem.quantity
    }

    const grandTotal = subtotal + totalGst

    // Calculate GST breakdown (simplified - in reality this depends on state)
    const gstBreakdown = {
      cgst: Math.round(totalGst / 2), // Central GST
      sgst: Math.round(totalGst / 2), // State GST
      igst: 0 // Inter-state GST (would be totalGst if inter-state)
    }

    return {
      items: pricedItems,
      subtotal,
      totalGst,
      grandTotal,
      gstBreakdown
    }
  }

  /**
   * Invalidate menu cache when items are updated
   */
  async invalidateMenuCache(tenantId: string, restaurantId: string): Promise<void> {
    const pattern = `menu:${tenantId}:${restaurantId}:*`
    await this.invalidateCache(pattern)
  }

  /**
   * Get menu statistics
   */
  async getMenuStats(options: MenuServiceOptions): Promise<{
    totalItems: number
    availableItems: number
    categoriesCount: number
    lastUpdated: Date
  }> {
    await connectToDatabase()

    const [totalItems, availableItems, categories] = await Promise.all([
      (MenuItem as any).countDocuments({
        tenantId: options.tenantId,
        restaurantId: options.restaurantId,
        isDeleted: { $ne: true }
      }),
      (MenuItem as any).countDocuments({
        tenantId: options.tenantId,
        restaurantId: options.restaurantId,
        availability: true,
        isDeleted: { $ne: true }
      }),
      (Category as any).countDocuments({
        tenantId: options.tenantId,
        restaurantId: options.restaurantId,
        isActive: true,
        isDeleted: { $ne: true }
      })
    ])

    const lastUpdatedItem = await (MenuItem as any).findOne({
      tenantId: options.tenantId,
      restaurantId: options.restaurantId,
      isDeleted: { $ne: true }
    }).sort({ lastModifiedAt: -1 }).select('lastModifiedAt').exec()

    return {
      totalItems,
      availableItems,
      categoriesCount: categories,
      lastUpdated: lastUpdatedItem?.lastModifiedAt || new Date()
    }
  }
}

export const menuService = new MenuService()