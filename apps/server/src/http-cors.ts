import type { RequestHandler } from "express";

export interface HttpCorsOptions {
  allowLocalhostDevOrigins?: boolean;
  origins: string[];
}

const ALLOWED_HEADERS = "Authorization, Content-Type";
const ALLOWED_METHODS = "GET, POST, OPTIONS";
const LOCALHOST_DEV_ORIGIN_PATTERN =
  /^http:\/\/(?:localhost|127\.0\.0\.1):517[0-9]$/;

export function createHttpCorsMiddleware(options: HttpCorsOptions): RequestHandler {
  const allowedOrigins = options.origins.map((origin) => origin.trim()).filter(Boolean);

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

    if (!isOriginAllowed(requestOrigin, allowedOrigins, options.allowLocalhostDevOrigins)) {
      if (request.method === "OPTIONS") {
        response.sendStatus(403);
        return;
      }

      next();
      return;
    }

    response.setHeader("Access-Control-Allow-Origin", requestOrigin);
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

export function createAllowedCorsOrigins(origin: string): string[] {
  const trimmedOrigin = origin.trim();
  return trimmedOrigin ? [trimmedOrigin] : [];
}

function isOriginAllowed(
  origin: string,
  allowedOrigins: string[],
  allowLocalhostDevOrigins = false
): boolean {
  return (
    allowedOrigins.includes(origin) ||
    (allowLocalhostDevOrigins && LOCALHOST_DEV_ORIGIN_PATTERN.test(origin))
  );
}
