# code/web — the site

Pure static: no build step, no framework, it runs when you open it. Start it with
`./start.sh` in the repository root (port 3021, or set `PORT`).

## Layout

| Path | What's in it |
|------|--------------|
| `pages/` | Two pages: the full-screen demo (which is the home page) and the about page |
| `app/` | The shell (i18n, URL state, navigation), the stylesheet, the content-rendering parts |
| `app/figures/` | Figure modules, one per entry; `astra` also has the WebGL2 backend `astra-gl.js` |
| `data/` | `entries.json`, the content source of truth |
| `locales/` | Generated: per-language JSON, written by `code/shared/i18n/gen-i18n.py` |
| `dev-server.js` | The local server. It reads `vercel.json`, so local and production route alike |
| `vercel.json` | The same routing again, for static hosting — see below |

## Three rules

1. **Copy is tokens only.** No literal text in any language anywhere in the source,
   including the language names in the picker (`lang.endonym.*`, identical in all six
   columns). Guard: `code/tests/text_scan.py`.
2. **Parameters exist once.** Defaults live in `data/entries.json`. Copy them into a
   figure module and the page will eventually disagree with the source of truth.
   Guard: `code/tests/unit/test_content.py::test_params_live_only_in_the_source_of_truth`.
3. **State goes in the URL.** Language and the panel's open state both go through
   `AD_setParam` into the address bar, so a refresh and a shared link both survive.
   Guard: `code/tests/integration/test_site_http.py`.

## Where the numbers on the page come from

They are computed on the spot, every time, from the current parameters and the figure
module's `derived()` — never read back from a stored copy. This site is an argument that
parameters determine the shape; a number that disagrees with the picture would refute
its own point.

## Local routes vs. deployed routes

`dev-server.js` only ever runs locally. Static hosts don't execute it, so the clean
routes, the project-path prefix and the default page are written a second time in
`vercel.json`. The two must agree — guard: `code/tests/unit/test_deploy_routes.py`.
