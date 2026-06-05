import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

import { createServerDependencies, startHttpServer } from "../bootstrap";
import { validateServerEnv } from "../config/env";

loadEnvFile(resolve(process.cwd(), "../../.env"));

const validation = validateServerEnv(process.env);

if (!validation.ok) {
  console.log(
    `SMOKE_FAIL missing env keys: ${validation.missingKeys.join(", ")}`
  );
  process.exit(1);
}

try {
  const dependencies = await createServerDependencies(validation.env);
  const server = await startHttpServer(dependencies.app, 0);

  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) {
        rejectClose(error);
        return;
      }

      resolveClose();
    });
  });
  await dependencies.mongoConnection.client.close();

  console.log("SMOKE_OK server bootstrap and MongoDB connection succeeded");
} catch (error) {
  console.log(`SMOKE_FAIL server bootstrap failed (${getSafeErrorLabel(error)})`);
  process.exit(1);
}

function getSafeErrorLabel(error: unknown): string {
  if (typeof error === "object" && error !== null && "name" in error) {
    const name = String((error as { name: unknown }).name);
    const code =
      "code" in error ? String((error as { code: unknown }).code) : "";

    return code ? `${name}:${code}` : name;
  }

  return "UnknownError";
}
