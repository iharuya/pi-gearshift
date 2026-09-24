import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import { formatGearBias, GEAR_BIAS_MAX, GEAR_BIAS_MIN } from "../settings.js";

const STEPS_PER_UNIT = 20;
const GEAR_BIAS_STEP = 1 / STEPS_PER_UNIT;
const MIN_STEP = GEAR_BIAS_MIN * STEPS_PER_UNIT;
const MAX_STEP = GEAR_BIAS_MAX * STEPS_PER_UNIT;
const MIN_TRACK_WIDTH = 5;
const MAX_TRACK_WIDTH = 31;

type SliderTheme = {
  bold(text: string): string;
  fg(color: string, text: string): string;
};

const clampStep = (step: number): number =>
  Math.max(MIN_STEP, Math.min(MAX_STEP, step));

class GearBiasSlider {
  private step: number;

  constructor(
    initialValue: number,
    private readonly theme: SliderTheme,
    private readonly requestRender: () => void,
    private readonly done: (value: number | undefined) => void,
  ) {
    this.step = clampStep(Math.round(initialValue * STEPS_PER_UNIT));
  }

  render(width: number): string[] {
    const availableWidth = Math.max(0, width);
    const constrain = (line: string): string =>
      truncateToWidth(line, availableWidth, "");

    return [
      constrain(this.theme.fg("accent", this.theme.bold("Gearshift Settings"))),
      "",
      constrain(
        `Gear bias  ${this.theme.fg("accent", this.theme.bold(formatGearBias(this.value)))}`,
      ),
      "",
      constrain(this.renderSlider(availableWidth)),
      "",
      constrain(
        this.theme.fg(
          "muted",
          `←/→ adjust by ${GEAR_BIAS_STEP.toFixed(2)}  •  Enter save  •  Esc cancel`,
        ),
      ),
    ];
  }

  invalidate(): void {}

  handleInput(data: string): void {
    if (matchesKey(data, Key.left)) {
      this.adjust(-1);
      return;
    }
    if (matchesKey(data, Key.right)) {
      this.adjust(1);
      return;
    }
    if (matchesKey(data, Key.enter)) {
      this.done(this.value);
      return;
    }
    if (matchesKey(data, Key.escape)) {
      this.done(undefined);
    }
  }

  private get value(): number {
    return this.step / STEPS_PER_UNIT;
  }

  private adjust(delta: number): void {
    const nextStep = clampStep(this.step + delta);
    if (nextStep === this.step) return;

    this.step = nextStep;
    this.requestRender();
  }

  private renderSlider(width: number): string {
    const leftLabel = "Light";
    const rightLabel = "Heavy";
    const labelsWidth = visibleWidth(leftLabel) + visibleWidth(rightLabel) + 4;
    const trackWidth = Math.min(MAX_TRACK_WIDTH, width - labelsWidth);

    if (trackWidth >= MIN_TRACK_WIDTH) {
      return `${leftLabel}  ${this.renderTrack(trackWidth)}  ${rightLabel}`;
    }

    return `Light  ← ${formatGearBias(this.value)} →  Heavy`;
  }

  private renderTrack(width: number): string {
    const progress = (this.step - MIN_STEP) / (MAX_STEP - MIN_STEP);
    const markerIndex = Math.round(progress * (width - 1));
    const cells: string[] = Array.from({ length: width }, (_, index) =>
      index === 0 || index === width - 1 ? "○" : "─",
    );
    cells[markerIndex] = this.theme.fg("accent", "●");
    return cells.join("");
  }
}

export const showGearBiasSlider = async (
  ctx: ExtensionCommandContext,
  initialValue: number,
): Promise<number | undefined> =>
  ctx.ui.custom<number | undefined>(
    (tui, theme, _keybindings, done) =>
      new GearBiasSlider(initialValue, theme, () => tui.requestRender(), done),
  );
