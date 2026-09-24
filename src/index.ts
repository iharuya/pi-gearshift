import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerGearshiftCommand } from "./commands/index.js";
import { registerOnboarding } from "./onboarding/index.js";
import { registerAutomaticRouting } from "./routing.js";

export default function gearshift(pi: ExtensionAPI): void {
  registerGearshiftCommand(pi);
  registerOnboarding(pi);
  registerAutomaticRouting(pi);
}
