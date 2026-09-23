import { clearStoredApiKey, credentialState } from "../credentials.js";
import { settingsState, writeSettings } from "../settings.js";
import type { CommandHandler } from "./types.js";

export const logout: CommandHandler = async (_argument, { report }) => {
  const removed = clearStoredApiKey();
  const authentication = removed
    ? "Stored TypeSafe API key removed."
    : "No stored TypeSafe API key was found.";
  const environmentNotice =
    credentialState().kind === "environment"
      ? " TYPESAFE_API_KEY is still configured in the environment."
      : "";

  const state = settingsState();
  if (state.kind === "unusable") {
    report(
      `${authentication}${environmentNotice}\npi-gearshift is inactive (settings at ${state.path} are unusable and were left untouched).`,
    );
    return;
  }

  const path = writeSettings({ ...state.settings, enabled: false });
  report(
    `${authentication}${environmentNotice} pi-gearshift disabled in ${path}.`,
  );
};
