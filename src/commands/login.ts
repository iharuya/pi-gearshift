import { normalizeApiKey, storeApiKey } from "../credentials.js";
import { promptForApiKey } from "../key-prompt.js";
import { verifyApiKey } from "../typesafe.js";
import type { CommandHandler } from "./types.js";

export const login: CommandHandler = async (_argument, { ctx, report }) => {
  if (process.env.TYPESAFE_API_KEY?.trim()) {
    report(
      "TYPESAFE_API_KEY is set and takes precedence over a stored key. Unset it before using /gearshift login.",
      "warning",
    );
    return;
  }

  const entered = await promptForApiKey(ctx);
  if (entered === undefined) {
    report("Login cancelled. Nothing was saved.");
    return;
  }

  const apiKey = normalizeApiKey(entered);
  const models = await verifyApiKey(apiKey);
  const path = storeApiKey(apiKey);
  report(
    `TypeSafe API key verified (${models} model${models === 1 ? "" : "s"} available) and saved to ${path}.`,
  );
};
