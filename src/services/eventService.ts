import mongoose from 'mongoose';
import { EVENT_STATUSES, type CreateEventInput, type EventRecord, type EventsByStatusResult, type EventStatus, type UpdateEventInput } from '../types/event.js';
import { Event, type EventDocument } from '../models/Event.js';

export interface ServiceErrorOptions {
  code?: string;
  statusCode?: number;
  details?: unknown;
}

export class ServiceError extends Error {
  code: string;
  statusCode: number;
  details: unknown;

  constructor(message: string, { code = 'SERVICE_ERROR', statusCode = 400, details = null }: ServiceErrorOptions = {}) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

function assertNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ServiceError(`${fieldName} must be a non-empty string`, {
      code: 'VALIDATION_ERROR',
      details: { field: fieldName },
    });
  }
  return value.trim();
}

function parseEventDate(value: string | Date, fieldName = 'eventDate'): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ServiceError(`Invalid ${fieldName}`, {
      code: 'VALIDATION_ERROR',
      details: { field: fieldName, value },
    });
  }
  return date;
}

function isEventStatus(status: string): status is EventStatus {
  return (EVENT_STATUSES as readonly string[]).includes(status);
}

function assertValidStatus(status: string): asserts status is EventStatus {
  if (!isEventStatus(status)) {
    throw new ServiceError(`Invalid status. Allowed: ${EVENT_STATUSES.join(', ')}`, {
      code: 'VALIDATION_ERROR',
      details: { field: 'status', value: status },
    });
  }
}

function assertNonNegativeNumber(value: unknown, fieldName: string): number {
  const num = Number(value);
  if (Number.isNaN(num) || num < 0) {
    throw new ServiceError(`${fieldName} must be a non-negative number`, {
      code: 'VALIDATION_ERROR',
      details: { field: fieldName, value },
    });
  }
  return num;
}

/** Start/end of calendar day in UTC for date-only queries. */
function dayBoundsUtc(isoDateString: string | Date) {
  const d = parseEventDate(isoDateString, 'date');
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
  return { start, end };
}

function toPlainEvent(doc: EventDocument): EventRecord {
  return doc.toJSON() as unknown as EventRecord;
}

function leanToEventRecord(e: Record<string, unknown>): EventRecord {
  const { _id, __v, ...rest } = e;
  return {
    ...(rest as Omit<EventRecord, 'id'>),
    id: String(_id),
  };
}

/**
 * Create a new event from client inquiry details.
 */
export async function createEvent(payload: CreateEventInput): Promise<EventRecord> {
  const clientName = assertNonEmptyString(payload.clientName, 'clientName');
  const phoneNumber = assertNonEmptyString(payload.phoneNumber, 'phoneNumber');
  const eventTitle = assertNonEmptyString(payload.eventTitle, 'eventTitle');
  const eventDate = parseEventDate(payload.eventDate, 'eventDate');

  const status = payload.status ?? 'pending';
  assertValidStatus(status);

  const advanceAmount =
    payload.advanceAmount !== undefined && payload.advanceAmount !== null
      ? assertNonNegativeNumber(payload.advanceAmount, 'advanceAmount')
      : 0;

  const totalBudget =
    payload.totalBudget !== undefined && payload.totalBudget !== null
      ? assertNonNegativeNumber(payload.totalBudget, 'totalBudget')
      : 0;

  const notes = typeof payload.notes === 'string' ? payload.notes.trim() : '';

  try {
    const event = await Event.create({
      clientName,
      phoneNumber,
      eventTitle,
      eventDate,
      status,
      advanceAmount,
      totalBudget,
      notes,
    });
    return toPlainEvent(event);
  } catch (err) {
    if (err instanceof Error && err.name === 'ValidationError') {
      throw new ServiceError(err.message, { code: 'VALIDATION_ERROR', statusCode: 400 });
    }
    throw err;
  }
}

/**
 * Fetch events on a single calendar day (UTC boundaries).
 */
