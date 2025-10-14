import mongoose from "mongoose";

const DEFAULT_CONNECTION_OPTIONS = {
  maxPoolSize: 10,
};

export async function defaultConnectToMongo(databaseUrl: string) {
  return await mongoose.connect(databaseUrl, DEFAULT_CONNECTION_OPTIONS);
}

export async function createMongoConnection(databaseUrl: string): Promise<mongoose.Connection> {
  return await mongoose.createConnection(databaseUrl, DEFAULT_CONNECTION_OPTIONS).asPromise();
}

export async function createMongoSession() {
  return await mongoose.startSession();
}
