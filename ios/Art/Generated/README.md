# MediEval Generated Art

Generated with the built-in image generation tool from the MediEval mockup as
the style reference. The current app screenshot was used as the target context.

## Atlases

- `sources/medieval-ui-atlas-chroma-v1.png`: original magenta-key UI atlas
- `sources/medieval-characters-atlas-chroma-v1.png`: original magenta-key character atlas
- `sources/medieval-environment-atlas-chroma-v1.png`: original magenta-key environment atlas
- `medieval-named-sprites-preview-v1.png`: contact sheet of the named sprite crops

Transparent atlas copies live in the Xcode asset catalog:

- `MediEvalUIAtlas`
- `MediEvalCharactersAtlas`
- `MediEvalEnvironmentAtlas`

## Named Sprites

The asset catalog also includes 45 extracted `MediEval*` image sets, including:

- verdict shields: `MediEvalShieldNay`, `MediEvalShieldHmm`, `MediEvalShieldAye`
- mascot sprites: `MediEvalSirWrongalot`, `MediEvalDameConfidens`
- guild sprites: `MediEvalEvalTable`, `MediEvalQuill`, `MediEvalScrollClerk`
- UI components: `MediEvalQuestBanner`, `MediEvalParchmentPanel`,
  `MediEvalProgressBar`, `MediEvalGoldPlate`, `MediEvalStreakPlate`
- environment pieces: `MediEvalStoneWallTile`, `MediEvalHangingBanner`,
  `MediEvalTorch`, `MediEvalWoodFrame`, `MediEvalGoldFrame`

The app currently uses `MediEvalSirWrongalot` and the three verdict shield
sprites directly. The remaining sprites are ready for the next visual pass.

## Transparency

The generated sources used a flat magenta chroma key. Transparent PNGs were
created with:

```bash
python3 ~/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py \
  --auto-key border \
  --soft-matte \
  --transparent-threshold 12 \
  --opaque-threshold 220 \
  --despill
```
