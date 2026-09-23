import { settingsState, writeSettings } from "../settings.js";
import type { CommandHandler } from "./types.js";

export const disable: CommandHandler = async (_argument, { report }) => {
  const state = settingsState();
  if (state.kind === "unusable") {
    report(
      `pi-gearshift is already inactive because settings are unusable.\nExisting settings were left untouched at ${state.path}.`,
      "info",
    );
    return;
  }

  const path = writeSettings({ ...state.settings, enabled: false });
  report(`pi-gearshift disabled. Settings saved to ${path}.`);
};
