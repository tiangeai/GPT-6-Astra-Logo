# GPT-6 Astra — the star field, rebuilt as mathematics

**English** · [简体中文](README.zh-Hans.md) · [日本語](README.ja.md)

An open-source reconstruction of the hero animation on OpenAI's
[GPT-6 Astra announcement page](https://openai.com/index/gpt-6-astra/): five Bézier
strokes, about 4,600 stars streaming toward the core, and a scattered sky that gathers
into shape.

Live: <https://gpt-6-astra-logo.vercel.app/>

## Original and reconstruction

| [OpenAI's announcement page](https://openai.com/index/gpt-6-astra/) | [This reconstruction](https://gpt-6-astra-logo.vercel.app/) |
|---|---|
| ![The original](docs/media/openai-original.gif) | ![The reconstruction](docs/media/reconstruction.gif) |

## Quick start

Requires Python 3.

```bash
./start.sh     # serves http://localhost:3021/
```

## Layout

| Path | What's in it |
|------|--------------|
| `code/web/` | The site |
| `code/shared/i18n/` | The copy, in six languages |
| `code/tests/` | Tests |
| `docs/media/` | The two GIFs above |

## Deployment

Vercel, root directory `code/web`.
