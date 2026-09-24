import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { normalizeApiKey, storeApiKey } from "./credentials.js";
import { UserFacingError } from "./errors.js";
import { promptForApiKey } from "./key-prompt.js";
import { verifyApiKey } from "./typesafe.js";

export class RetryableAuthenticationError extends UserFacingError {
  override readonly name = "RetryableAuthenticationError";
}

export const authenticate = async (
  ctx: ExtensionContext,
): Promise<{ models: number; path: string } | undefined> => {
  const entered = await promptForApiKey(ctx);
  if (entered === undefined) return undefined;

  let apiKey: string;
  let models: number;
  try {
    apiKey = normalizeApiKey(entered);
    models = await verifyApiKey(apiKey);
  } catch (error) {
    if (error instanceof UserFacingError) {
      throw new RetryableAuthenticationError(error.message);
    }
    throw error;
  }

  return { models, path: storeApiKey(apiKey) };
};
