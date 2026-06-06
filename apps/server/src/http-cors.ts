import type { RequestHandler } from "express";

export interface HttpCorsOptions {
  origin: string;
}

const ALLOWED_HEADERS = "Authorization, Content-Type";
const ALLOWED_METHODS = "GET, POST, OPTIONS";

export function createHttpCorsMiddleware(options: HttpCorsOptions): RequestHandler {
  const allowedOrigin = options.origin.trim();

  return (request, response, next) => {
    const requestOrigin = request.header("origin");

    if (!requestOrigin) {
      if (request.method === "OPTIONS") {
        response.sendStatus(204);
        return;
      }

      next();
      return;
    }

    if (requestOrigin !== allowedOrigin) {
      if (request.method === "OPTIONS") {
        response.sendStatus(403);
        return;
      }

      next();
      return;
    }

    response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
    response.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
    response.setHeader("Vary", "Origin");

    if (request.method === "OPTIONS") {
      response.sendStatus(204);
      return;
    }

    next();
  };
}
