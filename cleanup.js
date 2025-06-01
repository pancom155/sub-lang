const mongoose = require('mongoose');

async function dropOldEmailIndex() {
  try {
    await mongoose.connect('mongodb+srv://aguilarcyruzjaeg:qwaswex12@cluster0.0onfw.mongodb.net/Cafe'); // Replace with your actual DB URI

    const collection = mongoose.connection.collection('staffs');
    await collection.dropIndex('s_email_1'); // This is the name of the old index

    console.log('Old index `s_email_1` dropped successfully.');
    await mongoose.disconnect();
  } catch (err) {
    console.error('Error dropping index:', err);
  }
}

dropOldEmailIndex();
