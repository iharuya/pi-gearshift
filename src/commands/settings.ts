import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  formatGearBias,
  GEARS,
  type Gear,
  type GearConfig,
  type Settings,
  settingsPath,
  writeSettings,
} from "../settings.js";
import { showGearBiasSlider } from "../ui/gear-bias-slider.js";
import { editGear } from "../ui/gear-editor.js";
import { requireSettingsLoaded } from "./require-settings.js";
import type { CommandHandler } from "./types.js";

type SettingsItem = "bias" | Gear;

const gearLabel = (gear: Gear): string =>
  `${gear.charAt(0).toUpperCase()}${gear.slice(1)}`;

const describeGear = (gear: Gear, config: GearConfig | undefined): string =>
  config
    ? `${gearLabel(gear)}  ${config.provider}/${config.model} (${config.thinkingLevel})`
    : `${gearLabel(gear)}  not configured`;

const settingsItems = (
  settings: Settings,
): { label: string; value: SettingsItem }[] => [
  { label: `Gear bias  ${formatGearBias(settings.gearBias)}`, value: "bias" },
  ...GEARS.map((gear) => ({
    label: describeGear(gear, settings.gears?.[gear]),
    value: gear,
  })),
];

const selectSettingsItem = async (
  ctx: ExtensionCommandContext,
  settings: Settings,
): Promise<SettingsItem | undefined> => {
  const items = settingsItems(settings);
  const selected = await ctx.ui.select(
    "Gearshift Settings",
    items.map((item) => item.label),
  );
  return items.find((item) => item.label === selected)?.value;
};

const withGear = (
  settings: Settings,
  gear: Gear,
  config: GearConfig,
): Settings => {
  if (settings.enabled) {
    return {
      ...settings,
      gears: { ...settings.gears, [gear]: config },
    };
  }

  return {
    ...settings,
    gears: { ...settings.gears, [gear]: config },
  };
};

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

  const loaded = requireSettingsLoaded(report);
  if (!loaded) return;

  let settings = loaded;
  while (true) {
    const item = await selectSettingsItem(ctx, settings);
    if (!item) return;

    if (item === "bias") {
      const gearBias = await showGearBiasSlider(ctx, settings.gearBias);
      if (gearBias === undefined) continue;

      settings = { ...settings, gearBias };
      writeSettings(settings);
      report(`Gear bias set to ${formatGearBias(gearBias)}.`);
      continue;
    }

    const config = await editGear(ctx, item, settings.gears?.[item]);
    if (!config) continue;

    settings = withGear(settings, item, config);
    writeSettings(settings);
    report(`${gearLabel(item)} gear saved.`);
  }
};
