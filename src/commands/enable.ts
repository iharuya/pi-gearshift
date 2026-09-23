import { credentialState } from "../credentials.js";
import { hasAllGears, settingsPath, writeSettings } from "../settings.js";
import { verifyApiKey } from "../typesafe.js";
import { requireSettingsLoaded } from "./require-settings.js";
import type { CommandHandler } from "./types.js";

export const enable: CommandHandler = async (_argument, { report }) => {
  const credential = credentialState();
  if (credential.kind === "missing") {
    report(
      "TypeSafe authentication is missing. Run /gearshift login first.",
      "warning",
    );
    return;
  }
  if (credential.kind === "unusable") {
    report(
      `TypeSafe authentication is unusable. ${credential.reason}`,
      "error",
    );
    return;
  }

  const settings = requireSettingsLoaded(report);
  if (!settings) return;

  if (!hasAllGears(settings.gears)) {
    report(
      `Configure light, standard, and heavy in ${settingsPath()} before enabling pi-gearshift.`,
      "warning",
    );
    return;
  }

  const models = await verifyApiKey(credential.apiKey);
  const path = writeSettings({
    ...settings,
    enabled: true,
    gears: settings.gears,
  });
  report(
    `pi-gearshift enabled using ${credential.kind === "environment" ? "TYPESAFE_API_KEY" : "the stored API key"} (${models} model${models === 1 ? "" : "s"} available). Settings saved to ${path}.`,
  );
};
