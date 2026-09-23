import { applyGear } from "../apply-gear.js";
import { isGear, settingsPath } from "../settings.js";
import { requireSettingsLoaded } from "./require-settings.js";
import type { CommandHandler } from "./types.js";

export const use: CommandHandler = async (argument, { ctx, pi, report }) => {
  if (!isGear(argument)) {
    report("Usage: /gearshift use light | standard | heavy", "warning");
    return;
  }

  const settings = requireSettingsLoaded(report);
  if (!settings) return;

  const target = settings.gears?.[argument];
  if (!target) {
    report(`${argument} is not configured in ${settingsPath()}.`, "warning");
    return;
  }

  const result = await applyGear(pi, ctx, argument, target);
  if (!result.ok) {
    report(result.message, "warning");
    return;
  }

  report(`Using ${result.gear}: ${result.target} (${result.thinkingLevel}).`);
};
