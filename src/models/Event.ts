import mongoose, { type Document, type Model, Schema } from 'mongoose';
import { EVENT_STATUSES, type EventStatus } from '../types/event.js';

export interface IEvent {
  clientName: string;
  phoneNumber: string;
  eventTitle: string;
  eventDate: Date;
  status: EventStatus;
  advanceAmount: number;
  totalBudget: number;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

export type EventDocument = Document<unknown, object, IEvent> & IEvent;

interface EventModel extends Model<IEvent> {}

const eventSchema = new Schema<IEvent>(
  {
    clientName: {
      type: String,
      required: [true, 'clientName is required'],
      trim: true,
      maxlength: 200,
    },
    phoneNumber: {
      type: String,
      required: [true, 'phoneNumber is required'],
      trim: true,
      maxlength: 30,
    },
    eventTitle: {
      type: String,
      required: [true, 'eventTitle is required'],
      trim: true,
      maxlength: 300,
    },
    eventDate: {
      type: Date,
      required: [true, 'eventDate is required'],
      index: true,
    },
    status: {
      type: String,
      enum: {
        values: [...EVENT_STATUSES],
        message: `status must be one of: ${EVENT_STATUSES.join(', ')}`,
      },
      default: 'pending',
      index: true,
    },
    advanceAmount: {
      type: Number,
      min: [0, 'advanceAmount cannot be negative'],
      default: 0,
    },
    totalBudget: {
      type: Number,
      min: [0, 'totalBudget cannot be negative'],
      default: 0,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: '',
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

eventSchema.index({ eventDate: 1, status: 1 });

export const Event =
  (mongoose.models.Event as EventModel | undefined) ??
  mongoose.model<IEvent, EventModel>('Event', eventSchema);
