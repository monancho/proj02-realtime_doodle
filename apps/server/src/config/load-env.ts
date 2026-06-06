import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { loadEnvFile } from "node:process";

export function loadLocalEnvFile(path = ".env", cwd = process.cwd()): void {
  const resolvedPath = resolveEnvPath(path, cwd);

  if (!resolvedPath) {
    return;
  }

  try {
    loadEnvFile(resolvedPath);
  } catch (error) {
    if (isMissingFileError(error)) {
      return;
    }

    throw error;
  }
}

export function resolveEnvPath(path = ".env", cwd = process.cwd()): string | null {
  if (isAbsolute(path)) {
    return existsSync(path) ? path : null;
  }

  let currentDirectory = resolve(cwd);

  while (true) {
    const candidatePath = join(currentDirectory, path);

    if (existsSync(candidatePath)) {
      return candidatePath;
    }

    const parentDirectory = dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      return null;
    }

    currentDirectory = parentDirectory;
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "ENOENT"
  );
}
