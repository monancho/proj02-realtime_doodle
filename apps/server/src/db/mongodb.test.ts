import { describe, expect, it, vi } from "vitest";

import { connectMongoDb } from "./mongodb";

describe("connectMongoDb", () => {
  it("connects with the configured database name without exposing the URI", async () => {
    const db = vi.fn();
    const client = {
      connect: vi.fn().mockResolvedValue(undefined),
      db
    };

    db.mockReturnValue({ databaseName: "realtime-doodle-relay" });

    const connection = await connectMongoDb(
      {
        MONGODB_URI: "placeholder-uri",
        MONGODB_DB_NAME: "realtime-doodle-relay"
      },
      client as never
    );

    expect(client.connect).toHaveBeenCalledOnce();
    expect(db).toHaveBeenCalledWith("realtime-doodle-relay");
    expect(connection.db).toEqual({ databaseName: "realtime-doodle-relay" });
  });
});
