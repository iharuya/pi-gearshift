import { formatGearBias, settingsPath, writeSettings } from "../settings.js";
import { showGearBiasSlider } from "../ui/gear-bias-slider.js";
import { requireSettingsLoaded } from "./require-settings.js";
import type { CommandHandler } from "./types.js";

export const configureSettings: CommandHandler = async (
  _argument,
  { ctx, report },
) => {
  if (ctx.mode !== "tui") {
    report(
      `/gearshift settings requires Pi's TUI. Edit ${settingsPath()} for headless use.`,
      "warning",
    );
    return;
  }

  const settings = requireSettingsLoaded(report);
  if (!settings) return;

  const gearBias = await showGearBiasSlider(ctx, settings.gearBias);
  if (gearBias === undefined) return;

  const path = writeSettings({ ...settings, gearBias });
  report(
    `Gear bias set to ${formatGearBias(gearBias)}. Settings saved to ${path}.`,
  );
};
