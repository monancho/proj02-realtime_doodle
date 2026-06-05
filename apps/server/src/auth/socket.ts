import type { AuthErrorResponse, SocketAuthPayload } from "@doodle/shared";
import type { Socket } from "socket.io";

import { AuthError, isAuthError } from "./errors";
import { type TokenVerifier, verifyAuthToken } from "./tokens";

export type SocketNext = (error?: Error) => void;

export function createSocketAuthMiddleware(verifier: TokenVerifier) {
  return async (socket: Socket, next: SocketNext): Promise<void> => {
    try {
      const token = extractSocketToken(socket.handshake.auth);
      socket.data.auth = await verifyAuthToken(token, verifier);
      next();
    } catch (error) {
      const authError = isAuthError(error)
        ? error
        : new AuthError("AUTH_TOKEN_INVALID");
      const socketError = new Error(authError.message);

      socketError.name = authError.code;
      socket.data.authError = toSocketAuthError(authError);
      next(socketError);
    }
  };
}

function extractSocketToken(auth: unknown): string {
  const payload = auth as Partial<SocketAuthPayload> | undefined;

  if (!payload || typeof payload.token !== "string" || !payload.token.trim()) {
    throw new AuthError("AUTH_TOKEN_MISSING");
  }

  return payload.token.trim();
}

function toSocketAuthError(error: AuthError): AuthErrorResponse {
  return {
    error: {
      code: error.code,
      message: error.message
    }
  };
}
