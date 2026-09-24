import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { authenticate } from "../authenticate.js";
import { credentialState } from "../credentials.js";
import { safeErrorMessage, UserFacingError } from "../errors.js";
import {
  describeSettingsError,
  type Gear,
  type GearConfig,
  hasAllGears,
  settingsState,
  writeSettings,
} from "../settings.js";
import { editGear } from "../ui/gear-editor.js";
import { onboardingTemplates } from "./templates.js";

const onboardingGearOrder = [
  "standard",
  "heavy",
  "light",
] as const satisfies readonly Gear[];

const descriptions: Record<Gear, string> = {
  light: "For straightforward, low-risk work such as comments and small fixes.",
  standard: "For everyday implementation, investigation, and debugging.",
  heavy: "For complex reasoning, architecture, and broad or high-risk changes.",
};

const during = async <T>(
  step: string,
  operation: () => T | Promise<T>,
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    throw new UserFacingError(
      `Gearshift setup — ${step}:\n${safeErrorMessage(error)}`,
    );
  }
};

const authenticateWithRetry = async (
  ctx: ExtensionContext,
): Promise<boolean> => {
  while (true) {
    try {
      return Boolean(await authenticate(ctx));
    } catch (error) {
      if (!(error instanceof UserFacingError)) throw error;
      const choice = await ctx.ui.select(
        `TypeSafe authentication: ${error.message}`,
        ["Try again", "Cancel setup"],
      );
      if (choice !== "Try again") return false;
    }
  }
};

export const runOnboarding = async (ctx: ExtensionContext): Promise<void> => {
  if (ctx.mode !== "tui") return;

  const state = settingsState();
  if (state.kind === "unusable") {
    throw new UserFacingError(
      `Gearshift setup — loading settings:\n${describeSettingsError(state)}`,
    );
  }
  if (state.settings.onboardingDone) return;

  const started = await during("welcome", () =>
    ctx.ui.confirm(
      "Welcome to Gearshift",
      "This setup wizard will configure three gears: Standard, Heavy, and Light. " +
        "Choose a model and thinking level for each, then connect Jev with a TypeSafe API key. " +
        "Automatic routing sends your request and recent conversation excerpts to TypeSafe. " +
        "Esc cancels setup without saving gear settings. Start setup?",
    ),
  );
  if (!started) return;

  const templates = Object.values(onboardingTemplates).map((template) => ({
    label: `I am a ${template.label} user`,
    template,
  }));
  const selected = await during("template selection", () =>
    ctx.ui.select("Choose a starting template", [
      ...templates.map(({ label }) => label),
      "None of the above",
    ]),
  );
  if (selected === undefined) return;

  const template = templates.find(({ label }) => label === selected)?.template;
  const gears: Partial<Record<Gear, GearConfig>> = {};
  for (const gear of onboardingGearOrder) {
    const config = await during(`${gear} gear`, () =>
      editGear(
        ctx,
        gear,
        template?.gears[gear] ?? state.settings.gears?.[gear],
        descriptions[gear],
      ),
    );
    if (!config) return;
    gears[gear] = config;
  }
  if (!hasAllGears(gears)) return;

  const authenticated = await during("authentication", async () => {
    const credential = credentialState();
    if (credential.kind === "environment" || credential.kind === "stored") {
      return true;
    }
    if (
      credential.kind === "unusable" &&
      process.env.TYPESAFE_API_KEY?.trim()
    ) {
      throw new UserFacingError(
        `TYPESAFE_API_KEY: ${credential.reason} Fix or unset the environment variable before restarting Pi.`,
      );
    }
    return authenticateWithRetry(ctx);
  });
  if (!authenticated) return;

  await during("saving settings", () =>
    writeSettings({
      ...state.settings,
      gears,
      enabled: true,
      onboardingDone: true,
    }),
  );
  ctx.ui.notify(
    "Gearshift setup complete. Automatic routing is enabled. Use /gearshift settings to adjust your gears.",
    "info",
  );
};

export const registerOnboarding = (pi: ExtensionAPI): void => {
  pi.on("session_start", async (event, ctx) => {
    if (ctx.mode !== "tui" || event.reason !== "startup") return;
    try {
      await runOnboarding(ctx);
    } catch (error) {
      ctx.ui.notify(
        `${safeErrorMessage(error)}\nPi will continue with its current settings. Restart Pi to retry setup.`,
        "warning",
      );
    }
  });
};
