import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { applyGear } from "./apply-gear.js";
import { credentialState } from "./credentials.js";
import { safeErrorMessage } from "./errors.js";
import { formatGearBias, type Gear, settingsState } from "./settings.js";
import { truncateMiddle } from "./truncate.js";
import { judgeGear, type RecentMessage } from "./typesafe.js";
import { notify } from "./ui/notify.js";

const MAX_RECENT_MESSAGES = 10;
const MAX_BIAS_SCORE_SHIFT = 0.4;
const ROUTING_STATUS_KEY = "gearshift-routing";

const confidencePercent = (confidence: number): string =>
  `${Math.round(confidence * 100)}%`;

const clampScore = (score: number): number => Math.max(0, Math.min(2, score));

const gearForScore = (score: number): Gear => {
  if (score < 0.5) return "light";
  if (score < 1.5) return "standard";
  return "heavy";
};

const toRecentMessage = (message: AgentMessage): RecentMessage | undefined => {
  if (message.role !== "user" && message.role !== "assistant") return undefined;

  const text =
    typeof message.content === "string"
      ? message.content
      : message.content
          .flatMap((content) => (content.type === "text" ? [content.text] : []))
          .join("\n");
  if (!text.trim()) return undefined;

  return { role: message.role, text: truncateMiddle(text) };
};

const recentMessages = (ctx: ExtensionContext): RecentMessage[] =>
  ctx.sessionManager
    .buildSessionProjection()
    .messages.flatMap((message) => {
      const recent = toRecentMessage(message);
      return recent ? [recent] : [];
    })
    .slice(-MAX_RECENT_MESSAGES);

export const registerAutomaticRouting = (pi: ExtensionAPI): void => {
  pi.on("before_agent_start", async (event, ctx) => {
    let statusStarted = false;
    try {
      if (!event.prompt.trim()) return;

      const state = settingsState();
      if (state.kind === "unusable") {
        notify(
          ctx,
          `Gearshift: Settings are unusable; keeping the current model. ${state.reason}`,
          "warning",
        );
        return;
      }

      const settings = state.settings;
      if (!settings.enabled) return;

      const credential = credentialState();
      if (credential.kind === "missing") {
        notify(
          ctx,
          "Gearshift: TypeSafe authentication is missing; keeping the current model.",
          "warning",
        );
        return;
      }
      if (credential.kind === "unusable") {
        notify(
          ctx,
          `Gearshift: TypeSafe authentication is unusable; keeping the current model. ${credential.reason}`,
          "warning",
        );
        return;
      }

      const recent = recentMessages(ctx);
      statusStarted = true;
      ctx.ui.setStatus(ROUTING_STATUS_KEY, "Gearshift: choosing a model…");

      const judgment = await judgeGear(
        credential.apiKey,
        event.prompt,
        recent,
        {
          ...(ctx.signal ? { signal: ctx.signal } : {}),
        },
      );
      const gearBias = settings.gearBias;
      const adjustedScore = clampScore(
        judgment.score + gearBias * MAX_BIAS_SCORE_SHIFT,
      );
      const gear = gearForScore(adjustedScore);
      const target = settings.gears[gear];

      const result = await applyGear(pi, ctx, gear, target);
      const decision = `${gear} (score ${judgment.score.toFixed(2)} → ${adjustedScore.toFixed(2)} with bias ${formatGearBias(gearBias)}, confidence ${confidencePercent(judgment.confidence)})`;
      if (!result.ok) {
        notify(
          ctx,
          `Gearshift: ${decision} was not fully applied. ${result.message}`,
          "warning",
        );
        return;
      }

      notify(
        ctx,
        `Gearshift: ${decision} → ${result.target} (${result.thinkingLevel}).`,
        "info",
      );
    } catch (error) {
      notify(
        ctx,
        `Gearshift: Automatic routing failed. ${safeErrorMessage(error)} Pi will continue with its current model and thinking level.`,
        "warning",
      );
    } finally {
      if (statusStarted) {
        try {
          ctx.ui.setStatus(ROUTING_STATUS_KEY, undefined);
        } catch {
          // Status cleanup is best-effort, including after a failed status update.
        }
      }
    }
  });
};
