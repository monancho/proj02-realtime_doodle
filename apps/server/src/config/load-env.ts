import { loadEnvFile } from "node:process";

export function loadLocalEnvFile(path = ".env"): void {
  try {
    loadEnvFile(path);
  } catch (error) {
    if (isMissingFileError(error)) {
      return;
    }

    throw error;
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
