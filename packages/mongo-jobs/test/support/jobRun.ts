import mongoose from "mongoose";

interface JobRunType {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;

  myNumber: number;
  meta: Record<string, string>;
}

const schemaName = "JobRun";
const schema = new mongoose.Schema<JobRunType>(
  {
    myNumber: Number,
    meta: Object,
  },
  {
    timestamps: true,
  },
);

export const JobRun = mongoose.model<JobRunType>(schemaName, schema);
