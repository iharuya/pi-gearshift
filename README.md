# pi-gearshift

![pi-gearshift routes every request to the right gear](assets/what-is-this.png)

Let [Jev](https://typesafe.ai/) choose the model and thinking level for each turn in the Pi Coding Agent.

pi-gearshift routes requests to three user-defined gears:

- `light` — straightforward, low-risk work
- `standard` — typical implementation and debugging
- `heavy` — deep, ambiguous, broad, or high-risk work

## Install

```bash
pi install npm:pi-gearshift
```

Set `TYPESAFE_API_KEY`, or start Pi and run:

```text
/gearshift login
```

## Configure

Create `~/.pi/agent/pi-gearshift/settings.json`:

```json
{
  "enabled": false,
  "gearBias": 0,
  "gears": {
    "light": {
      "provider": "your-provider",
      "model": "your-light-model",
      "thinkingLevel": "low"
    },
    "standard": {
      "provider": "your-provider",
      "model": "your-standard-model",
      "thinkingLevel": "medium"
    },
    "heavy": {
      "provider": "your-provider",
      "model": "your-heavy-model",
      "thinkingLevel": "high"
    }
  }
}
```

You are responsible for choosing model targets that your Pi setup can access. `gearBias` ranges from `-1` to `1`: negative values favor lighter gears, positive values favor heavier gears, and `0` is neutral.

Enable automatic routing:

```text
/gearshift enable
```

Set `PI_GEARSHIFT_DATA_DIR` to use a different data directory.

## Commands

```text
/gearshift status
/gearshift use light|standard|heavy
/gearshift enable
/gearshift disable
/gearshift login
/gearshift logout
```

Manual switching works even while automatic routing is disabled.

## How it works

For each request, Jev scores the capability needed for the next coding-agent turn. pi-gearshift applies the configured bias, selects a gear, and switches the model and thinking level before Pi starts working.

The routing state contains the complete current request and up to 10 recent user or assistant messages. Recent messages are middle-truncated to 256 characters each; thinking blocks, tool calls, and tool results are excluded.

Routing failures are not retried. Pi keeps the current model whenever routing or model application fails.

## Privacy

The current request and bounded recent conversation are sent to TypeSafe for routing. They are not persisted in pi-gearshift's settings or logs.

## License

MIT
