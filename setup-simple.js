const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

async function setupDatabase() {
  const uri = 'mongodb://localhost:27017/restaurant_db';
  console.log('🔧 Setting up database...');
  
  try {
    const client = new MongoClient(uri);
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db('restaurant_db');
    
    // Clear existing data
    await db.collection('users').deleteMany({});
    await db.collection('menuitems').deleteMany({});
    await db.collection('restaurants').deleteMany({});
    console.log('🧹 Cleared existing data');
    
    // Create admin user
    const hashedPassword = await bcrypt.hash('password123', 12);
    const adminUser = {
      email: 'owner@restaurant.com',
      name: 'Restaurant Owner',
      role: 'owner',
      tenantId: 'default-restaurant',
      passwordHash: hashedPassword,
      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      sessions: []
    };
    
    await db.collection('users').insertOne(adminUser);
    console.log('👤 Created admin user: owner@restaurant.com / password123');
    
    // Create restaurant
    const restaurant = {
      tenantId: 'default-restaurant',
      name: 'Spice Garden Restaurant',
      description: 'Authentic Indian cuisine with modern twist',
      cuisine: ['Indian', 'Vegetarian'],
      address: {
        street: '123 Main Street',
        city: 'Mumbai',
        state: 'Maharashtra',
        zipCode: '400001',
        coordinates: { lat: 19.0760, lng: 72.8777 }
      },
      contact: {
        phone: '+91-9876543210',
        email: 'info@spicegarden.com'
      },
      operatingHours: {
        monday: { open: '11:00', close: '23:00', isOpen: true },
        tuesday: { open: '11:00', close: '23:00', isOpen: true },
        wednesday: { open: '11:00', close: '23:00', isOpen: true },
        thursday: { open: '11:00', close: '23:00', isOpen: true },
        friday: { open: '11:00', close: '23:00', isOpen: true },
        saturday: { open: '11:00', close: '23:00', isOpen: true },
        sunday: { open: '11:00', close: '23:00', isOpen: true }
      },
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    await db.collection('restaurants').insertOne(restaurant);
    console.log('🏪 Created restaurant: Spice Garden Restaurant');
    
    // Create sample menu items
    const menuItems = [
      {
        tenantId: 'default-restaurant',
        restaurantId: restaurant._id,
        name: 'Butter Chicken',
        description: 'Creamy tomato-based curry with tender chicken pieces',
        price: 350,
        category: 'Main Course',
        availability: true,
        preparationTime: 20,
        dietaryInfo: { isVeg: false, isVegan: false, isGlutenFree: false },
        tags: ['popular', 'spicy'],
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false
      },
      {
        tenantId: 'default-restaurant',
        restaurantId: restaurant._id,
        name: 'Paneer Tikka Masala',
        description: 'Grilled cottage cheese in rich tomato gravy',
        price: 320,
        category: 'Main Course',
        availability: true,
        preparationTime: 18,
        dietaryInfo: { isVeg: true, isVegan: false, isGlutenFree: false },
        tags: ['vegetarian', 'popular'],
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false
      },
      {
        tenantId: 'default-restaurant',
        restaurantId: restaurant._id,
        name: 'Garlic Naan',
        description: 'Fresh baked bread with garlic and herbs',
        price: 80,
        category: 'Breads',
        availability: true,
        preparationTime: 10,
        dietaryInfo: { isVeg: true, isVegan: false, isGlutenFree: false },
        tags: ['bread', 'side'],
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false
      },
      {
        tenantId: 'default-restaurant',
        restaurantId: restaurant._id,
        name: 'Masala Chai',
        description: 'Traditional Indian spiced tea',
        price: 40,
        category: 'Beverages',
        availability: true,
        preparationTime: 5,
        dietaryInfo: { isVeg: true, isVegan: false, isGlutenFree: true },
        tags: ['beverage', 'hot'],
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false
      }
    ];
    
    await db.collection('menuitems').insertMany(menuItems);
    console.log('🍽️ Created sample menu items');
    
    await client.close();
    console.log('✅ Database setup complete!');
    console.log('\n📋 Summary:');
    console.log('- Admin Login: owner@restaurant.com / password123');
    console.log('- Restaurant: Spice Garden Restaurant');
    console.log('- Menu Items: 4 sample items created');
    console.log('\n🌐 URLs:');
    console.log('- Customer Site: http://localhost:3001');
    console.log('- Admin Panel: http://localhost:3001/admin');
    
  } catch (error) {
    console.error('❌ Setup failed:', error);
  }
}

setupDatabase();