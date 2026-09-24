import {
  type Api,
  getSupportedThinkingLevels,
  type Model,
} from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  type Gear,
  type GearConfig,
  THINKING_LEVELS,
  type ThinkingLevel,
} from "../settings.js";
import { showModelSelector } from "./model-selector.js";

const gearLabel = (gear: Gear): string =>
  `${gear.charAt(0).toUpperCase()}${gear.slice(1)}`;

const isThinkingLevel = (value: string): value is ThinkingLevel =>
  THINKING_LEVELS.some((level) => level === value);

const fallbackThinkingLevel = (
  supported: ThinkingLevel[],
  current: ThinkingLevel | undefined,
): ThinkingLevel => {
  if (current && supported.includes(current)) return current;
  if (supported.includes("medium")) return "medium";
  return supported.find((level) => level !== "off") ?? "off";
};

const selectThinkingLevel = async (
  ctx: ExtensionContext,
  model: Model<Api>,
  current: ThinkingLevel | undefined,
): Promise<ThinkingLevel | undefined> => {
  if (!model.reasoning) return "off";

  const supported = getSupportedThinkingLevels(model).filter(isThinkingLevel);
  if (supported.length <= 1) return "off";

  const fallback = fallbackThinkingLevel(supported, current);
  const options = [
    fallback,
    ...supported.filter((level) => level !== fallback),
  ];
  const selected = await ctx.ui.select("Thinking level", options);
  return selected && isThinkingLevel(selected) ? selected : undefined;
};

export const editGear = async (
  ctx: ExtensionContext,
  gear: Gear,
  current: GearConfig | undefined,
  description?: string,
): Promise<GearConfig | undefined> => {
  const selection = await showModelSelector(
    ctx,
    `Configure ${gearLabel(gear)}`,
    current,
    description,
  );
  if (!selection) return undefined;

  const thinkingLevel = await selectThinkingLevel(
    ctx,
    selection,
    current?.thinkingLevel,
  );
  if (!thinkingLevel) return undefined;

  return {
    provider: selection.provider,
    model: selection.id,
    thinkingLevel,
  };
};
