import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";

export type ReportLevel = "info" | "warning" | "error";

export type CommandContext = {
  pi: ExtensionAPI;
  ctx: ExtensionCommandContext;
  report(message: string, level?: ReportLevel): void;
};

export type CommandHandler = (
  argument: string,
  command: CommandContext,
) => Promise<void>;
