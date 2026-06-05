import type { AuthContext } from "@doodle/shared";
import type { NextFunction, Request, RequestHandler, Response } from "express";

import { AuthError, isAuthError, toAuthErrorResponse } from "./errors";
import {
  extractBearerToken,
  type TokenVerifier,
  verifyAuthToken
} from "./tokens";

export interface AuthenticatedRequest extends Request {
  auth?: AuthContext;
}

export function createHttpAuthMiddleware(
  verifier: TokenVerifier
): RequestHandler {
  return async (
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction
  ) => {
    try {
      const token = extractBearerToken(request.header("authorization"));
      request.auth = await verifyAuthToken(token, verifier);
      next();
    } catch (error) {
      const authError = isAuthError(error)
        ? error
        : new AuthError("AUTH_TOKEN_INVALID");

      response.status(authError.statusCode).json(toAuthErrorResponse(authError));
    }
  };
}
