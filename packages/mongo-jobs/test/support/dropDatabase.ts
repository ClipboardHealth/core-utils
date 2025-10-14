import mongoose from "mongoose";

/**
 * Drop the provided database.
 */
export async function dropDatabase(uri: string): Promise<void> {
  await mongoose.connect(uri);
  await mongoose.connection.db!.dropDatabase();
  await mongoose.disconnect();
}
