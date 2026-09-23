import { credentialState } from "../credentials.js";
import { judgeCliCommand } from "../typesafe.js";
import type { CommandHandler } from "./types.js";

const parseInput = (argument: string): string => {
  if (!argument) throw new Error('Usage: /gearshift test "input"');

  let input = argument;
  if (argument.startsWith('"') || argument.endsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(argument);
      if (typeof parsed !== "string") throw new Error();
      input = parsed;
    } catch {
      throw new Error('Invalid quoted input. Use /gearshift test "input".');
    }
  } else if (argument.startsWith("'") || argument.endsWith("'")) {
    if (!(argument.startsWith("'") && argument.endsWith("'"))) {
      throw new Error('Invalid quoted input. Use /gearshift test "input".');
    }
    input = argument.slice(1, -1);
  }

  if (!input.trim()) throw new Error("Test input must not be empty.");
  if (Buffer.byteLength(input, "utf8") > 8192) {
    throw new Error("Test input must not exceed 8192 UTF-8 bytes.");
  }
  return input;
};

export const testCommand: CommandHandler = async (argument, { report }) => {
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

  const judgment = await judgeCliCommand(
    credential.apiKey,
    parseInput(argument),
  );
  report(
    `Jev judgment: CLI command = ${judgment.isCliCommand ? "yes" : "no"}; P(yes) = ${judgment.probability.toFixed(3)}; model = ${judgment.model}; input tokens = ${judgment.inputTokens}.`,
  );
};
