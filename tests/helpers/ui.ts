import type {
  ExtensionUIContext,
  KeybindingsManager as PiKeybindingsManager,
  Theme,
} from "@earendil-works/pi-coding-agent";
import {
  type Component,
  isFocusable,
  KeybindingsManager,
  type TUI,
  TUI_KEYBINDINGS,
} from "@earendil-works/pi-tui";
import { type Mock, vi } from "vitest";

type CustomFactory<T> = (
  tui: TUI,
  theme: Theme,
  keybindings: PiKeybindingsManager,
  done: (value: T) => void,
) => Component | Promise<Component>;

type UiHarness = {
  ui: {
    custom: ExtensionUIContext["custom"];
    confirm: Mock<ExtensionUIContext["confirm"]>;
    select: Mock<ExtensionUIContext["select"]>;
    notify: Mock<ExtensionUIContext["notify"]>;
  };
  interact: Mock<(component: Component) => void>;
  requestRender: Mock<() => void>;
  keybindings: KeybindingsManager;
};

export const uiHarness = (): UiHarness => {
  const interact = vi.fn<(component: Component) => void>();
  const requestRender = vi.fn<() => void>();
  const keybindings = new KeybindingsManager(TUI_KEYBINDINGS);
  const theme = {
    fg: (_color: string, text: string) => text,
    bold: (text: string) => text,
  } as Theme;
  const custom = async <T>(factory: CustomFactory<T>): Promise<T> => {
    const done = vi.fn<(value: T) => void>();
    const component = await factory(
      { requestRender } as unknown as TUI,
      theme,
      keybindings as PiKeybindingsManager,
      done,
    );
    if (isFocusable(component)) component.focused = true;
    interact(component);
    const completion = done.mock.calls[0];
    if (done.mock.calls.length !== 1 || !completion) {
      throw new Error("The UI interaction must complete exactly once.");
    }
    return completion[0];
  };
  const ui = {
    custom,
    confirm: vi.fn<ExtensionUIContext["confirm"]>().mockResolvedValue(true),
    select: vi.fn<ExtensionUIContext["select"]>(),
    notify: vi.fn<ExtensionUIContext["notify"]>(),
  } satisfies Partial<ExtensionUIContext>;
  return { ui, interact, requestRender, keybindings };
};

export const enterText = (component: Component, text: string): void => {
  component.handleInput?.(`\x1b[200~${text}\x1b[201~`);
};
