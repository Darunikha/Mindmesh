import mongoose from 'mongoose';
import env from './env.js';

let memoryServer = null;

export async function connectDatabase(uriOverride) {
  let uri = uriOverride || env.MONGODB_URI;

  if (!uri && env.USE_IN_MEMORY_DB) {
    // Dev-only convenience: an ephemeral MongoDB that disappears on restart.
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri('mindmesh');
    console.warn('[mindmesh] Using in-memory MongoDB. Data will be lost when the server stops.');
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  await mongoose.connection.syncIndexes();
  return mongoose.connection;
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}
