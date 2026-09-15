const mongoose = require('mongoose');
const logger = require('./logger');

async function connectDb(uri = process.env.MONGO_URI) {
  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB connection error', { error: err.message });
  });

  await mongoose.connect(uri);
  logger.info('MongoDB connected');
  return mongoose.connection;
}

module.exports = { connectDb, mongoose };
