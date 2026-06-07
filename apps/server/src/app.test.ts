import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

describe("Static frontend serving", () => {
  it("serves frontend assets and SPA fallback without intercepting health or API routes", async () => {
    const staticFrontendRoot = await createStaticFrontendFixture();

    try {
      const app = createApp({ staticFrontendRoot });

      const indexResponse = await request(app)
        .get("/room/ABC123")
        .set("Accept", "text/html")
        .expect(200);
      expect(indexResponse.text).toContain("<title>Doodle</title>");

      const assetResponse = await request(app)
        .get("/assets/app.js")
        .expect(200);
      expect(assetResponse.text).toContain("console.log");

      const healthResponse = await request(app).get("/health").expect(200);
      expect(healthResponse.body.service).toBe("realtime-doodle-relay-server");

      const apiResponse = await request(app)
        .get("/api/not-found")
        .set("Accept", "text/html")
        .expect(404);
      expect(apiResponse.text).not.toContain("<title>Doodle</title>");
    } finally {
      await rm(staticFrontendRoot, { recursive: true, force: true });
    }
  });
});

async function createStaticFrontendFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "doodle-web-dist-"));
  const assetsRoot = join(root, "assets");

  await writeFile(
    join(root, "index.html"),
    "<!doctype html><html><head><title>Doodle</title></head><body><div id=\"root\"></div></body></html>"
  );
  await mkdir(assetsRoot);
  await writeFile(join(assetsRoot, "app.js"), "console.log('doodle');");

  return root;
}
