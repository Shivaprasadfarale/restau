const { MongoClient } = require('mongodb');

async function testConnection() {
  const uri = 'mongodb://localhost:27017/restaurant_db';
  console.log('Testing connection to:', uri);
  
  try {
    const client = new MongoClient(uri);
    await client.connect();
    console.log('✅ Connected successfully');
    
    const db = client.db('restaurant_db');
    const users = await db.collection('users').findOne({ email: 'owner@restaurant.com' });
    console.log('✅ Found user:', users ? users.email : 'No user found');
    
    await client.close();
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
  }
}

testConnection();