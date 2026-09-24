import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export const notify = (
  ctx: ExtensionContext,
  ...args: Parameters<ExtensionContext["ui"]["notify"]>
): void => {
  try {
    ctx.ui.notify(...args);
  } catch {
    // A failed notification must not interrupt Pi or trigger recovery again.
  }
};
