import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveEnvPath } from "./load-env";

describe("resolveEnvPath", () => {
  it("finds a .env file from a parent directory", () => {
    const rootDirectory = mkdtempSync(join(tmpdir(), "doodle-env-"));
    const nestedDirectory = join(rootDirectory, "apps", "server");

    try {
      writeFileSync(join(rootDirectory, ".env"), "NODE_ENV=test");
      writeFileSync(join(rootDirectory, "placeholder"), "");

      expect(resolveEnvPath(".env", nestedDirectory)).toBe(join(rootDirectory, ".env"));
    } finally {
      rmSync(rootDirectory, { force: true, recursive: true });
    }
  });

  it("returns null when no env file exists in the directory tree", () => {
    const rootDirectory = mkdtempSync(join(tmpdir(), "doodle-env-"));

    try {
      expect(resolveEnvPath(".env", rootDirectory)).toBeNull();
    } finally {
      rmSync(rootDirectory, { force: true, recursive: true });
    }
  });
});
