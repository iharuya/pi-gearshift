import { type Settings, settingsState } from "../settings.js";
import type { CommandContext } from "./types.js";

export const requireSettingsLoaded = (
  report: CommandContext["report"],
): Settings | undefined => {
  const state = settingsState();
  if (state.kind === "unusable") {
    report(
      `Settings are unusable: ${state.reason}\nPlease fix ${state.path}.`,
      "error",
    );
    return undefined;
  }
  return state.settings;
};
