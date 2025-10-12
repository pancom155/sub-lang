require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  try {
    const mongoURI = process.env.MONGO_URI;

    if (!mongoURI) {
      throw new Error(' MONGO_URI not found in .env file');
    }

    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('staffs');

    console.log('🔍 Checking existing indexes...');
    const indexes = await collection.indexes();
    console.log(indexes);

    const badIndex = indexes.find(i => i.name === 'email_1');
    if (badIndex) {
      console.log(' Dropping bad index: email_1');
      await collection.dropIndex('email_1');
      console.log('Dropped index email_1');
    } else {
      console.log('No bad index found');
    }

    console.log('Creating correct indexes...');
    await collection.createIndex({ s_email: 1 }, { unique: true });
    await collection.createIndex({ s_username: 1 }, { unique: true });

    console.log('Fixed indexes successfully.');
    await mongoose.disconnect();
  } catch (err) {
    console.error('Error fixing indexes:', err.message);
    process.exit(1);
  }
})();
