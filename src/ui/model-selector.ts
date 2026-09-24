import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  type Focusable,
  fuzzyFilter,
  Input,
  type KeybindingsManager,
  SelectList,
  type SelectListTheme,
  truncateToWidth,
} from "@earendil-works/pi-tui";

type SelectorTheme = {
  bold(text: string): string;
  fg(color: string, text: string): string;
};

const modelKey = (model: Model<Api>): string =>
  `${model.provider}\0${model.id}`;

const modelLabel = (model: Model<Api>): string =>
  `${model.provider}/${model.id}`;

const searchText = (model: Model<Api>): string =>
  `${model.provider} ${model.id} ${model.name}`;

const selectListTheme = (theme: SelectorTheme): SelectListTheme => ({
  selectedPrefix: (text) => theme.fg("accent", text),
  selectedText: (text) => theme.fg("accent", text),
  description: (text) => theme.fg("muted", text),
  scrollInfo: (text) => theme.fg("dim", text),
  noMatch: () => theme.fg("warning", "  No matching models"),
});

class ModelSelector implements Component, Focusable {
  private readonly input = new Input({
    prompt: "> ",
    placeholder: "Search available models",
  });
  private list: SelectList;
  private isFocused = false;

  constructor(
    private readonly title: string,
    private readonly models: Model<Api>[],
    private readonly theme: SelectorTheme,
    private readonly keybindings: KeybindingsManager,
    private readonly requestRender: () => void,
    private readonly done: (model: Model<Api> | undefined) => void,
    private readonly description: string,
  ) {
    this.list = this.createList(models);
  }

  get focused(): boolean {
    return this.isFocused;
  }

  set focused(value: boolean) {
    this.isFocused = value;
    this.input.focused = value;
  }

  render(width: number): string[] {
    const availableWidth = Math.max(0, width);
    const constrain = (line: string): string =>
      truncateToWidth(line, availableWidth, "");

    return [
      constrain(this.theme.fg("accent", this.theme.bold(this.title))),
      constrain(this.theme.fg("muted", this.description)),
      "",
      ...this.input.render(availableWidth),
      "",
      ...this.list.render(availableWidth),
      "",
      constrain(
        this.theme.fg("dim", "↑/↓ navigate  •  Enter select  •  Esc cancel"),
      ),
    ];
  }

  invalidate(): void {
    this.input.invalidate();
    this.list.invalidate();
  }

  handleInput(data: string): void {
    if (
      this.keybindings.matches(data, "tui.select.up") ||
      this.keybindings.matches(data, "tui.select.down") ||
      this.keybindings.matches(data, "tui.select.confirm") ||
      this.keybindings.matches(data, "tui.select.cancel")
    ) {
      this.list.handleInput(data);
      this.requestRender();
      return;
    }

    const previousQuery = this.input.getValue();
    this.input.handleInput(data);
    const query = this.input.getValue();
    if (query !== previousQuery) {
      this.list = this.createList(fuzzyFilter(this.models, query, searchText));
    }
    this.requestRender();
  }

  private createList(models: Model<Api>[]): SelectList {
    const items = models.map((model) => ({
      value: modelKey(model),
      label: modelLabel(model),
      description: model.name,
    }));
    const list = new SelectList(
      items,
      Math.min(Math.max(items.length, 1), 10),
      selectListTheme(this.theme),
    );
    list.onSelect = (item) => {
      const model = models.find(
        (candidate) => modelKey(candidate) === item.value,
      );
      if (model) this.done(model);
    };
    list.onCancel = () => this.done(undefined);
    return list;
  }
}

const sortedModels = (
  models: Model<Api>[],
  current: { provider: string; model: string } | undefined,
): Model<Api>[] => {
  const currentKey = current
    ? `${current.provider}\0${current.model}`
    : undefined;

  return [...models].sort((left, right) => {
    const leftIsCurrent = modelKey(left) === currentKey;
    const rightIsCurrent = modelKey(right) === currentKey;
    if (leftIsCurrent !== rightIsCurrent) return leftIsCurrent ? -1 : 1;
    return modelLabel(left).localeCompare(modelLabel(right));
  });
};

export const showModelSelector = async (
  ctx: ExtensionContext,
  title: string,
  current: { provider: string; model: string } | undefined,
  description = "Type to filter by provider, model ID, or model name.",
): Promise<Model<Api> | undefined> => {
  const models = sortedModels(ctx.modelRegistry.getAvailable(), current);
  if (models.length === 0) {
    ctx.ui.notify(
      "No models are available. Configure a provider in Pi first.",
      "warning",
    );
    return undefined;
  }

  if (
    current &&
    !models.some(
      (model) =>
        model.provider === current.provider && model.id === current.model,
    )
  ) {
    ctx.ui.notify(
      `${current.provider}/${current.model} is not available. Choose an available model instead.`,
      "warning",
    );
  }

  return ctx.ui.custom<Model<Api> | undefined>(
    (tui, theme, keybindings, done) =>
      new ModelSelector(
        title,
        models,
        theme,
        keybindings,
        () => tui.requestRender(),
        done,
        description,
      ),
  );
};
