import express, { type Express } from "express";

import { handleHealthRequest } from "./health";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json());

  app.get("/health", (_request, response) => {
    const healthResponse = handleHealthRequest({
      method: "GET",
      path: "/health"
    });

    response
      .status(healthResponse.statusCode)
      .set(healthResponse.headers)
      .json(healthResponse.body);
  });

  return app;
}
