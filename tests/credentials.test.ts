import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  clearStoredApiKey,
  credentialState,
  credentialsPath,
  normalizeApiKey,
  storeApiKey,
} from "../src/credentials.js";

let dataDirectory: string;

beforeEach(() => {
  dataDirectory = mkdtempSync(join(tmpdir(), "pi-gearshift-credentials-test-"));
  vi.stubEnv("PI_GEARSHIFT_DATA_DIR", dataDirectory);
  vi.stubEnv("TYPESAFE_API_KEY", undefined);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dataDirectory, { recursive: true, force: true });
});

describe("normalizeApiKey", () => {
  test("rejects keys containing non-printable ASCII or internal whitespace", () => {
    expect(() => normalizeApiKey("key with internal spaces")).toThrow();
    expect(() => normalizeApiKey("key\nwith\nnewlines")).toThrow();
    expect(() => normalizeApiKey("全角キーを含むテスト用キー12345")).toThrow();
  });
});

describe("credential storage and resolution", () => {
  test("returns missing state when no key is configured", () => {
    expect(credentialState()).toEqual({
      kind: "missing",
      path: credentialsPath(),
    });
  });

  test("stores API key with private 0600 permissions", () => {
    const path = storeApiKey("stored-key-0123456789abcdef");
    expect(path).toBe(credentialsPath());
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
      apiKey: "stored-key-0123456789abcdef",
    });

    if (process.platform !== "win32") {
      expect(statSync(path).mode & 0o777).toBe(0o600);
    }
    expect(credentialState()).toEqual({
      kind: "stored",
      apiKey: "stored-key-0123456789abcdef",
      path,
    });
  });

  test("prioritizes TYPESAFE_API_KEY environment variable over stored key", () => {
    storeApiKey("stored-key-0123456789abcdef");
    vi.stubEnv("TYPESAFE_API_KEY", "env-key-0123456789abcdef");

    expect(credentialState()).toEqual({
      kind: "environment",
      apiKey: "env-key-0123456789abcdef",
    });
  });

  test("clears stored API key", () => {
    storeApiKey("stored-key-0123456789abcdef");
    expect(clearStoredApiKey()).toBe(true);
    expect(credentialState().kind).toBe("missing");
  });

  test("reports unusable when credentials file has unknown fields", () => {
    writeFileSync(
      credentialsPath(),
      JSON.stringify({ apiKey: "stored-key-0123456789abcdef", extra: true }),
      { mode: 0o600 },
    );

    const state = credentialState();
    expect(state.kind).toBe("unusable");
    if (state.kind === "unusable") {
      expect(state.reason).toMatch(/Invalid credentials file/);
    }
  });

  test.skipIf(process.platform === "win32")(
    "reports unusable when credentials file is accessible by other users",
    () => {
      const path = storeApiKey("stored-key-0123456789abcdef");
      chmodSync(path, 0o644);

      const state = credentialState();
      expect(state.kind).toBe("unusable");
      if (state.kind === "unusable") {
        expect(state.reason).toMatch(/accessible by other users/);
      }
    },
  );
});
