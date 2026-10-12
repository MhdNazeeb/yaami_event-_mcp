export const EVENT_STATUSES = [
  'pending',
  'advance_paid',
  'confirmed',
  'completed',
  'cancelled',
] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number];

export interface EventRecord {
  id: string;
  clientName: string;
  phoneNumber: string;
  eventTitle: string;
  eventDate: Date;
  status: EventStatus;
  advanceAmount: number;
  totalBudget: number;
  notes: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CreateEventInput {
  clientName: string;
  phoneNumber: string;
  eventTitle: string;
  eventDate: string | Date;
  status?: EventStatus;
  advanceAmount?: number;
  totalBudget?: number;
  notes?: string;
}

export interface UpdateEventInput {
  status?: EventStatus;
  advanceAmount?: number;
  totalBudget?: number;
  notes?: string;
}

export interface EventsByStatusResult {
  status: EventStatus;
  total: number;
  limit: number;
  skip: number;
  events: EventRecord[];
}
