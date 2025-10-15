import mongoose from "mongoose";

export interface ScheduleType<T> {
  _id: mongoose.Types.ObjectId;
  name: string;
  cronExpression: string;
  timeZone: string;
  handlerName: string;
  queue: string;
  data: T;
}

export const ScheduleSchemaName = "BackgroundJobSchedule";

const ScheduleSchema = new mongoose.Schema<ScheduleType<unknown>>({
  name: String,
  cronExpression: String,
  timeZone: String,
  handlerName: String,
  data: {},
});

ScheduleSchema.index({ name: 1 }, { unique: true });

export { ScheduleSchema };
