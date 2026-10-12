import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { EVENT_STATUSES, type EventStatus } from '../types/event.js';
import {
  ServiceError,
  createEvent,
  getEventsByDate,
  getEventsByDateRange,
  getEventsByStatus,
  updateEventStatus,
} from '../services/eventService.js';

const statusSchema = z.enum([...EVENT_STATUSES] as [EventStatus, ...EventStatus[]]);

function toolTextResult(data: unknown): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function toolErrorResult(error: ServiceError): CallToolResult {
  const payload = {
    error: true,
    message: error.message,
    code: error.code ?? 'INTERNAL_ERROR',
    details: error.details ?? null,
  };
  return toolTextResult(payload);
}

async function runTool(handler: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const result = await handler();
    return toolTextResult(result);
  } catch (err) {
    if (err instanceof ServiceError) {
      return toolErrorResult(err);
    }
    console.error('[MCP tool error]', err);
    return toolErrorResult(new ServiceError('Unexpected server error', { code: 'INTERNAL_ERROR', statusCode: 500 }));
  }
}

/** Register all event-management MCP tools on the given McpServer instance. */
export function registerEventTools(server: McpServer): void {
  server.registerTool(
    'create_event',
    {
      description:
        'Create a new event from a client inquiry. Saves client contact info, event details, optional budget/advance, and initial status (default: pending).',
      inputSchema: {
        clientName: z.string().min(1).describe('Full name of the client'),
        phoneNumber: z.string().min(1).describe('Client phone number with country code if available'),
        eventTitle: z.string().min(1).describe('Title or type of event (e.g. wedding reception)'),
        eventDate: z.string().describe('Event date/time in ISO 8601 format'),
        status: statusSchema.optional().describe('Initial workflow status; defaults to pending'),
        advanceAmount: z.number().min(0).optional().describe('Advance payment received'),
        totalBudget: z.number().min(0).optional().describe('Quoted or agreed total budget'),
        notes: z.string().optional().describe('Free-form notes from the inquiry'),
      },
    },
    async (args) =>
      runTool(async () => {
        const event = await createEvent(args);
        return { success: true, event };
      })
  );

  server.registerTool(
    'get_events_by_date',
    {
      description:
        'Retrieve events for a specific calendar day, or for an inclusive date range. Provide either `date` OR both `startDate` and `endDate` (ISO 8601).',
      inputSchema: {
        date: z.string().optional().describe('Single day to query (ISO 8601)'),
        startDate: z.string().optional().describe('Range start (ISO 8601), used with endDate'),
        endDate: z.string().optional().describe('Range end (ISO 8601), used with startDate'),
      },
    },
    async (args) =>
      runTool(async () => {
        const { date, startDate, endDate } = args;

        if (date) {
          const events = await getEventsByDate(date);
          return { mode: 'single_day', date, count: events.length, events };
        }

        if (startDate && endDate) {
          const events = await getEventsByDateRange(startDate, endDate);
          return { mode: 'range', startDate, endDate, count: events.length, events };
        }

        throw new ServiceError('Provide either `date` or both `startDate` and `endDate`', {
          code: 'VALIDATION_ERROR',
        });
      })
  );

  server.registerTool(
    'get_events_by_status',
    {
      description:
        'Filter events by workflow status: pending, advance_paid, confirmed, completed, or cancelled.',
      inputSchema: {
        status: statusSchema.describe('Event status to filter by'),
        limit: z.number().int().min(1).max(500).optional().describe('Max records (default 100)'),
        skip: z.number().int().min(0).optional().describe('Pagination offset (default 0)'),
      },
    },
    async (args) =>
      runTool(async () => {
        const { status, limit, skip } = args;
        return getEventsByStatus(status, { limit, skip });
      })
  );

  server.registerTool(
    'update_event_status',
    {
      description:
        'Update an event by MongoDB id: change status and/or advanceAmount, totalBudget, and notes.',
      inputSchema: {
        eventId: z.string().min(1).describe('Event document id'),
        status: statusSchema.optional().describe('New workflow status'),
        advanceAmount: z.number().min(0).optional().describe('Updated advance payment amount'),
        totalBudget: z.number().min(0).optional().describe('Updated total budget'),
        notes: z.string().optional().describe('Replace or append context in notes (replaces field)'),
      },
    },
    async (args) =>
      runTool(async () => {
        const { eventId, ...updates } = args;
        const event = await updateEventStatus(eventId, updates);
        return { success: true, event };
      })
  );
}
