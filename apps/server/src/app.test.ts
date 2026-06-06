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

describe("HTTP CORS", () => {
  it("allows browser API preflight requests from the configured client origin", async () => {
    const app = createApp({ corsOrigin: "http://localhost:5173" });

    const response = await request(app)
      .options("/api/users/me")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "authorization,content-type")
      .expect(204);

    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173"
    );
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["access-control-allow-headers"]).toContain(
      "Authorization"
    );
  });

  it("rejects browser API preflight requests from another origin", async () => {
    const app = createApp({ corsOrigin: "http://localhost:5173" });

    await request(app)
      .options("/api/users/me")
      .set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", "POST")
      .expect(403);
  });

  it("allows Vite fallback localhost ports in local development mode", async () => {
    const app = createApp({
      allowLocalhostDevOrigins: true,
      corsOrigin: "http://localhost:5173"
    });

    const response = await request(app)
      .options("/api/users/me")
      .set("Origin", "http://localhost:5174")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "authorization,content-type")
      .expect(204);

    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5174"
    );
  });
});
