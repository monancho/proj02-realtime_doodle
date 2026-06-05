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
  console.log(
    `SMOKE_FAIL server bootstrap failed (${getSafeErrorDiagnostic(error)})`
  );
  process.exit(1);
}

function getSafeErrorDiagnostic(error: unknown): string {
  const parts = [`name=${getSafeErrorName(error)}`];
  const code = getSafeErrorCode(error);
  const syscall = getSafeErrorSyscall(error);
  const cause = getSafeCause(error);
  const hosts = getSafeMongoHosts(error);

  if (code) {
    parts.push(`code=${code}`);
  }

  if (syscall) {
    parts.push(`syscall=${syscall}`);
  }

  if (cause.name) {
    parts.push(`causeName=${cause.name}`);
  }

  if (cause.code) {
    parts.push(`causeCode=${cause.code}`);
  }

  if (hosts.length > 0) {
    parts.push(`hosts=${hosts.join(",")}`);
  }

  return parts.join(" ");
}

function getSafeErrorName(error: unknown): string {
  if (typeof error === "object" && error !== null && "name" in error) {
    return sanitizeToken((error as { name: unknown }).name) ?? "Error";
  }

  return "UnknownError";
}

function getSafeErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  return sanitizeToken((error as { code: unknown }).code);
}

function getSafeErrorSyscall(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("syscall" in error)) {
    return undefined;
  }

  return sanitizeToken((error as { syscall: unknown }).syscall);
}

function getSafeCause(error: unknown): { name?: string; code?: string } {
  if (typeof error !== "object" || error === null || !("cause" in error)) {
    return {};
  }

  const cause = (error as { cause: unknown }).cause;

  return {
    name: getSafeErrorName(cause),
    code: getSafeErrorCode(cause)
  };
}

function getSafeMongoHosts(error: unknown): string[] {
  const hosts = new Set<string>();
  const seen = new Set<unknown>();

  collectSafeHosts(error, hosts, seen, 0);

  return [...hosts].slice(0, 8);
}

function collectSafeHosts(
  value: unknown,
  hosts: Set<string>,
  seen: Set<unknown>,
  depth: number
): void {
  if (depth > 5 || typeof value !== "object" || value === null) {
    return;
  }

  if (seen.has(value)) {
    return;
  }

  seen.add(value);

  if (value instanceof Map) {
    for (const [key, entry] of value.entries()) {
      addSafeHost(key, hosts);
      collectSafeHosts(entry, hosts, seen, depth + 1);
    }

    return;
  }

  addDirectSafeHost(value, hosts);

  for (const key of Object.getOwnPropertyNames(value)) {
    const entry = (value as Record<string, unknown>)[key];

    if (isHostLikeKey(key)) {
      addSafeHost(entry, hosts);
    }

    if (key !== "message" && key !== "stack") {
      collectSafeHosts(entry, hosts, seen, depth + 1);
    }
  }
}

function isHostLikeKey(key: string): boolean {
  return ["address", "host", "hostname", "serverAddress"].includes(key);
}

function addSafeHost(value: unknown, hosts: Set<string>): void {
  const host = sanitizeHost(value);

  if (host) {
    hosts.add(host);
  }
}

function addDirectSafeHost(value: object, hosts: Set<string>): void {
  if (!("address" in value)) {
    return;
  }

  const address = (value as { address: unknown }).address;
  const port = "port" in value ? (value as { port: unknown }).port : undefined;
  const host =
    typeof port === "number" || typeof port === "string"
      ? `${String(address)}:${String(port)}`
      : address;

  addSafeHost(host, hosts);
}

function sanitizeToken(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }

  const token = String(value);

  return /^[A-Za-z0-9_.-]+$/.test(token) ? token : undefined;
}

function sanitizeHost(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const host = value.trim();

  if (
    host.includes("@") ||
    host.includes("/") ||
    host.includes("?") ||
    host.includes("#")
  ) {
    return undefined;
  }

  return /^[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/.test(host) ? host : undefined;
}
