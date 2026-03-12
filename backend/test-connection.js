const mongoose = require('mongoose');
require('dotenv').config();

const testConnection = async () => {
  try {
    console.log('🔄 Testing MongoDB connection...');
    console.log('📍 Connection string:', process.env.MONGODB_URI?.replace(/:[^:@]+@/, ':****@'));
    
    await mongoose.connect(process.env.MONGODB_URI);
    
    console.log('✅ MongoDB Connected Successfully!');
    console.log('📊 Database:', mongoose.connection.db.databaseName);
    console.log('🌐 Host:', mongoose.connection.host);
    console.log('🔌 Connection state:', mongoose.connection.readyState === 1 ? 'Connected' : 'Not Connected');
    
    // List collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('📁 Collections:', collections.length > 0 ? collections.map(c => c.name).join(', ') : 'No collections yet');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    process.exit(1);
  }
};

testConnection();
