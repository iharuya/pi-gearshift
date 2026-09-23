import { type CredentialState, credentialState } from "../credentials.js";
import { GEARS, settingsPath, settingsState } from "../settings.js";
import type { CommandHandler } from "./types.js";

const describeCredential = (credential: CredentialState): string => {
  switch (credential.kind) {
    case "environment":
      return "configured through TYPESAFE_API_KEY";
    case "stored":
      return `stored at ${credential.path}`;
    case "missing":
      return "not configured";
    case "unusable":
      return `unusable — ${credential.reason}`;
  }
};

export const status: CommandHandler = async (
  _argument,
  { ctx, pi, report },
) => {
  const state = settingsState();
  const current = ctx.model
    ? `${ctx.model.provider}/${ctx.model.id} (${pi.getThinkingLevel()})`
    : "none";
  const auth = `TypeSafe authentication: ${describeCredential(credentialState())}.`;

  if (state.kind === "unusable") {
    report(
      [
        "pi-gearshift is inactive (settings are unusable).",
        `Current: ${current}`,
        auth,
        `Settings: unusable — ${state.reason}`,
        `To restore, edit or remove ${state.path}.`,
      ].join("\n"),
      "warning",
    );
    return;
  }

  const settings = state.settings;
  const gearBias = settings.gearBias;
  const gears = GEARS.map((gear) => {
    const target = settings.gears?.[gear];
    return target
      ? `${gear}: ${target.provider}/${target.model} (${target.thinkingLevel})`
      : `${gear}: not configured`;
  });

  report(
    [
      `pi-gearshift is ${settings.enabled ? "enabled" : "disabled"}.`,
      `Current: ${current}`,
      `Gear bias: ${gearBias > 0 ? "+" : ""}${gearBias.toFixed(2)}`,
      ...gears,
      auth,
      `Settings: ${settingsPath()}`,
    ].join("\n"),
  );
};
