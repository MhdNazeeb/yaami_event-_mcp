import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { type Express, type NextFunction, type Request, type Response } from 'express';
import { mountMcpHttpRoutes } from './mcp/http.js';
import {
  ServiceError,
  createEvent,
  deleteEvent,
  getEventById,
  getEventsByDate,
  getEventsByDateRange,
  getEventsByStatus,
  updateEvent,
} from './services/eventService.js';
import type { CreateEventInput, EventStatus, UpdateEventInput } from './types/event.js';

function routeParam(value: string | string[] | undefined): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0] ?? '';
  return '';
}

/**
 * Express application: health checks and optional REST mirror of event operations.
 */
export function createApp(): Express {
  const renderHost = process.env.RENDER_EXTERNAL_HOSTNAME?.trim();
  const app = createMcpExpressApp({
    host: '0.0.0.0',
    allowedHosts: renderHost ? [renderHost] : undefined,
  });

  mountMcpHttpRoutes(app);

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'event-mcp-server', mcp: '/mcp' });
  });

  app.post('/api/events', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const event = await createEvent(req.body as CreateEventInput);
      res.status(201).json(event);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/events/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const event = await getEventById(routeParam(req.params.id));
      res.json(event);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/events', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { date, startDate, endDate, status, limit, skip } = req.query;

      if (status) {
        const result = await getEventsByStatus(String(status) as EventStatus, {
          limit: limit ? Number(limit) : undefined,
          skip: skip ? Number(skip) : undefined,
        });
        return res.json(result);
      }

      if (date) {
        const events = await getEventsByDate(String(date));
        return res.json({ count: events.length, events });
      }

      if (startDate && endDate) {
        const events = await getEventsByDateRange(String(startDate), String(endDate));
        return res.json({ count: events.length, events });
      }

      throw new ServiceError('Query with status, date, or startDate+endDate', { code: 'VALIDATION_ERROR' });
    } catch (err) {
      next(err);
    }
  });

  app.patch('/api/events/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const event = await updateEvent(routeParam(req.params.id), req.body as UpdateEventInput);
      res.json(event);
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/events/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await deleteEvent(routeParam(req.params.id));
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({
        error: err.message,
        code: err.code,
        details: err.details,
      });
    }

    console.error('[HTTP error]', err);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  });

  return app;
}
