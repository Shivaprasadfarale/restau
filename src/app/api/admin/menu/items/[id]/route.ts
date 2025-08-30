import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { MenuItem } from '@/models/MenuItem'
import { Category } from '@/models/Category'
import { connectToDatabase } from '@/lib/mongodb'
import { withAuth } from '@/lib/auth/admin-middleware'
import { auditLogger } from '@/lib/audit-logger'
import { menuService } from '@/lib/services/menu-service'

const paramsSchema = z.object({
  id: z.string().min(1)
})

const updateMenuItemSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(1000).optional(),
  price: z.number().min(0).max(100000).optional(),
  category: z.string().min(1).max(100).optional(),
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
  })).optional(),
  preparationTime: z.number().min(1).max(180).optional(),
  tags: z.array(z.string().max(50)).optional(),
  dietaryInfo: z.object({
    isVeg: z.boolean().optional(),
    isVegan: z.boolean().optional(),
    isGlutenFree: z.boolean().optional(),
    allergens: z.array(z.string().max(50)).optional()
  }).optional(),
  badges: z.array(z.enum(['bestseller', 'new', 'spicy', 'chef-special', 'healthy'])).optional(),
  availability: z.boolean().optional(),
  nutritionalInfo: z.object({
    calories: z.number().min(0).optional(),
    protein: z.number().min(0).optional(),
    carbs: z.number().min(0).optional(),
    fat: z.number().min(0).optional(),
    fiber: z.number().min(0).optional(),
    sugar: z.number().min(0).optional()
  }).optional()
})

// GET - Get single menu item
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(async (req: NextRequest, { authContext }) => {
    try {
      const { id } = paramsSchema.parse(params)

      await connectToDatabase()

      const item = await MenuItem.findOne({
        _id: id,
        tenantId: authContext.tenantId,
        restaurantId: authContext.tenantId,
        isDeleted: { $ne: true }
      }).populate('restaurantId', 'name').exec()

      if (!item) {
        return NextResponse.json({
          success: false,
          error: {
            code: 'ITEM_NOT_FOUND',
            message: 'Menu item not found'
          }
        }, { status: 404 })
      }

      return NextResponse.json({
        success: true,
        data: { item }
      })

    } catch (error: any) {
      console.error('Get menu item error:', error)

      if (error instanceof z.ZodError) {
        return NextResponse.json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid item ID',
            details: error.issues
          }
        }, { status: 400 })
      }

      return NextResponse.json({
        success: false,
        error: {
          code: 'MENU_ITEM_ERROR',
          message: 'Failed to fetch menu item'
        }
      }, { status: 500 })
    }
  }, {
    requiredPermissions: ['menu:manage'],
    rateLimitKey: 'admin-menu-item',
    rateLimitMax: 200,
    rateLimitWindow: 3600
  })(request)
}

// PUT - Update menu item
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(async (req: NextRequest, { authContext }) => {
    try {
      const { id } = paramsSchema.parse(params)
      const body = await request.json()
      const validatedData = updateMenuItemSchema.parse(body)

      await connectToDatabase()

      // Get existing item for audit logging
      const existingItem = await MenuItem.findOne({
        _id: id,
        tenantId: authContext.tenantId,
        restaurantId: authContext.tenantId,
        isDeleted: { $ne: true }
      })

      if (!existingItem) {
        return NextResponse.json({
          success: false,
          error: {
            code: 'ITEM_NOT_FOUND',
            message: 'Menu item not found'
          }
        }, { status: 404 })
      }

      // Verify category exists if being updated
      if (validatedData.category) {
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
      }

      // Update item
      const updatedItem = await MenuItem.findOneAndUpdate(
        {
          _id: id,
          tenantId: authContext.tenantId,
          restaurantId: authContext.tenantId,
          isDeleted: { $ne: true }
        },
        {
          $set: {
            ...validatedData,
            updatedBy: authContext.userId,
            lastModifiedAt: new Date()
          }
        },
        { new: true, runValidators: true }
      ).populate('restaurantId', 'name').exec()

      // Log audit event
      await auditLogger.log({
        tenantId: authContext.tenantId,
        userId: authContext.userId,
        action: 'menu_item_updated',
        resourceType: 'menu_item',
        resourceId: id,
        details: {
          changes: validatedData,
          previousValues: {
            name: existingItem.name,
            price: existingItem.price,
            availability: existingItem.availability
          }
        }
      })

      // Invalidate menu cache
      await menuService.invalidateMenuCache(authContext.tenantId, authContext.tenantId)

      return NextResponse.json({
        success: true,
        data: {
          item: updatedItem,
          message: 'Menu item updated successfully'
        }
      })

    } catch (error: any) {
      console.error('Update menu item error:', error)

      if (error instanceof z.ZodError) {
        return NextResponse.json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid update data',
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
          code: 'UPDATE_ERROR',
          message: 'Failed to update menu item'
        }
      }, { status: 500 })
    }
  }, {
    requiredPermissions: ['menu:manage'],
    rateLimitKey: 'admin-menu-update',
    rateLimitMax: 50,
    rateLimitWindow: 3600
  })(request)
}

// DELETE - Soft delete menu item
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(async (req: NextRequest, { authContext }) => {
    try {
      const { id } = paramsSchema.parse(params)

      await connectToDatabase()

      const item = await MenuItem.findOne({
        _id: id,
        tenantId: authContext.tenantId,
        restaurantId: authContext.tenantId,
        isDeleted: { $ne: true }
      })

      if (!item) {
        return NextResponse.json({
          success: false,
          error: {
            code: 'ITEM_NOT_FOUND',
            message: 'Menu item not found'
          }
        }, { status: 404 })
      }

      // Soft delete
      await MenuItem.findOneAndUpdate(
        {
          _id: id,
          tenantId: authContext.tenantId,
          restaurantId: authContext.tenantId
        },
        {
          $set: {
            isDeleted: true,
            deletedAt: new Date(),
            updatedBy: authContext.userId
          }
        }
      )

      // Log audit event
      await auditLogger.log({
        tenantId: authContext.tenantId,
        userId: authContext.userId,
        action: 'menu_item_deleted',
        resourceType: 'menu_item',
        resourceId: id,
        details: {
          name: item.name,
          category: item.category
        }
      })

      // Invalidate menu cache
      await menuService.invalidateMenuCache(authContext.tenantId, authContext.tenantId)

      return NextResponse.json({
        success: true,
        data: {
          message: 'Menu item deleted successfully'
        }
      })

    } catch (error: any) {
      console.error('Delete menu item error:', error)

      if (error instanceof z.ZodError) {
        return NextResponse.json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid item ID',
            details: error.issues
          }
        }, { status: 400 })
      }

      return NextResponse.json({
        success: false,
        error: {
          code: 'DELETE_ERROR',
          message: 'Failed to delete menu item'
        }
      }, { status: 500 })
    }
  }, {
    requiredPermissions: ['menu:manage'],
    rateLimitKey: 'admin-menu-delete',
    rateLimitMax: 20,
    rateLimitWindow: 3600
  })(request)
}