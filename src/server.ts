import { connectDatabase, disconnectDatabase } from './config/db.js';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { startMcpStdioServer } from './mcp/server.js';

const runMcp = process.argv.includes('--mcp') || process.env.MCP_TRANSPORT === 'stdio';

async function shutdown(signal: string): Promise<void> {
  console.error(`[shutdown] Received ${signal}, closing connections...`);
  await disconnectDatabase();
  process.exit(0);
}

async function main(): Promise<void> {
  await connectDatabase();
  console.error(`[db] Connected to MongoDB (${env.nodeEnv})`);

  if (runMcp) {
    await startMcpStdioServer();
    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    return;
  }

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`[http] Express listening on http://localhost:${env.port}`);
  });

  const onShutdown = (signal: string) => {
    console.log(`[shutdown] ${signal}`);
    server.close(() => {
      void disconnectDatabase().then(() => process.exit(0));
    });
  };

  process.on('SIGINT', () => onShutdown('SIGINT'));
  process.on('SIGTERM', () => onShutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  console.error('[fatal]', err);
  process.exit(1);
});
