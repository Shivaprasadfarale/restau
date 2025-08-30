// Load environment variables first
import { config } from 'dotenv'
config()

import { connectToDatabase, disconnectFromDatabase } from '../src/lib/mongodb'
import { User, Restaurant, Category, MenuItem, Coupon, DeliveryPerson } from '../src/models'
import bcrypt from 'bcryptjs'
import { Types } from 'mongoose'

// Type for menu item seed data (without Mongoose document properties)
interface MenuItemSeedData {
    tenantId: string
    restaurantId: string
    name: string
    description: string
    price: number
    image: string
    category: string
    modifiers: any[]
    availability: boolean
    preparationTime: number
    nutritionalInfo?: any
    tags: string[]
    dietaryInfo: any
    badges: string[]
    lastModifiedAt: Date
    createdBy: string
}

interface SeedData {
    tenantId: string
    restaurantId: string
    ownerId: string
    categories: any[]
    menuItems: MenuItemSeedData[]
}

async function seedDatabase(): Promise<void> {
    try {
        console.log('🌱 Starting database seeding...')

        await connectToDatabase()

        // Generate IDs
        const tenantId = new Types.ObjectId().toString()
        const restaurantId = new Types.ObjectId().toString()
        const ownerId = new Types.ObjectId().toString()

        console.log('📝 Creating sample restaurant owner...')

        // Create restaurant owner
        const hashedPassword = await bcrypt.hash('password123', 12)
        const owner = new User({
            _id: ownerId,
            tenantId,
            email: 'owner@restaurant.com',
            phone: '+919876543210',
            passwordHash: hashedPassword,
            name: 'Restaurant Owner',
            role: 'owner',
            addresses: [{
                type: 'work',
                street: '123 Main Street',
                city: 'Mumbai',
                state: 'Maharashtra',
                zipCode: '400001',
                landmark: 'Near Central Station'
            }],
            preferences: {
                dietaryRestrictions: [],
                spiceLevel: 'medium',
                favoriteItems: [],
            },
            sessions: [],
            isVerified: true,
            lastLogin: new Date(),
            createdBy: ownerId
        })

        await owner.save()
        console.log('✅ Restaurant owner created')

        console.log('🏪 Creating sample restaurant...')

        // Create restaurant
        const restaurant = new Restaurant({
            _id: restaurantId,
            tenantId,
            name: 'Spice Garden Restaurant',
            description: 'Authentic Indian cuisine with a modern twist. Fresh ingredients, traditional recipes, and exceptional service.',
            logo: 'https://example.com/logo.jpg',
            coverImage: 'https://example.com/cover.jpg',
            address: {
                type: 'work',
                street: '123 Main Street',
                city: 'Mumbai',
                state: 'Maharashtra',
                zipCode: '400001',
                landmark: 'Near Central Station',
                coordinates: {
                    lat: 19.0760,
                    lng: 72.8777
                }
            },
            contact: {
                phone: '+919876543210',
                email: 'contact@spicegarden.com',
                website: 'https://spicegarden.com'
            },
            operatingHours: {
                monday: { open: '11:00', close: '23:00', isOpen: true },
                tuesday: { open: '11:00', close: '23:00', isOpen: true },
                wednesday: { open: '11:00', close: '23:00', isOpen: true },
                thursday: { open: '11:00', close: '23:00', isOpen: true },
                friday: { open: '11:00', close: '23:30', isOpen: true },
                saturday: { open: '11:00', close: '23:30', isOpen: true },
                sunday: { open: '11:00', close: '22:00', isOpen: true }
            },
            deliveryRadius: 10,
            minimumOrderValue: 200,
            taxRate: 0.18, // 18% GST
            deliveryFee: 50,
            paymentMethods: ['card', 'upi_intent', 'upi_collect', 'wallet'],
            settings: {
                allowOnlineOrdering: true,
                allowScheduledOrders: true,
                maxOrdersPerSlot: 15,
                preparationBuffer: 20,
                autoAcceptOrders: false,
                notificationSettings: {
                    sms: true,
                    email: true,
                    whatsapp: true,
                    push: true
                }
            },
            maxOrdersPerSlot: 15,
            slotDuration: 30,
            isActive: true,
            createdBy: ownerId
        })

        await restaurant.save()
        console.log('✅ Restaurant created')

        console.log('📂 Creating menu categories...')

        // Create categories
        const categories = [
            {
                tenantId,
                restaurantId,
                name: 'Starters',
                description: 'Delicious appetizers to start your meal',
                sortOrder: 0,
                isActive: true,
                createdBy: ownerId
            },
            {
                tenantId,
                restaurantId,
                name: 'Main Course',
                description: 'Hearty main dishes',
                sortOrder: 1,
                isActive: true,
                createdBy: ownerId
            },
            {
                tenantId,
                restaurantId,
                name: 'Desserts',
                description: 'Sweet treats to end your meal',
                sortOrder: 2,
                isActive: true,
                createdBy: ownerId
            },
            {
                tenantId,
                restaurantId,
                name: 'Beverages',
                description: 'Refreshing drinks',
                sortOrder: 3,
                isActive: true,
                createdBy: ownerId
            }
        ]

        const savedCategories = await Category.insertMany(categories)
        console.log('✅ Categories created')

        console.log('🍽️ Creating menu items...')

        // Create menu items
        const menuItems: MenuItemSeedData[] = [
            // Starters
            {
                tenantId,
                restaurantId,
                name: 'Paneer Tikka',
                description: 'Grilled cottage cheese marinated in spices and yogurt',
                price: 280,
                image: 'https://example.com/paneer-tikka.jpg',
                category: 'Starters',
                modifiers: [
                    {
                        name: 'Spice Level',
                        type: 'radio',
                        options: [
                            { name: 'Mild', price: 0 },
                            { name: 'Medium', price: 0 },
                            { name: 'Hot', price: 0 }
                        ],
                        required: true
                    }
                ],
                availability: true,
                preparationTime: 15,
                nutritionalInfo: {
                    calories: 320,
                    protein: 18,
                    carbs: 12,
                    fat: 22,
                    fiber: 3
                },
                tags: ['vegetarian', 'grilled', 'protein-rich'],
                dietaryInfo: {
                    isVeg: true,
                    isVegan: false,
                    isGlutenFree: true,
                    allergens: ['dairy']
                },
                badges: ['bestseller'],
                lastModifiedAt: new Date(),
                createdBy: ownerId
            },
            {
                tenantId,
                restaurantId,
                name: 'Chicken Wings',
                description: 'Spicy chicken wings with tangy sauce',
                price: 320,
                image: 'https://example.com/chicken-wings.jpg',
                category: 'Starters',
                modifiers: [
                    {
                        name: 'Sauce',
                        type: 'radio',
                        options: [
                            { name: 'BBQ', price: 0 },
                            { name: 'Buffalo', price: 0 },
                            { name: 'Honey Mustard', price: 20 }
                        ],
                        required: true
                    }
                ],
                availability: true,
                preparationTime: 20,
                tags: ['non-vegetarian', 'spicy'],
                dietaryInfo: {
                    isVeg: false,
                    isVegan: false,
                    isGlutenFree: false,
                    allergens: ['gluten']
                },
                badges: ['spicy'],
                lastModifiedAt: new Date(),
                createdBy: ownerId
            },
            // Main Course
            {
                tenantId,
                restaurantId,
                name: 'Butter Chicken',
                description: 'Creamy tomato-based curry with tender chicken pieces',
                price: 450,
                image: 'https://example.com/butter-chicken.jpg',
                category: 'Main Course',
                modifiers: [
                    {
                        name: 'Bread',
                        type: 'checkbox',
                        options: [
                            { name: 'Naan', price: 60 },
                            { name: 'Roti', price: 40 },
                            { name: 'Rice', price: 80 }
                        ],
                        required: false,
                        maxSelections: 2
                    }
                ],
                availability: true,
                preparationTime: 25,
                tags: ['non-vegetarian', 'curry', 'popular'],
                dietaryInfo: {
                    isVeg: false,
                    isVegan: false,
                    isGlutenFree: true,
                    allergens: ['dairy']
                },
                badges: ['bestseller', 'chef-special'],
                lastModifiedAt: new Date(),
                createdBy: ownerId
            },
            {
                tenantId,
                restaurantId,
                name: 'Dal Makhani',
                description: 'Rich and creamy black lentil curry',
                price: 320,
                image: 'https://example.com/dal-makhani.jpg',
                category: 'Main Course',
                modifiers: [],
                availability: true,
                preparationTime: 20,
                tags: ['vegetarian', 'curry', 'comfort-food'],
                dietaryInfo: {
                    isVeg: true,
                    isVegan: false,
                    isGlutenFree: true,
                    allergens: ['dairy']
                },
                badges: ['healthy'],
                lastModifiedAt: new Date(),
                createdBy: ownerId
            },
            // Desserts
            {
                tenantId,
                restaurantId,
                name: 'Gulab Jamun',
                description: 'Traditional Indian sweet dumplings in sugar syrup',
                price: 120,
                image: 'https://example.com/gulab-jamun.jpg',
                category: 'Desserts',
                modifiers: [
                    {
                        name: 'Quantity',
                        type: 'radio',
                        options: [
                            { name: '2 pieces', price: 0 },
                            { name: '4 pieces', price: 60 }
                        ],
                        required: true
                    }
                ],
                availability: true,
                preparationTime: 5,
                tags: ['vegetarian', 'sweet', 'traditional'],
                dietaryInfo: {
                    isVeg: true,
                    isVegan: false,
                    isGlutenFree: false,
                    allergens: ['dairy', 'gluten']
                },
                badges: [],
                lastModifiedAt: new Date(),
                createdBy: ownerId
            },
            // Beverages
            {
                tenantId,
                restaurantId,
                name: 'Mango Lassi',
                description: 'Refreshing yogurt-based mango drink',
                price: 150,
                image: 'https://example.com/mango-lassi.jpg',
                category: 'Beverages',
                modifiers: [
                    {
                        name: 'Size',
                        type: 'radio',
                        options: [
                            { name: 'Regular', price: 0 },
                            { name: 'Large', price: 50 }
                        ],
                        required: true
                    }
                ],
                availability: true,
                preparationTime: 5,
                tags: ['vegetarian', 'refreshing', 'yogurt'],
                dietaryInfo: {
                    isVeg: true,
                    isVegan: false,
                    isGlutenFree: true,
                    allergens: ['dairy']
                },
                badges: ['new'],
                lastModifiedAt: new Date(),
                createdBy: ownerId
            }
        ]

        const createdMenuItems = await MenuItem.insertMany(menuItems)
        console.log('✅ Menu items created')

        console.log('🎫 Creating sample coupons...')

        // Create coupons
        const coupons = [
            {
                tenantId,
                restaurantId,
                code: 'WELCOME20',
                active: true,
                discountType: 'percentage',
                discountValue: 20,
                minOrderValue: 500,
                maxUsage: 100,
                currentUsage: 0,
                validFrom: new Date(),
                validTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
                userRestrictions: {
                    maxUsagePerUser: 1,
                    newUsersOnly: true,
                    firstOrderOnly: true
                },
                createdBy: ownerId
            },
            {
                tenantId,
                restaurantId,
                code: 'SAVE100',
                active: true,
                discountType: 'fixed',
                discountValue: 100,
                minOrderValue: 800,
                maxUsage: 50,
                currentUsage: 0,
                validFrom: new Date(),
                validTo: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days from now
                userRestrictions: {
                    maxUsagePerUser: 3,
                    newUsersOnly: false,
                    firstOrderOnly: false
                },
                createdBy: ownerId
            }
        ]

        await Coupon.insertMany(coupons)
        console.log('✅ Coupons created')

        console.log('🚚 Creating sample delivery persons...')

        // Create delivery persons
        const deliveryPersons = []
        
        // Create delivery person users first
        const deliveryUser1Id = new Types.ObjectId().toString()
        const deliveryUser2Id = new Types.ObjectId().toString()
        
        const deliveryUsers = [
            {
                _id: deliveryUser1Id,
                tenantId,
                email: 'delivery1@restaurant.com',
                phone: '+919876543211',
                passwordHash: await bcrypt.hash('delivery123', 12),
                name: 'Raj Kumar',
                role: 'courier',
                addresses: [{
                    type: 'home',
                    street: '456 Delivery Street',
                    city: 'Mumbai',
                    state: 'Maharashtra',
                    zipCode: '400002',
                    landmark: 'Near Market'
                }],
                preferences: {
                    dietaryRestrictions: [],
                    spiceLevel: 'medium',
                    favoriteItems: [],
                },
                sessions: [],
                isVerified: true,
                lastLogin: new Date(),
                createdBy: ownerId
            },
            {
                _id: deliveryUser2Id,
                tenantId,
                email: 'delivery2@restaurant.com',
                phone: '+919876543212',
                passwordHash: await bcrypt.hash('delivery123', 12),
                name: 'Priya Sharma',
                role: 'courier',
                addresses: [{
                    type: 'home',
                    street: '789 Courier Lane',
                    city: 'Mumbai',
                    state: 'Maharashtra',
                    zipCode: '400003',
                    landmark: 'Near Bus Stop'
                }],
                preferences: {
                    dietaryRestrictions: [],
                    spiceLevel: 'mild',
                    favoriteItems: [],
                },
                sessions: [],
                isVerified: true,
                lastLogin: new Date(),
                createdBy: ownerId
            }
        ]

        await User.insertMany(deliveryUsers)
        console.log('✅ Delivery person users created')

        // Create delivery person profiles
        const deliveryPersonProfiles = [
            {
                tenantId,
                userId: deliveryUser1Id,
                restaurantId,
                name: 'Raj Kumar',
                phone: '+919876543211',
                email: 'delivery1@restaurant.com',
                address: {
                    type: 'home',
                    street: '456 Delivery Street',
                    city: 'Mumbai',
                    state: 'Maharashtra',
                    zipCode: '400002',
                    landmark: 'Near Market',
                    coordinates: {
                        lat: 19.0760,
                        lng: 72.8777
                    }
                },
                vehicleInfo: {
                    type: 'bike',
                    model: 'Honda Activa',
                    licensePlate: 'MH01AB1234',
                    color: 'Red'
                },
                licenseNumber: 'DL123456789',
                status: 'active',
                currentLocation: {
                    lat: 19.0760,
                    lng: 72.8777,
                    lastUpdated: new Date()
                },
                availabilitySchedule: {
                    monday: { isAvailable: true, startTime: '09:00', endTime: '21:00' },
                    tuesday: { isAvailable: true, startTime: '09:00', endTime: '21:00' },
                    wednesday: { isAvailable: true, startTime: '09:00', endTime: '21:00' },
                    thursday: { isAvailable: true, startTime: '09:00', endTime: '21:00' },
                    friday: { isAvailable: true, startTime: '09:00', endTime: '22:00' },
                    saturday: { isAvailable: true, startTime: '09:00', endTime: '22:00' },
                    sunday: { isAvailable: false, startTime: '10:00', endTime: '20:00' }
                },
                deliveryStats: {
                    totalDeliveries: 45,
                    completedDeliveries: 42,
                    cancelledDeliveries: 3,
                    averageRating: 4.6,
                    totalRatings: 38,
                    averageDeliveryTime: 28
                },
                isVerified: true,
                joinedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
                lastActiveAt: new Date(),
                createdBy: ownerId
            },
            {
                tenantId,
                userId: deliveryUser2Id,
                restaurantId,
                name: 'Priya Sharma',
                phone: '+919876543212',
                email: 'delivery2@restaurant.com',
                address: {
                    type: 'home',
                    street: '789 Courier Lane',
                    city: 'Mumbai',
                    state: 'Maharashtra',
                    zipCode: '400003',
                    landmark: 'Near Bus Stop',
                    coordinates: {
                        lat: 19.0820,
                        lng: 72.8820
                    }
                },
                vehicleInfo: {
                    type: 'scooter',
                    model: 'TVS Jupiter',
                    licensePlate: 'MH01CD5678',
                    color: 'Blue'
                },
                licenseNumber: 'DL987654321',
                status: 'active',
                currentLocation: {
                    lat: 19.0820,
                    lng: 72.8820,
                    lastUpdated: new Date()
                },
                availabilitySchedule: {
                    monday: { isAvailable: true, startTime: '10:00', endTime: '22:00' },
                    tuesday: { isAvailable: true, startTime: '10:00', endTime: '22:00' },
                    wednesday: { isAvailable: true, startTime: '10:00', endTime: '22:00' },
                    thursday: { isAvailable: true, startTime: '10:00', endTime: '22:00' },
                    friday: { isAvailable: true, startTime: '10:00', endTime: '23:00' },
                    saturday: { isAvailable: true, startTime: '10:00', endTime: '23:00' },
                    sunday: { isAvailable: true, startTime: '11:00', endTime: '21:00' }
                },
                deliveryStats: {
                    totalDeliveries: 32,
                    completedDeliveries: 30,
                    cancelledDeliveries: 2,
                    averageRating: 4.8,
                    totalRatings: 28,
                    averageDeliveryTime: 25
                },
                isVerified: true,
                joinedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), // 15 days ago
                lastActiveAt: new Date(),
                createdBy: ownerId
            }
        ]

        await DeliveryPerson.insertMany(deliveryPersonProfiles)
        console.log('✅ Delivery persons created')

        console.log('🎉 Database seeding completed successfully!')
        console.log(`
📊 Seeded Data Summary:
- Tenant ID: ${tenantId}
- Restaurant ID: ${restaurantId}
- Owner Email: owner@restaurant.com
- Owner Password: password123
- Categories: ${categories.length}
- Menu Items: ${menuItems.length}
- Coupons: ${coupons.length}
- Delivery Persons: ${deliveryPersonProfiles.length}
- Delivery Users: delivery1@restaurant.com, delivery2@restaurant.com (password: delivery123)
    `)

    } catch (error) {
        console.error('❌ Error seeding database:', error)
        throw error
    } finally {
        await disconnectFromDatabase()
    }
}

// Run seeding if called directly
if (require.main === module) {
    seedDatabase()
        .then(() => {
            console.log('✅ Seeding completed')
            process.exit(0)
        })
        .catch((error) => {
            console.error('❌ Seeding failed:', error)
            process.exit(1)
        })
}

export { seedDatabase }