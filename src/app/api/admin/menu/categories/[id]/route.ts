import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Category } from '@/models/Category'
import { MenuItem } from '@/models/MenuItem'
import { connectToDatabase } from '@/lib/mongodb'
import { withAuth } from '@/lib/auth/admin-middleware'
import { auditLogger } from '@/lib/audit-logger'
import { menuService } from '@/lib/services/menu-service'

const paramsSchema = z.object({
  id: z.string().min(1)
})

const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  image: z.string().url().optional(),
  sortOrder: z.number().min(0).max(1000).optional(),
  isActive: z.boolean().optional()
})

// GET - Get single category
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(async (req: NextRequest, { authContext }) => {
    try {
      const { id } = paramsSchema.parse(params)

      await connectToDatabase()

      const category = await Category.findOne({
        _id: id,
        tenantId: authContext.tenantId,
        restaurantId: authContext.tenantId,
        isDeleted: { $ne: true }
      }).exec()

      if (!category) {
        return NextResponse.json({
          success: false,
          error: {
            code: 'CATEGORY_NOT_FOUND',
            message: 'Category not found'
          }
        }, { status: 404 })
      }

      // Get item count for this category
      const itemCount = await MenuItem.countDocuments({
        tenantId: authContext.tenantId,
        restaurantId: authContext.tenantId,
        category: category.name,
        isDeleted: { $ne: true }
      })

      return NextResponse.json({
        success: true,
        data: { 
          category: {
            ...category.toObject(),
            itemCount
          }
        }
      })

    } catch (error: any) {
      console.error('Get category error:', error)

      if (error instanceof z.ZodError) {
        return NextResponse.json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid category ID',
            details: error.issues
          }
        }, { status: 400 })
      }

      return NextResponse.json({
        success: false,
        error: {
          code: 'CATEGORY_ERROR',
          message: 'Failed to fetch category'
        }
      }, { status: 500 })
    }
  }, {
    requiredPermissions: ['menu:manage'],
    rateLimitKey: 'admin-category',
    rateLimitMax: 200,
    rateLimitWindow: 3600
  })(request)
}

// PUT - Update category
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(async (req: NextRequest, { authContext }) => {
    try {
      const { id } = paramsSchema.parse(params)
      const body = await request.json()
      const validatedData = updateCategorySchema.parse(body)

      await connectToDatabase()

      // Get existing category for audit logging
      const existingCategory = await Category.findOne({
        _id: id,
        tenantId: authContext.tenantId,
        restaurantId: authContext.tenantId,
        isDeleted: { $ne: true }
      })

      if (!existingCategory) {
        return NextResponse.json({
          success: false,
          error: {
            code: 'CATEGORY_NOT_FOUND',
            message: 'Category not found'
          }
        }, { status: 404 })
      }

      // If name is being changed, update all menu items with the old category name
      if (validatedData.name && validatedData.name !== existingCategory.name) {
        await MenuItem.updateMany(
          {
            tenantId: authContext.tenantId,
            restaurantId: authContext.tenantId,
            category: existingCategory.name,
            isDeleted: { $ne: true }
          },
          {
            $set: {
              category: validatedData.name,
              updatedBy: authContext.userId,
              lastModifiedAt: new Date()
            }
          }
        )
      }

      // Update category
      const updatedCategory = await Category.findOneAndUpdate(
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
      ).exec()

      // Log audit event
      await auditLogger.log({
        tenantId: authContext.tenantId,
        userId: authContext.userId,
        action: 'category_updated',
        resourceType: 'category',
        resourceId: id,
        details: {
          changes: validatedData,
          previousValues: {
            name: existingCategory.name,
            isActive: existingCategory.isActive,
            sortOrder: existingCategory.sortOrder
          }
        }
      })

      // Invalidate menu cache
      await menuService.invalidateMenuCache(authContext.tenantId, authContext.tenantId)

      return NextResponse.json({
        success: true,
        data: {
          category: updatedCategory,
          message: 'Category updated successfully'
        }
      })

    } catch (error: any) {
      console.error('Update category error:', error)

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
            code: 'DUPLICATE_CATEGORY',
            message: 'Category with this name already exists'
          }
        }, { status: 409 })
      }

      return NextResponse.json({
        success: false,
        error: {
          code: 'UPDATE_ERROR',
          message: 'Failed to update category'
        }
      }, { status: 500 })
    }
  }, {
    requiredPermissions: ['menu:manage'],
    rateLimitKey: 'admin-category-update',
    rateLimitMax: 50,
    rateLimitWindow: 3600
  })(request)
}

// DELETE - Soft delete category
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(async (req: NextRequest, { authContext }) => {
    try {
      const { id } = paramsSchema.parse(params)

      await connectToDatabase()

      const category = await Category.findOne({
        _id: id,
        tenantId: authContext.tenantId,
        restaurantId: authContext.tenantId,
        isDeleted: { $ne: true }
      })

      if (!category) {
        return NextResponse.json({
          success: false,
          error: {
            code: 'CATEGORY_NOT_FOUND',
            message: 'Category not found'
          }
        }, { status: 404 })
      }

      // Check if category has menu items
      const itemCount = await MenuItem.countDocuments({
        tenantId: authContext.tenantId,
        restaurantId: authContext.tenantId,
        category: category.name,
        isDeleted: { $ne: true }
      })

      if (itemCount > 0) {
        return NextResponse.json({
          success: false,
          error: {
            code: 'CATEGORY_HAS_ITEMS',
            message: `Cannot delete category with ${itemCount} menu items. Please move or delete the items first.`
          }
        }, { status: 400 })
      }

      // Soft delete category
      await Category.findOneAndUpdate(
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
        action: 'category_deleted',
        resourceType: 'category',
        resourceId: id,
        details: {
          name: category.name
        }
      })

      // Invalidate menu cache
      await menuService.invalidateMenuCache(authContext.tenantId, authContext.tenantId)

      return NextResponse.json({
        success: true,
        data: {
          message: 'Category deleted successfully'
        }
      })

    } catch (error: any) {
      console.error('Delete category error:', error)

      if (error instanceof z.ZodError) {
        return NextResponse.json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid category ID',
            details: error.issues
          }
        }, { status: 400 })
      }

      return NextResponse.json({
        success: false,
        error: {
          code: 'DELETE_ERROR',
          message: 'Failed to delete category'
        }
      }, { status: 500 })
    }
  }, {
    requiredPermissions: ['menu:manage'],
    rateLimitKey: 'admin-category-delete',
    rateLimitMax: 20,
    rateLimitWindow: 3600
  })(request)
}