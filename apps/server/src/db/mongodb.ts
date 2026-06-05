import { MongoClient, type Db } from "mongodb";

import type { ServerEnv } from "../config/env";

export interface MongoDbConnection {
  client: MongoClient;
  db: Db;
}

export function createMongoClient(uri: string): MongoClient {
  return new MongoClient(uri);
}

export async function connectMongoDb(
  env: Pick<ServerEnv, "MONGODB_URI" | "MONGODB_DB_NAME">,
  client = createMongoClient(env.MONGODB_URI)
): Promise<MongoDbConnection> {
  await client.connect();

  return {
    client,
    db: client.db(env.MONGODB_DB_NAME)
  };
}
