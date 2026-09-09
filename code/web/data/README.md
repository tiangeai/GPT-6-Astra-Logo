# data — the content source of truth

`entries.json` is the only content source this site has: the entry, its parameters,
formulas, sliders, design language and provenance. The page canvas reads it and nothing
else does — that is where `context.yaml`'s requirement lands, the one saying the picture
must be driven by a parameter set that exists exactly once.

## Shape of an entry

| Field | Meaning |
|-------|---------|
| `figure` | Which figure module draws it (`app/figures/<figure>.js`) |
| `params` | **The** parameter set. Default values exist here and nowhere else |
| `controls` | Sliders: `key` must name a key in `params`, and the default must fall inside `[min, max]` |
| `math` | The blocks of mathematics. `formula` is data, not copy — it stays out of the token table, so it must not contain a sentence in any language. `show` names the parameters and derived values to display |
| `language` | Design language: the palette plus a few principles (all tokens) |
| `origin` | Split into `verifiedTokens` (checkable) and `reconstructedTokens` (rebuilt here). Never mixed |

All text is tokens only; the translations live in
`code/shared/i18n/translations.csv`. Validation: `code/tests/unit/test_content.py`.
