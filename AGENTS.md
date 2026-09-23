# pi-gearshift

`pi-gearshift` is an extension for the Pi Coding Agent that selects the model or thinking level using decisions from Jev.

## Concept

```
User: "Investigate the race condition in auth"
        ↓
       Jev
        ↓
  Starndard mode
        ↓
Assistant: "The root cause is..."

User: "Now just fix the comments"
        ↓
       Jev
        ↓
   Light mode
        ↓
     edit → done

User: "Is this architecture actually sound?"
        ↓
       Jev
        ↓
    Heavy mode
        ↓
Assistant: "Analyzing trade-offs..."
```

## Error handling

Jev is an optional routing aid and must never be a prerequisite for starting the agent. Catch judgment, validation, and model-application failures at the routing boundary; use a safe fallback without retrying, and continue with the current setting if the fallback cannot be applied.

## Development of this extension

- `cp .envrc.example .envrc` (Assuming `direnv` is installed)
- The persistent data directory managed by this extension is `PI_GEARSHIFT_DATA_DIR`.
- `pnpm exec pi -e .` to test manually
