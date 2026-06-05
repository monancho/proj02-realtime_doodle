import { createServerDependencies, startHttpServer } from "./bootstrap";
import { validateServerEnv } from "./config/env";
import { loadLocalEnvFile } from "./config/load-env";

loadLocalEnvFile();
const validation = validateServerEnv(process.env);

if (!validation.ok) {
  console.error(
    `Missing required environment variables: ${validation.missingKeys.join(", ")}`
  );
  process.exit(1);
}

const port = Number.parseInt(validation.env.PORT, 10);

try {
  const { app, mongoConnection } = await createServerDependencies(validation.env);
  const server = await startHttpServer(app, port);

  console.log(`Realtime Doodle Relay server listening on port ${port}`);

  const shutdown = async () => {
    server.close();
    await mongoConnection.client.close();
  };

  process.once("SIGINT", () => {
    void shutdown();
  });
  process.once("SIGTERM", () => {
    void shutdown();
  });
} catch {
  console.error("Failed to start Realtime Doodle Relay server.");
  process.exit(1);
}
