import { mkdtempSync, statSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  dataDirectory,
  readJson,
  removeFile,
  writePrivateJson,
} from "../src/storage.js";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "pi-gearshift-storage-test-"));
  vi.stubEnv("PI_GEARSHIFT_DATA_DIR", testDir);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(testDir, { recursive: true, force: true });
});

describe("dataDirectory", () => {
  test("resolves from environment variable", () => {
    expect(dataDirectory()).toBe(testDir);
  });
});

describe("writePrivateJson and readJson", () => {
  test("creates directory with 0700 and file with 0600 permissions", () => {
    const targetFile = join(testDir, "nested", "private.json");
    writePrivateJson(targetFile, { test: 123 });

    expect(readJson(targetFile)).toEqual({ test: 123 });

    if (process.platform !== "win32") {
      expect(statSync(join(testDir, "nested")).mode & 0o777).toBe(0o700);
      expect(statSync(targetFile).mode & 0o777).toBe(0o600);
    }
  });

  test("returns undefined when reading a non-existent file", () => {
    expect(readJson(join(testDir, "missing.json"))).toBeUndefined();
  });

  test("throws when reading malformed JSON", () => {
    const brokenFile = join(testDir, "broken.json");
    writeFileSync(brokenFile, "{ malformed json", { mode: 0o600 });

    expect(() => readJson(brokenFile)).toThrow(/Could not read/);
  });
});

describe("removeFile", () => {
  test("removes an existing file and returns true", () => {
    const targetFile = join(testDir, "temp.json");
    writePrivateJson(targetFile, { ok: true });
    expect(removeFile(targetFile)).toBe(true);
    expect(readJson(targetFile)).toBeUndefined();
  });

  test("returns false when removing a non-existent file", () => {
    expect(removeFile(join(testDir, "nonexistent.json"))).toBe(false);
  });
});
