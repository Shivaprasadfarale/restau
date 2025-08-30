import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Category } from '@/models/Category'
import { connectToDatabase } from '@/lib/mongodb'
import { withAuth } from '@/lib/auth/admin-middleware'
import { auditLogger } from '@/lib/audit-logger'
import { menuService } from '@/lib/services/menu-service'

const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  image: z.string().url().optional(),
  sortOrder: z.number().min(0).max(1000).default(0),
  isActive: z.boolean().default(true)
})

const reorderCategoriesSchema = z.object({
  categoryIds: z.array(z.string()).min(1)
})

// GET - List categories
export const GET = withAuth(async (request: NextRequest, { authContext }) => {
  try {
    await connectToDatabase()

    const categories = await Category.find({
      tenantId: authContext.tenantId,
      restaurantId: authContext.tenantId,
      isDeleted: { $ne: true }
    }).sort({ sortOrder: 1, name: 1 }).exec()

    return NextResponse.json({
      success: true,
      data: { categories }
    })

  } catch (error: any) {
    console.error('Get categories error:', error)

    return NextResponse.json({
      success: false,
      error: {
        code: 'CATEGORIES_ERROR',
        message: 'Failed to fetch categories'
      }
    }, { status: 500 })
  }
}, {
  requiredPermissions: ['menu:manage'],
  rateLimitKey: 'admin-categories',
  rateLimitMax: 100,
  rateLimitWindow: 3600
})

// POST - Create category or reorder categories
export const POST = withAuth(async (request: NextRequest, { authContext }) => {
  try {
    const body = await request.json()

    await connectToDatabase()

    // Check if this is a reorder operation
    if (body.categoryIds) {
      const { categoryIds } = reorderCategoriesSchema.parse(body)

      // Validate all categories exist and belong to the restaurant
      const existingCategories = await Category.find({
        _id: { $in: categoryIds },
        tenantId: authContext.tenantId,
        restaurantId: authContext.tenantId,
        isDeleted: { $ne: true }
      })

      if (existingCategories.length !== categoryIds.length) {
        return NextResponse.json({
          success: false,
          error: {
            code: 'INVALID_CATEGORIES',
            message: 'Some categories do not exist or do not belong to this restaurant'
          }
        }, { status: 400 })
      }

      // Perform reordering
      const bulkOps = categoryIds.map((categoryId, index) => ({
        updateOne: {
          filter: { 
            _id: categoryId, 
            tenantId: authContext.tenantId,
            restaurantId: authContext.tenantId 
          },
          update: { 
            sortOrder: index,
            updatedBy: authContext.userId,
            lastModifiedAt: new Date()
          }
        }
      }))

      await Category.bulkWrite(bulkOps)

      // Log audit event
      await auditLogger.log({
        tenantId: authContext.tenantId,
        userId: authContext.userId,
        action: 'categories_reordered',
        resourceType: 'category',
        resourceId: 'bulk',
        details: {
          categoryIds,
          newOrder: categoryIds
        }
      })

      // Invalidate menu cache
      await menuService.invalidateMenuCache(authContext.tenantId, authContext.tenantId)

      return NextResponse.json({
        success: true,
        data: {
          message: 'Categories reordered successfully'
        }
      })
    }

    // Create new category
    const validatedData = createCategorySchema.parse(body)

    const category = new Category({
      ...validatedData,
      tenantId: authContext.tenantId,
      restaurantId: authContext.tenantId,
      createdBy: authContext.userId,
      updatedBy: authContext.userId
    })

    await category.save()

    // Log audit event
    await auditLogger.log({
      tenantId: authContext.tenantId,
      userId: authContext.userId,
      action: 'category_created',
      resourceType: 'category',
      resourceId: category._id.toString(),
      details: {
        name: category.name,
        sortOrder: category.sortOrder
      }
    })

    // Invalidate menu cache
    await menuService.invalidateMenuCache(authContext.tenantId, authContext.tenantId)

    return NextResponse.json({
      success: true,
      data: {
        category,
        message: 'Category created successfully'
      }
    }, { status: 201 })

  } catch (error: any) {
    console.error('Create/reorder category error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid category data',
          details: error.issues
        }
      }, { status: 400 })
    }

    if (error.code === 11000) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'DUPLICATE_CATEGORY',
          message: 'Category with this name already exists'
        }
      }, { status: 409 })
    }

    return NextResponse.json({
      success: false,
      error: {
        code: 'CATEGORY_ERROR',
        message: 'Failed to create or reorder category'
      }
    }, { status: 500 })
  }
}, {
  requiredPermissions: ['menu:manage'],
  rateLimitKey: 'admin-category-create',
  rateLimitMax: 20,
  rateLimitWindow: 3600
})