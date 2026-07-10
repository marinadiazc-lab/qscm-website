import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

const missingDatabaseClient = new Proxy(
  {},
  {
    get() {
      throw new Error("DATABASE_URL is required to use the database client.");
    },
  },
);

const queryClient = databaseUrl
  ? postgres(databaseUrl, {
      max: 10,
      prepare: false,
    })
  : undefined;

export const db = queryClient
  ? drizzle(queryClient, { schema })
  : (missingDatabaseClient as ReturnType<typeof drizzle<typeof schema>>);
export type DbClient = typeof db;
export { schema };
