import dotenv from 'dotenv';

dotenv.config();

const required = ['MONGODB_URI'] as const;

for (const key of required) {
  if (!process.env[key]?.trim()) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  mongodbUri: process.env.MONGODB_URI!.trim(),
  mcp: {
    name: process.env.MCP_SERVER_NAME ?? 'yaami-event-mcp',
    version: process.env.MCP_SERVER_VERSION ?? '1.0.0',
    /** Set on Render (or locally) to require Authorization: Bearer … on POST /mcp */
    apiToken: process.env.MCP_API_TOKEN?.trim() || undefined,
  },
} as const;

export { EVENT_STATUSES } from '../types/event.js';
export type { EventStatus } from '../types/event.js';
