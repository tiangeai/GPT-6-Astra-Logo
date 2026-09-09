# figures — the figure modules

One module per entry, exporting three things:

- `build(params)` — anything that needs sampling (a particle field, say) is generated
  here, and must use the deterministic RNG in `rng.js`;
- `derived(params)` — the derived values the page displays, computed on the spot, never
  stored;
- `create(canvas, params, opts)` — returns a controller (`start` / `stop` / `resize` /
  `setParams` / `setPointer` / `seek` / `replay` …).

## astra: the model lives in astra.js, with two backends

Read the header of `astra.js` first — it *is* the definition of the model. Since
2026-09-08 it is a line-by-line reconstruction of the definition the original page ships
in its own client script: five SVG strokes, stars scattered along the arms, hero stars,
a five-colour palette, the core cluster, inward flow, twinkle, and the scatter-then-
gather entrance with the point optics. `build()`, `evolve()`, `pointProfile()` and
`tonemap()` are the shared mathematics; the backends follow them exactly.

| File | When it runs | What it does |
|------|--------------|--------------|
| `astra-gl.js` | Default. Needs WebGL2 and `EXT_color_buffer_float` | The vertex shader transcribes `evolve()`, the fragment shader `pointProfile()`; stars accumulate linearly into RGBA16F, then five mip levels of bloom, lens flare, grain, ACES, sRGB and the corner ambient light |
| `create2d` in `astra.js` | Fallback when there is no float render target | Pre-baked sprites (ACES and sRGB already applied) added with `lighter`, bloom approximated with a mip chain. It guarantees a picture, not a pixel-identical one |

Star diameters are in **CSS pixels** (they do not scale with the viewport) and the
drawing buffer's pixel ratio converges on a pixel budget (`pixelBudget`,
`maxPixelRatio`) — both are the original's own rules.

## Live only

Every frame is computed on the spot, in the visitor's browser, from the parameters in
`entries.json`. There is nothing to render offline and nothing to save: the still, GIF
and video forms, the in-page export and the headless-Chrome pipeline behind them were
all removed on 2026-09-09. Guard for the kinematics and the entrance:
`test_astra_motion.py`.
