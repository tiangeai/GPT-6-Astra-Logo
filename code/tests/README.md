# code/tests — the product tests

Tests for the site. They depend only on the product's own sources of truth
(`context.yaml`, `entries.json`, `translations.csv`).

| Path | What's in it |
|------|--------------|
| `common.py` | Shared fixtures: paths, the language list, HTTP helpers |
| `text_scan.py` | Scanner for hard-coded copy |
| `unit/` | Content, i18n, kinematics, page wiring, deploy routes, and the scanners' own tests |
| `integration/` | The site's HTTP surface: URL prefix, routes, state in the URL |

## The ones worth knowing about

- **`unit/test_content.py::test_no_image_gif_or_video_pipeline`** — the guard behind "the live
  page is the only form". The still, the GIF and the video once existed twice over: an
  offline Python pipeline committing 7.5 MB of binaries, and an in-page exporter. Both
  went on 2026-09-09; bring either back and this test goes red.
- **`unit/test_content.py::test_params_live_only_in_the_source_of_truth`** — the guard behind "the parameters
  exist exactly once". Copy a default out of `entries.json` into a figure module and the
  page starts disagreeing with the numbers it claims to be drawn from; this test goes red.
- **`unit/test_text_scan.py`** and **`unit/test_comment_language.py`** — the scanners'
  own tests. A scanner that only ever runs over an already-clean tree reports "fine"
  forever; replace its scan function with `return []` and only the *fire* cases here go
  red. That is what they are for.
- **`unit/test_page_wiring.py`** — every `<button>` a page renders must be bound to
  something. Two buttons once shipped fully styled, translated into six languages, and
  wired to nothing at all.
- **`unit/test_deploy_routes.py`** — `vercel.json` must still match the routing table in
  the filesystem. Miss one and only production 404s.

Run them with `./run-tests.sh` (it starts the site first if it isn't running).
