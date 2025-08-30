import { connectToDatabase, disconnectFromDatabase, ensureIndexes } from '../src/lib/mongodb'
import { 
  User, 
  Restaurant, 
  Category, 
  MenuItem, 
  Order, 
  Coupon, 
  DeliveryPerson 
} from '../src/models'

interface IndexInfo {
  collection: string
  indexes: Array<{
    name: string
    key: Record<string, any>
    unique?: boolean
    sparse?: boolean
    background?: boolean
  }>
}

async function createCustomIndexes(): Promise<void> {
  try {
    console.log('🔧 Creating custom compound indexes...')

    // Orders collection - compound indexes as per requirements
    await Order.collection.createIndex(
      { tenantId: 1, userId: 1, createdAt: -1 },
      { name: 'orders_user_timeline', background: true }
    )
    
    await Order.collection.createIndex(
      { tenantId: 1, status: 1, createdAt: -1 },
      { name: 'orders_status_timeline', background: true }
    )

    // Menu items collection - compound indexes as per requirements  
    await MenuItem.collection.createIndex(
      { tenantId: 1, restaurantId: 1, category: 1 },
      { name: 'menu_restaurant_category', background: true }
    )

    // Users collection - performance indexes
    await User.collection.createIndex(
      { tenantId: 1, email: 1 },
      { name: 'users_tenant_email', unique: true, background: true }
    )

    await User.collection.createIndex(
      { tenantId: 1, role: 1, isDeleted: 1 },
      { name: 'users_tenant_role_active', background: true }
    )

    // Categories collection - sorting indexes
    await Category.collection.createIndex(
      { tenantId: 1, restaurantId: 1, sortOrder: 1 },
      { name: 'categories_restaurant_sort', background: true }
    )

    // Delivery persons collection - location and availability indexes
    await DeliveryPerson.collection.createIndex(
      { tenantId: 1, restaurantId: 1, status: 1, isVerified: 1 },
      { name: 'delivery_availability', background: true }
    )

    await DeliveryPerson.collection.createIndex(
      { 'currentLocation.lat': 1, 'currentLocation.lng': 1 },
      { name: 'delivery_location_2d', background: true }
    )

    // Coupons collection - validation indexes
    await Coupon.collection.createIndex(
      { tenantId: 1, code: 1, active: 1 },
      { name: 'coupons_code_active', background: true }
    )

    await Coupon.collection.createIndex(
      { tenantId: 1, validFrom: 1, validTo: 1 },
      { name: 'coupons_validity_period', background: true }
    )

    console.log('✅ Custom compound indexes created successfully')

  } catch (error) {
    console.error('❌ Error creating custom indexes:', error)
    throw error
  }
}

async function listAllIndexes(): Promise<IndexInfo[]> {
  try {
    console.log('📋 Listing all collection indexes...')

    const collections = [
      { name: 'users', model: User },
      { name: 'restaurants', model: Restaurant },
      { name: 'categories', model: Category },
      { name: 'menuitems', model: MenuItem },
      { name: 'orders', model: Order },
      { name: 'coupons', model: Coupon },
      { name: 'deliverypersons', model: DeliveryPerson }
    ]

    const indexInfo: IndexInfo[] = []

    for (const collection of collections) {
      try {
        const indexes = await collection.model.collection.listIndexes().toArray()
        indexInfo.push({
          collection: collection.name,
          indexes: indexes.map(idx => ({
            name: idx.name,
            key: idx.key,
            unique: idx.unique,
            sparse: idx.sparse,
            background: idx.background
          }))
        })
      } catch (error) {
        console.log(`⚠️  Collection ${collection.name} not found or no indexes`)
      }
    }

    return indexInfo
  } catch (error) {
    console.error('❌ Error listing indexes:', error)
    throw error
  }
}

async function dropAllIndexes(): Promise<void> {
  try {
    console.log('🗑️  Dropping all custom indexes (keeping _id)...')

    const collections = [User, Restaurant, Category, MenuItem, Order, Coupon, DeliveryPerson]

    for (const collection of collections) {
      try {
        await collection.collection.dropIndexes()
        console.log(`✅ Dropped indexes for ${collection.collection.collectionName}`)
      } catch (error) {
        console.log(`⚠️  Could not drop indexes for ${collection.collection.collectionName}`)
      }
    }

    console.log('✅ All custom indexes dropped')
  } catch (error) {
    console.error('❌ Error dropping indexes:', error)
    throw error
  }
}

async function analyzeIndexUsage(): Promise<void> {
  try {
    console.log('📊 Analyzing index usage...')

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
      try {
        const stats = await collection.model.collection.aggregate([
          { $indexStats: {} }
        ]).toArray()

        console.log(`\n📈 ${collection.name.toUpperCase()} Index Usage:`)
        stats.forEach(stat => {
          console.log(`  - ${stat.name}: ${stat.accesses.ops} operations`)
        })
      } catch (error) {
        console.log(`⚠️  Could not get index stats for ${collection.name}`)
      }
    }
  } catch (error) {
    console.error('❌ Error analyzing index usage:', error)
    throw error
  }
}

async function main(): Promise<void> {
  const command = process.argv[2]

  try {
    await connectToDatabase()

    switch (command) {
      case 'create':
        await createCustomIndexes()
        break
      
      case 'list':
        const indexInfo = await listAllIndexes()
        console.log('\n📋 Current Indexes:')
        indexInfo.forEach(info => {
          console.log(`\n🗂️  ${info.collection.toUpperCase()}:`)
          info.indexes.forEach(idx => {
            const flags = []
            if (idx.unique) flags.push('unique')
            if (idx.sparse) flags.push('sparse')
            if (idx.background) flags.push('background')
            
            console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)} ${flags.length ? `(${flags.join(', ')})` : ''}`)
          })
        })
        break
      
      case 'drop':
        await dropAllIndexes()
        break
      
      case 'analyze':
        await analyzeIndexUsage()
        break
      
      case 'ensure':
        await ensureIndexes()
        break
      
      default:
        console.log(`
🔧 Database Index Management Tool

Usage: npm run db:indexes <command>

Commands:
  create   - Create all custom compound indexes
  list     - List all existing indexes
  drop     - Drop all custom indexes (keeps _id)
  analyze  - Analyze index usage statistics
  ensure   - Ensure basic indexes exist

Examples:
  npm run db:indexes create
  npm run db:indexes list
  npm run db:indexes analyze
        `)
    }

  } catch (error) {
    console.error('❌ Index management failed:', error)
    process.exit(1)
  } finally {
    await disconnectFromDatabase()
  }
}

// Run if called directly
if (require.main === module) {
  main()
    .then(() => {
      console.log('✅ Index management completed')
      process.exit(0)
    })
    .catch((error) => {
      console.error('❌ Index management failed:', error)
      process.exit(1)
    })
}

export { createCustomIndexes, listAllIndexes, dropAllIndexes, analyzeIndexUsage }