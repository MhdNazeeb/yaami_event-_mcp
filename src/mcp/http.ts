import { timingSafeEqual } from 'node:crypto';
import type { Express, NextFunction, Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { env } from '../config/env.js';
import { createMcpServer } from './server.js';

function unauthorized(res: Response): void {
  res.status(401).json({
    jsonrpc: '2.0',
    error: { code: -32001, message: 'Unauthorized' },
    id: null,
  });
}

/** Bearer token check for remote MCP clients (Claude connectors, Cursor HTTP, etc.). */
export function requireMcpBearer(req: Request, res: Response, next: NextFunction): void {
  if (!env.mcp.apiToken) {
    next();
    return;
  }

  const auth = req.headers.authorization ?? '';
  const expected = `Bearer ${env.mcp.apiToken}`;
  if (
    auth.length === expected.length &&
    timingSafeEqual(Buffer.from(auth), Buffer.from(expected))
  ) {
    next();
    return;
  }

  unauthorized(res);
}

const methodNotAllowed = (_req: Request, res: Response) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed.' },
    id: null,
  });
};

/**
 * Streamable HTTP MCP endpoint for hosted deployments (Render, etc.).
 * Stateless mode: new transport per request for horizontal scaling.
 */
export function mountMcpHttpRoutes(app: Express): void {
  app.post('/mcp', requireMcpBearer, async (req: Request, res: Response) => {
    const server = createMcpServer();
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on('close', () => {
        transport.close();
        server.close();
      });
    } catch (error) {
      console.error('[MCP HTTP error]', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  app.get('/mcp', requireMcpBearer, methodNotAllowed);
  app.delete('/mcp', requireMcpBearer, methodNotAllowed);
}
