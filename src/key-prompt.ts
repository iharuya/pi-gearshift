import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  Container,
  CURSOR_MARKER,
  type Focusable,
  Input,
  Key,
  matchesKey,
  Text,
  truncateToWidth,
} from "@earendil-works/pi-tui";
import { UserFacingError } from "./errors.js";

class SecretInput extends Input {
  override render(width: number): string[] {
    const length = [...this.getValue()].length;
    const bullets = "•".repeat(Math.min(length, Math.max(0, width - 2)));
    const cursor = this.focused ? `${CURSOR_MARKER}\x1b[7m \x1b[27m` : "";
    return [truncateToWidth(bullets + cursor, width, "")];
  }
}

type PromptTheme = {
  bold(text: string): string;
  fg(color: string, text: string): string;
};

class KeyPrompt extends Container implements Focusable {
  private readonly input = new SecretInput();
  private isFocused = false;

  constructor(theme: PromptTheme, done: (value: string | undefined) => void) {
    super();
    this.addChild(
      new Text(theme.fg("accent", theme.bold("TypeSafe API key")), 1, 0),
    );
    this.addChild(
      new Text(
        theme.fg(
          "muted",
          "Paste a key from console.typesafe.ai. Input is hidden. Enter saves, Esc cancels.",
        ),
        1,
        0,
      ),
    );
    this.addChild(this.input);
    this.input.onSubmit = done;
    this.input.onEscape = () => done(undefined);
  }

  get focused(): boolean {
    return this.isFocused;
  }

  set focused(value: boolean) {
    this.isFocused = value;
    this.input.focused = value;
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) {
      this.input.onEscape?.();
      return;
    }
    this.input.handleInput(data);
  }
}

export const promptForApiKey = async (
  ctx: ExtensionContext,
): Promise<string | undefined> => {
  if (ctx.mode !== "tui") {
    throw new UserFacingError(
      "Interactive login requires Pi's TUI. Set TYPESAFE_API_KEY for headless use.",
    );
  }

  return ctx.ui.custom<string | undefined>(
    (_tui, theme, _keybindings, done) => new KeyPrompt(theme, done),
  );
};
