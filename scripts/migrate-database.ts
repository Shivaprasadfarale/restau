import { connectToDatabase, disconnectFromDatabase } from '../src/lib/mongodb'
import { 
  User, 
  Restaurant, 
  Category, 
  MenuItem, 
  Order, 
  Coupon, 
  DeliveryPerson 
} from '../src/models'

interface MigrationResult {
  collection: string
  updated: number
  errors: number
}

async function migrateToEnhancedSoftDelete(): Promise<MigrationResult[]> {
  console.log('🔄 Migrating to enhanced soft delete schema...')
  
  const results: MigrationResult[] = []
  const collections = [
    { name: 'users', model: User },
    { name: 'categories', model: Category },
    { name: 'menuitems', model: MenuItem },
    { name: 'deliverypersons', model: DeliveryPerson }
  ]

  for (const collection of collections) {
    let updated = 0
    let errors = 0

    try {
      // Add new soft delete fields to existing documents that don't have them
      const updateResult = await collection.model.updateMany(
        { 
          isDeleted: { $exists: true },
          deletedAt: { $exists: false }
        },
        {
          $set: {
            deletedAt: null,
            deletedBy: null,
            deletionReason: null
          }
        }
      )

      updated = updateResult.modifiedCount
      console.log(`✅ ${collection.name}: Updated ${updated} documents`)

    } catch (error) {
      console.error(`❌ Error migrating ${collection.name}:`, error)
      errors++
    }

    results.push({
      collection: collection.name,
      updated,
      errors
    })
  }

  return results
}

async function addTenantIdToExistingData(defaultTenantId: string): Promise<MigrationResult[]> {
  console.log(`🔄 Adding tenantId ${defaultTenantId} to existing data...`)
  
  const results: MigrationResult[] = []
  const collections = [
    { name: 'users', model: User },
    { name: 'restaurants', model: Restaurant },
    { name: 'categories', model: Category },
    { name: 'menuitems', model: MenuItem },
    { name: 'orders', model: Order },
    { name: 'coupons', model: Coupon },
    { name: 'deliverypersons', model: DeliveryPerson }
  ]

  for (const collection of collections) {
    let updated = 0
    let errors = 0

    try {
      // Add tenantId to documents that don't have it
      const updateResult = await collection.model.updateMany(
        { tenantId: { $exists: false } },
        { $set: { tenantId: defaultTenantId } }
      )

      updated = updateResult.modifiedCount
      console.log(`✅ ${collection.name}: Added tenantId to ${updated} documents`)

    } catch (error) {
      console.error(`❌ Error adding tenantId to ${collection.name}:`, error)
      errors++
    }

    results.push({
      collection: collection.name,
      updated,
      errors
    })
  }

  return results
}

async function migrateUserSessions(): Promise<MigrationResult> {
  console.log('🔄 Migrating user sessions to new format...')
  
  let updated = 0
  let errors = 0

  try {
    // Find users with old session format and update
    const users = await User.find({ 
      sessions: { $exists: true, $type: 'array' }
    })

    for (const user of users) {
      let needsUpdate = false
      
      // Check if sessions need migration (missing required fields)
      const updatedSessions = user.sessions.map((session: any) => {
        if (!session.deviceInfo || !session.ipAddress) {
          needsUpdate = true
          return {
            ...session,
            deviceInfo: session.deviceInfo || 'Unknown Device',
            ipAddress: session.ipAddress || '0.0.0.0',
            lastActivity: session.lastActivity || new Date(),
            isRevoked: session.isRevoked || false
          }
        }
        return session
      })

      if (needsUpdate) {
        user.sessions = updatedSessions
        await user.save()
        updated++
      }
    }

    console.log(`✅ users: Migrated ${updated} user sessions`)

  } catch (error) {
    console.error('❌ Error migrating user sessions:', error)
    errors++
  }

  return {
    collection: 'users',
    updated,
    errors
  }
}

