import { createServerDependencies, startHttpServer } from "./bootstrap";
import { validateServerEnv } from "./config/env";
import { loadLocalEnvFile } from "./config/load-env";
import { createSocketServer } from "./socket/server";

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
  const { app, imageRepository, mongoConnection, roomRepository, tokenVerifier } =
    await createServerDependencies(validation.env);
  const server = await startHttpServer(app, port);
  const io = createSocketServer({
    env: validation.env,
    httpServer: server,
    imageRepository,
    roomRepository,
    tokenVerifier
  });

  console.log(`Realtime Doodle Relay server listening on port ${port}`);

  const shutdown = async () => {
    io.close();
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
