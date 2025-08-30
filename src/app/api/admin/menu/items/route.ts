import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { MenuItem } from '@/models/MenuItem'
import { Category } from '@/models/Category'
import { connectToDatabase } from '@/lib/mongodb'
import { withAuth } from '@/lib/auth/admin-middleware'
import { auditLogger } from '@/lib/audit-logger'
import { menuService } from '@/lib/services/menu-service'

// Validation schemas
const createMenuItemSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(1000),
  price: z.number().min(0).max(100000),
  category: z.string().min(1).max(100),
  image: z.string().url().optional(),
  modifiers: z.array(z.object({
    name: z.string().min(1).max(100),
    type: z.enum(['radio', 'checkbox', 'select']),
    required: z.boolean().default(false),
    maxSelections: z.number().min(1).max(20).optional(),
    options: z.array(z.object({
      name: z.string().min(1).max(100),
      price: z.number().min(0).max(100000)
    })).min(1)
  })).default([]),
  preparationTime: z.number().min(1).max(180),
  tags: z.array(z.string().max(50)).default([]),
  dietaryInfo: z.object({
    isVeg: z.boolean().default(false),
    isVegan: z.boolean().default(false),
    isGlutenFree: z.boolean().default(false),
    allergens: z.array(z.string().max(50)).default([])
  }),
  badges: z.array(z.enum(['bestseller', 'new', 'spicy', 'chef-special', 'healthy'])).default([]),
  availability: z.boolean().default(true),
  nutritionalInfo: z.object({
    calories: z.number().min(0).optional(),
    protein: z.number().min(0).optional(),
    carbs: z.number().min(0).optional(),
    fat: z.number().min(0).optional(),
    fiber: z.number().min(0).optional(),
    sugar: z.number().min(0).optional()
  }).optional()
})

const querySchema = z.object({
  page: z.string().transform(val => parseInt(val) || 1),
  limit: z.string().transform(val => Math.min(parseInt(val) || 20, 100)),
  category: z.string().optional(),
  availability: z.string().transform(val => val === 'true' ? true : val === 'false' ? false : undefined).optional(),
  search: z.string().optional(),
  sortBy: z.enum(['name', 'price', 'category', 'createdAt', 'lastModifiedAt']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc')
})

// GET - List menu items with pagination and filtering
export const GET = withAuth(async (request: NextRequest, { authContext }) => {
  try {
    const { searchParams } = new URL(request.url)
    const queryParams = Object.fromEntries(searchParams.entries())
    const { page, limit, category, availability, search, sortBy, sortOrder } = querySchema.parse(queryParams)

    await connectToDatabase()

    // Build query
    const query: any = {
      tenantId: authContext.tenantId,
      restaurantId: authContext.tenantId,
      isDeleted: { $ne: true }
    }

    if (category) {
      query.category = category
    }

    if (availability !== undefined) {
      query.availability = availability
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ]
    }

    // Calculate pagination
    const skip = (page - 1) * limit

    // Build sort object
    const sort: any = {}
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1

    // Execute query with pagination
    const [items, totalCount] = await Promise.all([
      MenuItem.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('restaurantId', 'name')
        .exec(),
      MenuItem.countDocuments(query)
    ])

    const totalPages = Math.ceil(totalCount / limit)

    return NextResponse.json({
      success: true,
      data: {
        items,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      }
    })

  } catch (error: any) {
    console.error('Get admin menu items error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: error.issues
        }
      }, { status: 400 })
    }

    return NextResponse.json({
      success: false,
      error: {
        code: 'MENU_ITEMS_ERROR',
        message: 'Failed to fetch menu items'
      }
    }, { status: 500 })
  }
}, {
  requiredPermissions: ['menu:manage'],
  rateLimitKey: 'admin-menu-items',
  rateLimitMax: 100,
  rateLimitWindow: 3600
})

// POST - Create new menu item
export const POST = withAuth(async (request: NextRequest, { authContext }) => {
  try {
    const body = await request.json()
    const validatedData = createMenuItemSchema.parse(body)

    await connectToDatabase()

    // Verify category exists
    const categoryExists = await Category.findOne({
      tenantId: authContext.tenantId,
      restaurantId: authContext.tenantId,
      name: validatedData.category,
      isActive: true,
      isDeleted: { $ne: true }
    })

    if (!categoryExists) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'CATEGORY_NOT_FOUND',
          message: 'Category does not exist'
        }
      }, { status: 400 })
    }

    // Create menu item
    const menuItem = new MenuItem({
      ...validatedData,
      tenantId: authContext.tenantId,
      restaurantId: authContext.tenantId,
      createdBy: authContext.userId,
      updatedBy: authContext.userId,
      lastModifiedAt: new Date()
    })

    await menuItem.save()

    // Log audit event
    await auditLogger.log({
      tenantId: authContext.tenantId,
      userId: authContext.userId,
      action: 'menu_item_created',
      resourceType: 'menu_item',
      resourceId: menuItem._id.toString(),
      details: {
        name: menuItem.name,
        category: menuItem.category,
        price: menuItem.price
      }
    })

    // Invalidate menu cache
    await menuService.invalidateMenuCache(authContext.tenantId, authContext.tenantId)

    return NextResponse.json({
      success: true,
      data: {
        item: menuItem,
        message: 'Menu item created successfully'
      }
    }, { status: 201 })

  } catch (error: any) {
    console.error('Create menu item error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid menu item data',
          details: error.issues
        }
      }, { status: 400 })
    }

    if (error.code === 11000) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'DUPLICATE_ITEM',
          message: 'Menu item with this name already exists'
        }
      }, { status: 409 })
    }

    return NextResponse.json({
      success: false,
      error: {
        code: 'CREATE_ERROR',
        message: 'Failed to create menu item'
      }
    }, { status: 500 })
  }
}, {
  requiredPermissions: ['menu:manage'],
  rateLimitKey: 'admin-menu-create',
  rateLimitMax: 20,
  rateLimitWindow: 3600
})