import { join } from "node:path";
import * as z from "zod";
import {
  dataDirectory,
  readJson,
  removeFile,
  writePrivateJson,
} from "./storage.js";

const apiKeySchema = z
  .string()
  .trim()
  .min(16)
  .max(512)
  .regex(/^[\x21-\x7e]+$/);

const credentialsSchema = z.strictObject({
  apiKey: apiKeySchema,
});

export type CredentialState =
  | { kind: "environment"; apiKey: string }
  | { kind: "stored"; apiKey: string; path: string }
  | { kind: "missing"; path: string }
  | { kind: "unusable"; path: string; reason: string };

export const credentialsPath = (): string => join(dataDirectory(), "auth.json");

export const normalizeApiKey = (value: unknown): string => {
  const result = apiKeySchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      "That does not look like a TypeSafe API key. Copy the complete key from console.typesafe.ai and try again.",
    );
  }
  return result.data;
};

const readStoredApiKey = (path: string): string | undefined => {
  const stored = readJson(path, true);
  if (stored === undefined) return undefined;

  const result = credentialsSchema.safeParse(stored);
  if (!result.success) {
    throw new Error(`Invalid credentials file at ${path}.`);
  }
  return result.data.apiKey;
};

export const credentialState = (): CredentialState => {
  const path = credentialsPath();
  const environmentKey = process.env.TYPESAFE_API_KEY?.trim();
  if (environmentKey) {
    try {
      return { kind: "environment", apiKey: normalizeApiKey(environmentKey) };
    } catch (error) {
      return {
        kind: "unusable",
        path,
        reason:
          error instanceof Error
            ? error.message
            : "TYPESAFE_API_KEY is invalid.",
      };
    }
  }

  try {
    const apiKey = readStoredApiKey(path);
    return apiKey
      ? { kind: "stored", apiKey, path }
      : { kind: "missing", path };
  } catch (error) {
    return {
      kind: "unusable",
      path,
      reason:
        error instanceof Error ? error.message : `Could not read ${path}.`,
    };
  }
};

export const storeApiKey = (value: unknown): string => {
  const apiKey = normalizeApiKey(value);
  const path = credentialsPath();
  writePrivateJson(path, { apiKey });
  return path;
};

export const clearStoredApiKey = (): boolean => removeFile(credentialsPath());
