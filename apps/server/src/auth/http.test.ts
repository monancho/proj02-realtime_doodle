import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import {
  type AuthenticatedRequest,
  createHttpAuthMiddleware
} from "./http";

function createProtectedApp(verifier: Parameters<typeof createHttpAuthMiddleware>[0]) {
  const app = express();

  app.get(
    "/protected",
    createHttpAuthMiddleware(verifier),
    (request: AuthenticatedRequest, response) => {
      response.json({
        firebaseUid: request.auth?.user.firebaseUid
      });
    }
  );

  return app;
}

describe("createHttpAuthMiddleware", () => {
  it("attaches auth context for a valid bearer token", async () => {
    const verifier = {
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: "firebase-uid",
        firebase: {
          sign_in_provider: "google.com"
        }
      })
    };

    const response = await request(createProtectedApp(verifier))
      .get("/protected")
      .set("Authorization", "Bearer test-token")
      .expect(200);

    expect(response.body).toEqual({ firebaseUid: "firebase-uid" });
    expect(verifier.verifyIdToken).toHaveBeenCalledWith("test-token");
  });

  it("rejects non-Google Firebase providers without exposing token values", async () => {
    const verifier = {
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: "firebase-uid",
        firebase: {
          sign_in_provider: "password"
        }
      })
    };

    const response = await request(createProtectedApp(verifier))
      .get("/protected")
      .set("Authorization", "Bearer test-token")
      .expect(401);

    expect(response.body).toEqual({
      error: {
        code: "AUTH_PROVIDER_UNSUPPORTED",
        message: "Only Google sign-in is supported."
      }
    });
    expect(JSON.stringify(response.body)).not.toContain("test-token");
  });

  it("returns a safe auth error when token is missing", async () => {
    const verifier = {
      verifyIdToken: vi.fn()
    };

    const response = await request(createProtectedApp(verifier))
      .get("/protected")
      .expect(401);

    expect(response.body).toEqual({
      error: {
        code: "AUTH_TOKEN_MISSING",
        message: "Authentication is required."
      }
    });
    expect(verifier.verifyIdToken).not.toHaveBeenCalled();
  });
});
