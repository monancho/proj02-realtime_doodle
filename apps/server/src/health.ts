import type { ApiErrorResponse, HealthResponse } from "@doodle/shared";

export interface HttpRequestLike {
  method: string;
  path: string;
}

export interface HttpResponseLike<TBody = HealthResponse | ApiErrorResponse> {
  statusCode: number;
  headers: Record<string, string>;
  body: TBody;
}

export function createHealthResponse(now = new Date()): HealthResponse {
  return {
    status: "ok",
    service: "realtime-doodle-relay-server",
    timestamp: now.toISOString()
  };
}

export function handleHealthRequest(
  request: HttpRequestLike
): HttpResponseLike {
  const headers = { "content-type": "application/json; charset=utf-8" };

  if (request.method !== "GET" || request.path !== "/health") {
    return {
      statusCode: 404,
      headers,
      body: {
        error: {
          code: "NOT_FOUND",
          message: "Route not found"
        }
      }
    };
  }

  return {
    statusCode: 200,
    headers,
    body: createHealthResponse()
  };
}
