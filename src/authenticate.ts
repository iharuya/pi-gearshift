import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { normalizeApiKey, storeApiKey } from "./credentials.js";
import { promptForApiKey } from "./key-prompt.js";
import { verifyApiKey } from "./typesafe.js";

export const authenticate = async (
  ctx: ExtensionContext,
): Promise<{ models: number; path: string } | undefined> => {
  const entered = await promptForApiKey(ctx);
  if (entered === undefined) return undefined;

  const apiKey = normalizeApiKey(entered);
  const models = await verifyApiKey(apiKey);
  const path = storeApiKey(apiKey);
  return { models, path };
};
