import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "./app";

describe("GET /health", () => {
  it("returns server health status", async () => {
    const response = await request(createApp()).get("/health").expect(200);

    expect(response.body).toMatchObject({
      status: "ok",
      service: "realtime-doodle-relay-server"
    });
    expect(typeof response.body.timestamp).toBe("string");
  });
});
