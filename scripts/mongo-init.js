// MongoDB initialization script
db = db.getSiblingDB('restaurant_db');

// Create collections with indexes
db.createCollection('users');
db.createCollection('restaurants');
db.createCollection('menuitems');
db.createCollection('orders');
db.createCollection('categories');
db.createCollection('coupons');

// Create indexes for performance
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ tenantId: 1, email: 1 });
db.users.createIndex({ tenantId: 1, role: 1 });

db.menuitems.createIndex({ tenantId: 1, category: 1 });
db.menuitems.createIndex({ restaurantId: 1, availability: 1 });
db.menuitems.createIndex({ tenantId: 1, isDeleted: 1 });

db.orders.createIndex({ userId: 1, createdAt: -1 });
db.orders.createIndex({ status: 1, createdAt: -1 });
db.orders.createIndex({ tenantId: 1, status: 1 });
db.orders.createIndex({ restaurantId: 1, createdAt: -1 });

db.coupons.createIndex({ code: 1, active: 1 });
db.coupons.createIndex({ tenantId: 1, active: 1 });

print('Database initialized with collections and indexes');