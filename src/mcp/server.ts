import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { env } from '../config/env.js';
import { registerEventTools } from './tools.js';

/**
 * Build a configured MCP server with all event tools registered.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: env.mcp.name,
      version: env.mcp.version,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  registerEventTools(server);

  return server;
}

/**
 * Run MCP over stdio (for Claude Desktop, Cursor, Inspector, etc.).
 * Uses stderr for logs so stdout stays reserved for the protocol.
 */
export async function startMcpStdioServer(): Promise<McpServer> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[MCP] ${env.mcp.name} v${env.mcp.version} listening on stdio`);
  return server;
}
