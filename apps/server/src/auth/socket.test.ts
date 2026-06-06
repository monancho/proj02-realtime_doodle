import type { Socket } from "socket.io";
import { describe, expect, it, vi } from "vitest";

import { createSocketAuthMiddleware } from "./socket";

function createMockSocket(auth: unknown): Socket {
  return {
    data: {},
    handshake: { auth }
  } as Socket;
}

describe("createSocketAuthMiddleware", () => {
  it("attaches auth context for a valid handshake token", async () => {
    const verifier = {
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: "firebase-uid",
        firebase: {
          sign_in_provider: "google.com"
        }
      })
    };
    const socket = createMockSocket({ token: "test-token" });
    const next = vi.fn();

    await createSocketAuthMiddleware(verifier)(socket, next);

    expect(socket.data.auth.user.firebaseUid).toBe("firebase-uid");
    expect(verifier.verifyIdToken).toHaveBeenCalledWith("test-token");
    expect(next).toHaveBeenCalledWith();
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
    const socket = createMockSocket({ token: "test-token" });
    const next = vi.fn();

    await createSocketAuthMiddleware(verifier)(socket, next);

    expect(socket.data.authError).toEqual({
      error: {
        code: "AUTH_PROVIDER_UNSUPPORTED",
        message: "Only Google sign-in is supported."
      }
    });
    expect(JSON.stringify(socket.data.authError)).not.toContain("test-token");
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect(next.mock.calls[0]?.[0].name).toBe("AUTH_PROVIDER_UNSUPPORTED");
  });

  it("rejects a socket without exposing token values", async () => {
    const verifier = {
      verifyIdToken: vi.fn()
    };
    const socket = createMockSocket({});
    const next = vi.fn();

    await createSocketAuthMiddleware(verifier)(socket, next);

    expect(verifier.verifyIdToken).not.toHaveBeenCalled();
    expect(socket.data.authError).toEqual({
      error: {
        code: "AUTH_TOKEN_MISSING",
        message: "Authentication is required."
      }
    });
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect(next.mock.calls[0]?.[0].name).toBe("AUTH_TOKEN_MISSING");
  });
});
