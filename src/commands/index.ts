import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { GEARS } from "../settings.js";
import { disable } from "./disable.js";
import { enable } from "./enable.js";
import { login } from "./login.js";
import { logout } from "./logout.js";
import { configureSettings } from "./settings.js";
import { status } from "./status.js";
import { testCommand } from "./test-command.js";
import type { CommandHandler, ReportLevel } from "./types.js";
import { use } from "./use.js";

const handlers = {
  status,
  settings: configureSettings,
  use,
  login,
  logout,
  enable,
  disable,
  test: testCommand,
} satisfies Record<string, CommandHandler>;

type Action = keyof typeof handlers;
const actions = Object.keys(handlers) as Action[];

const isAction = (value: string): value is Action => value in handlers;

const parseCommand = (
  args: string,
): { action: string; argument: string } | undefined => {
  const trimmed = args.trim();
  if (!trimmed) return undefined;

  const separator = trimmed.search(/\s/);
  if (separator === -1) return { action: trimmed, argument: "" };
  return {
    action: trimmed.slice(0, separator),
    argument: trimmed.slice(separator).trim(),
  };
};

export const registerGearshiftCommand = (pi: ExtensionAPI): void => {
  pi.registerCommand("gearshift", {
    description: "Configure and test pi-gearshift",
    getArgumentCompletions(prefix) {
      if (prefix.startsWith("use ")) {
        const gearPrefix = prefix.slice("use ".length);
        const matches = GEARS.filter((gear) => gear.startsWith(gearPrefix)).map(
          (gear) => ({ value: `use ${gear}`, label: gear }),
        );
        return matches.length > 0 ? matches : null;
      }

      const matches = actions
        .filter((action) => action.startsWith(prefix))
        .map((action) => ({ value: action, label: action }));
      return matches.length > 0 ? matches : null;
    },
    async handler(args, ctx) {
      const command = parseCommand(args);
      if (!command) return;

      const { action, argument } = command;
      const report = (message: string, level: ReportLevel = "info") => {
        if (ctx.hasUI) {
          ctx.ui.notify(message, level);
          return;
        }
        pi.sendMessage({
          customType: "gearshift-status",
          content: message,
          display: true,
        });
      };

      if (!isAction(action)) {
        report(
          `Usage: /gearshift ${actions.filter((item) => item !== "test").join(" | ")} | test <input>`,
          "warning",
        );
        return;
      }

      try {
        await handlers[action](argument, { pi, ctx, report });
      } catch (error) {
        report(
          error instanceof Error
            ? error.message
            : "pi-gearshift could not complete the command.",
          "error",
        );
      }
    },
  });
};
