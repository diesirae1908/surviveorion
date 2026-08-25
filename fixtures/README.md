# Fixtures

## day43 (primary acceptance clip)

- **Video**: `orion_2026-08-25_day43_arsenal_3490380.webm` (~44 MB, not committed; gitignored)
- **Sidecar**: `orion_2026-08-25_day43_arsenal_3490380.json` (pair with the video; not present as of repo init)

Copy the video from Lucas's Downloads:

```bash
cp ~/Downloads/orion_2026-08-25_day43_arsenal_3490380.webm fixtures/
```

When the JSON sidecar ships from the game, place it beside the video with the same basename.
Harvest fails loudly if the pair is unpaired; never guess sidecar fields from the filename alone.

Hand-written JSON sidecars for unit tests live in `test/fixtures/`.
