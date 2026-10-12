import mongoose, { type Connection } from 'mongoose';
import { env } from './env.js';

let isConnected = false;

/**
 * Connect to MongoDB with sensible defaults for production workloads.
 */
export async function connectDatabase(): Promise<Connection> {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  mongoose.set('strictQuery', true);

   await mongoose.connect(env.mongodbUri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10_000,
  });

  isConnected = true;

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
  });

  return mongoose.connection;
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
  }
}
