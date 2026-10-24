import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  EVENT_STATUSES,
  type CreateEventInput,
  type EventStatus,
  type UpdateEventInput,
} from '../types/event.js';
import {
  ServiceError,
  createEvent,
  deleteEvent,
  getEventsByDate,
  getEventsByDateRange,
  getEventsByStatus,
  updateEvent,
} from '../services/eventService.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<CallToolResult>;

/** Avoids TS2589 from MCP SDK registerTool generic inference with Zod 3. */
function registerEventTool(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: z.ZodTypeAny,
  handler: ToolHandler,
): void {
  const register = server.registerTool.bind(server) as (
    toolName: string,
    config: { description: string; inputSchema: z.ZodTypeAny },
    cb: ToolHandler,
  ) => void;
  register(name, { description, inputSchema }, handler);
}

const createEventSchema = z.object({
  clientName: z.string().min(1).describe('Full name of the client'),
  phoneNumber: z.string().min(1).describe('Client phone number with country code if available'),
  eventTitle: z.string().min(1).describe('Title or type of event (e.g. wedding reception)'),
  eventDate: z.string().describe('Event date/time in ISO 8601 format'),
  status: z.enum(EVENT_STATUSES).optional().describe('Initial workflow status; defaults to pending'),
  advanceAmount: z.number().min(0).optional().describe('Advance payment received'),
  totalBudget: z.number().min(0).optional().describe('Quoted or agreed total budget'),
  notes: z.string().optional().describe('Free-form notes from the inquiry'),
});

const getEventsByDateSchema = z.object({
  date: z.string().optional().describe('Single day to query (ISO 8601)'),
  startDate: z.string().optional().describe('Range start (ISO 8601), used with endDate'),
  endDate: z.string().optional().describe('Range end (ISO 8601), used with startDate'),
});

const getEventsByStatusSchema = z.object({
  status: z.enum(EVENT_STATUSES).describe('Event status to filter by'),
  limit: z.number().int().min(1).max(500).optional().describe('Max records (default 100)'),
  skip: z.number().int().min(0).optional().describe('Pagination offset (default 0)'),
});

const updateEventSchema = z.object({
  eventId: z.string().min(1).describe('Event document id'),
  clientName: z.string().min(1).optional().describe('Updated client name'),
  phoneNumber: z.string().min(1).optional().describe('Updated client phone number'),
  eventTitle: z.string().min(1).optional().describe('Updated event title'),
  eventDate: z.string().optional().describe('Updated event date/time in ISO 8601 format'),
  status: z.enum(EVENT_STATUSES).optional().describe('New workflow status'),
  advanceAmount: z.number().min(0).optional().describe('Updated advance payment amount'),
  totalBudget: z.number().min(0).optional().describe('Updated total budget'),
  notes: z.string().optional().describe('Replace or append context in notes (replaces field)'),
});

const deleteEventSchema = z.object({
  eventId: z.string().min(1).describe('Event document id to delete'),
});

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
  registerEventTool(
    server,
    'create_event',
    'Create a new event from a client inquiry. Saves client contact info, event details, optional budget/advance, and initial status (default: pending).',
    createEventSchema,
    async (args) =>
      runTool(async () => {
        const event = await createEvent(args as unknown as CreateEventInput);
        return { success: true, event };
      }),
  );

  registerEventTool(
    server,
    'get_events_by_date',
    'Retrieve events for a specific calendar day, or for an inclusive date range. Provide either `date` OR both `startDate` and `endDate` (ISO 8601).',
    getEventsByDateSchema,
    async (args) =>
      runTool(async () => {
        const date = args.date as string | undefined;
        const startDate = args.startDate as string | undefined;
        const endDate = args.endDate as string | undefined;

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
      }),
  );

  registerEventTool(
    server,
    'get_events_by_status',
    'Filter events by workflow status: pending, advance_paid, confirmed, completed, or cancelled.',
    getEventsByStatusSchema,
    async (args) =>
      runTool(async () => {
        const status = args.status as EventStatus;
        const limit = args.limit as number | undefined;
        const skip = args.skip as number | undefined;
        return getEventsByStatus(status, { limit, skip });
      }),
  );

  registerEventTool(
    server,
    'update_event',
    'Update any field(s) for an event by MongoDB id: clientName, phoneNumber, eventTitle, eventDate, status, advanceAmount, totalBudget, and/or notes. Only provided fields are updated (partial update).',
    updateEventSchema,
    async (args) =>
      runTool(async () => {
        const { eventId, ...updates } = args as unknown as { eventId: string } & UpdateEventInput;
        const event = await updateEvent(eventId, updates);
        return { success: true, event };
      }),
  );

  registerEventTool(
    server,
    'delete_event',
    'Delete an event by MongoDB id. This operation is irreversible.',
    deleteEventSchema,
    async (args) =>
      runTool(async () => {
        const { eventId } = args as unknown as { eventId: string };
        const result = await deleteEvent(eventId);
        return { success: true, ...result };
      }),
  );
}