async function validateDataIntegrity(): Promise<void> {
  console.log('🔍 Validating data integrity...')

  const validationResults = []

  // Check for orphaned menu items (without valid restaurant)
  const orphanedMenuItems = await MenuItem.aggregate([
    {
      $lookup: {
        from: 'restaurants',
        localField: 'restaurantId',
        foreignField: '_id',
        as: 'restaurant'
      }
    },
    {
      $match: {
        restaurant: { $size: 0 }
      }
    },
    {
      $count: 'count'
    }
  ])

  if (orphanedMenuItems.length > 0) {
    validationResults.push(`⚠️  Found ${orphanedMenuItems[0].count} orphaned menu items`)
  }

  // Check for orders without valid users
  const orphanedOrders = await Order.aggregate([
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user'
      }
    },
    {
      $match: {
        user: { $size: 0 }
      }
    },
    {
      $count: 'count'
    }
  ])

  if (orphanedOrders.length > 0) {
    validationResults.push(`⚠️  Found ${orphanedOrders[0].count} orphaned orders`)
  }

  // Check for delivery persons without valid users
  const orphanedDeliveryPersons = await DeliveryPerson.aggregate([
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user'
      }
    },
    {
      $match: {
        user: { $size: 0 }
      }
    },
    {
      $count: 'count'
    }
  ])

  if (orphanedDeliveryPersons.length > 0) {
    validationResults.push(`⚠️  Found ${orphanedDeliveryPersons[0].count} orphaned delivery persons`)
  }

  if (validationResults.length === 0) {
    console.log('✅ Data integrity validation passed')
  } else {
    console.log('⚠️  Data integrity issues found:')
    validationResults.forEach(result => console.log(`  ${result}`))
  }
}

async function cleanupOldData(): Promise<void> {
  console.log('🧹 Cleaning up old/invalid data...')

  // Remove sessions older than 90 days
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  
  const users = await User.find({
    'sessions.lastActivity': { $lt: ninetyDaysAgo }
  })

  let cleanedSessions = 0
  for (const user of users) {
    const originalLength = user.sessions.length
    user.sessions = user.sessions.filter((session: any) => 
      session.lastActivity >= ninetyDaysAgo
    )
    
    if (user.sessions.length !== originalLength) {
      await user.save()
      cleanedSessions += (originalLength - user.sessions.length)
    }
  }

  console.log(`✅ Cleaned up ${cleanedSessions} old user sessions`)

  // Remove soft-deleted items older than 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  
  const collections = [MenuItem, Category, DeliveryPerson]
  let totalCleaned = 0

  for (const collection of collections) {
    const result = await collection.deleteMany({
      isDeleted: true,
      deletedAt: { $lt: thirtyDaysAgo }
    })
    
    totalCleaned += result.deletedCount
    console.log(`✅ Permanently deleted ${result.deletedCount} old ${collection.collection.collectionName}`)
  }

  console.log(`✅ Total cleanup: ${totalCleaned} documents permanently removed`)
}

async function main(): Promise<void> {
  const command = process.argv[2]
  const tenantId = process.argv[3]

  try {
    await connectToDatabase()

    switch (command) {
      case 'soft-delete':
        const softDeleteResults = await migrateToEnhancedSoftDelete()
        console.log('\n📊 Soft Delete Migration Results:')
        softDeleteResults.forEach(result => {
          console.log(`  ${result.collection}: ${result.updated} updated, ${result.errors} errors`)
        })
        break
      
      case 'tenant-id':
        if (!tenantId) {
          console.error('❌ Please provide a tenant ID: npm run db:migrate tenant-id <tenantId>')
          process.exit(1)
        }
        const tenantResults = await addTenantIdToExistingData(tenantId)
        console.log('\n📊 Tenant ID Migration Results:')
        tenantResults.forEach(result => {
          console.log(`  ${result.collection}: ${result.updated} updated, ${result.errors} errors`)
        })
        break
      
      case 'sessions':
        const sessionResult = await migrateUserSessions()
        console.log(`\n📊 Session Migration: ${sessionResult.updated} updated, ${sessionResult.errors} errors`)
        break
      
      case 'validate':
        await validateDataIntegrity()
        break
      
      case 'cleanup':
        await cleanupOldData()
        break
      
      case 'all':
        console.log('🔄 Running all migrations...')
        await migrateToEnhancedSoftDelete()
        await migrateUserSessions()
        await validateDataIntegrity()
        console.log('✅ All migrations completed')
        break
      
      default:
        console.log(`
🔄 Database Migration Tool

Usage: npm run db:migrate <command> [options]

Commands:
  soft-delete     - Migrate to enhanced soft delete schema
  tenant-id <id>  - Add tenant ID to existing data
  sessions        - Migrate user sessions to new format
  validate        - Validate data integrity
  cleanup         - Clean up old/invalid data
  all             - Run all migrations

Examples:
  npm run db:migrate soft-delete
  npm run db:migrate tenant-id 507f1f77bcf86cd799439011
  npm run db:migrate validate
  npm run db:migrate cleanup
        `)
    }

  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  } finally {
    await disconnectFromDatabase()
  }
}

// Run if called directly
if (require.main === module) {
  main()
    .then(() => {
      console.log('✅ Migration completed')
      process.exit(0)
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error)
      process.exit(1)
    })
}

export { 
  migrateToEnhancedSoftDelete, 
  addTenantIdToExistingData, 
  migrateUserSessions, 
  validateDataIntegrity, 
  cleanupOldData 
}