export async function getEventsByDate(date: string | Date): Promise<EventRecord[]> {
  const { start, end } = dayBoundsUtc(date);
  const events = await Event.find({ eventDate: { $gte: start, $lte: end } })
    .sort({ eventDate: 1 })
    .lean();
  return events.map((e) => leanToEventRecord(e as Record<string, unknown>));
}

/**
 * Fetch events whose eventDate falls within [startDate, endDate] (inclusive, UTC day bounds).
 */
export async function getEventsByDateRange(startDate: string | Date, endDate: string | Date): Promise<EventRecord[]> {
  const startBounds = dayBoundsUtc(startDate);
  const endBounds = dayBoundsUtc(endDate);

  if (startBounds.start > endBounds.end) {
    throw new ServiceError('startDate must be on or before endDate', {
      code: 'VALIDATION_ERROR',
      details: { startDate, endDate },
    });
  }

  const events = await Event.find({
    eventDate: { $gte: startBounds.start, $lte: endBounds.end },
  })
    .sort({ eventDate: 1 })
    .lean();

  return events.map((e) => leanToEventRecord(e as Record<string, unknown>));
}

/**
 * List events filtered by workflow status.
 */
export async function getEventsByStatus(
  status: EventStatus,
  { limit = 100, skip = 0 }: { limit?: number; skip?: number } = {}
): Promise<EventsByStatusResult> {
  assertValidStatus(status);

  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const safeSkip = Math.max(Number(skip) || 0, 0);

  const events = await Event.find({ status })
    .sort({ eventDate: 1, createdAt: -1 })
    .skip(safeSkip)
    .limit(safeLimit)
    .lean();

  const total = await Event.countDocuments({ status });

  return {
    status,
    total,
    limit: safeLimit,
    skip: safeSkip,
    events: events.map((e) => leanToEventRecord(e as Record<string, unknown>)),
  };
}

/**
 * Update status and/or payment fields for an event.
 */
export async function updateEventStatus(eventId: string, updates: UpdateEventInput): Promise<EventRecord> {
  if (!mongoose.isValidObjectId(eventId)) {
    throw new ServiceError('Invalid event id', {
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      details: { eventId },
    });
  }

  const patch: Partial<IEventPatch> = {};

  if (updates.status !== undefined) {
    assertValidStatus(updates.status);
    patch.status = updates.status;
  }

  if (updates.advanceAmount !== undefined) {
    patch.advanceAmount = assertNonNegativeNumber(updates.advanceAmount, 'advanceAmount');
  }

  if (updates.totalBudget !== undefined) {
    patch.totalBudget = assertNonNegativeNumber(updates.totalBudget, 'totalBudget');
  }

  if (updates.notes !== undefined) {
    patch.notes = typeof updates.notes === 'string' ? updates.notes.trim() : '';
  }

  if (Object.keys(patch).length === 0) {
    throw new ServiceError('At least one field to update is required (status, advanceAmount, totalBudget, notes)', {
      code: 'VALIDATION_ERROR',
    });
  }

  const event = await Event.findByIdAndUpdate(eventId, { $set: patch }, { new: true, runValidators: true });

  if (!event) {
    throw new ServiceError('Event not found', { code: 'NOT_FOUND', statusCode: 404, details: { eventId } });
  }

  return toPlainEvent(event);
}

type IEventPatch = Pick<EventRecord, 'status' | 'advanceAmount' | 'totalBudget' | 'notes'>;

export async function getEventById(eventId: string): Promise<EventRecord> {
  if (!mongoose.isValidObjectId(eventId)) {
    throw new ServiceError('Invalid event id', { code: 'VALIDATION_ERROR', statusCode: 400 });
  }
  const event = await Event.findById(eventId);
  if (!event) {
    throw new ServiceError('Event not found', { code: 'NOT_FOUND', statusCode: 404 });
  }
  return toPlainEvent(event);
}
