require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');

const PORT = process.env.PORT || 5000;
let MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'crm_jwt_default_secret_dev_key';

if (!process.env.JWT_SECRET) {
  console.warn('[WARN] JWT_SECRET not found in .env, using development default secret.');
}

/**
 * Bootstrap and start the Express server.
 * 
 * Supports:
 * 1. Connecting to any MongoDB URI defined in `process.env.MONGO_URI`.
 * 2. Automatic zero-config in-memory MongoDB fallback via `mongodb-memory-server`
 *    if no local/remote MongoDB instance is configured.
 */
async function startServer() {
  try {
    if (!MONGO_URI || MONGO_URI === 'memory') {
      console.log('[Database] Starting in-memory MongoDB instance (zero-config mode)...');
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const mongod = await MongoMemoryServer.create();
      MONGO_URI = mongod.getUri();
    }

    await mongoose.connect(MONGO_URI);
    console.log('[Database] Connected to MongoDB successfully.');

    app.listen(PORT, () => {
      console.log(`[Server] CRM Backend API listening at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('[Database] Connection failed:', err.message);
    process.exit(1);
  }
}

startServer();
