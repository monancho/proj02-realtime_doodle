import { createApp } from "./app";
import { validateServerEnv } from "./config/env";

const validation = validateServerEnv(process.env);

if (!validation.ok) {
  console.error(
    `Missing required environment variables: ${validation.missingKeys.join(", ")}`
  );
  process.exit(1);
}

const app = createApp();
const port = Number.parseInt(validation.env.PORT, 10);

app.listen(port, () => {
  console.log(`Realtime Doodle Relay server listening on port ${port}`);
});
