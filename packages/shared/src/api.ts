export interface HealthResponse {
  status: "ok";
  service: "realtime-doodle-relay-server";
  timestamp: string;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}
