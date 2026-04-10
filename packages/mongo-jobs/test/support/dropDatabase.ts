import mongoose from "mongoose";

/**
 * Drop the provided database.
 */
export async function dropDatabase(uri: string): Promise<void> {
  await mongoose.connect(uri);

  const { db } = mongoose.connection;
  if (!db) {
    throw new Error("Database connection not established");
  }

  await db.dropDatabase();
  await mongoose.disconnect();
}
