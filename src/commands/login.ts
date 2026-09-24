import { authenticate } from "../authenticate.js";
import type { CommandHandler } from "./types.js";

export const login: CommandHandler = async (_argument, { ctx, report }) => {
  if (process.env.TYPESAFE_API_KEY?.trim()) {
    report(
      "TYPESAFE_API_KEY is set and takes precedence over a stored key. Unset it before using /gearshift login.",
      "warning",
    );
    return;
  }

  const result = await authenticate(ctx);
  if (!result) {
    report("Login cancelled. Nothing was saved.");
    return;
  }

  const { models, path } = result;
  report(
    `TypeSafe API key verified (${models} model${models === 1 ? "" : "s"} available) and saved to ${path}.`,
  );
};
