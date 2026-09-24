import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { safeErrorMessage } from "./errors.js";
import type { Gear, GearConfig, ThinkingLevel } from "./settings.js";

export type GearApplication =
  | {
      ok: true;
      gear: Gear;
      target: string;
      thinkingLevel: ThinkingLevel;
    }
  | { ok: false; message: string };

export const applyGear = async (
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  gear: Gear,
  target: GearConfig,
): Promise<GearApplication> => {
  const reference = `${target.provider}/${target.model}`;
  const model = ctx.modelRegistry.find(target.provider, target.model);
  if (!model) {
    return {
      ok: false,
      message: `${reference} was not found in Pi's model catalog.`,
    };
  }

  try {
    const alreadySelected =
      ctx.model?.provider === model.provider && ctx.model.id === model.id;
    if (!alreadySelected && !(await pi.setModel(model))) {
      return {
        ok: false,
        message: `Pi has no configured authentication for ${reference}; keeping the current model.`,
      };
    }

    pi.setThinkingLevel(target.thinkingLevel);
    return {
      ok: true,
      gear,
      target: reference,
      thinkingLevel: pi.getThinkingLevel(),
    };
  } catch (error) {
    return {
      ok: false,
      message: `Could not fully apply ${gear} (${reference}). ${safeErrorMessage(error)} The model or thinking level may have changed; Pi will continue with its current setting.`,
    };
  }
};
