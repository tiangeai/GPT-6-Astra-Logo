# GPT-6 Astra —— 把那片星空重建成数学

[English](README.md) · **简体中文** · [日本語](README.ja.md)

OpenAI [GPT-6 Astra 发布页](https://openai.com/index/gpt-6-astra/)主视觉的开源复刻：
五条贝塞尔笔画、约 4600 颗向核心流动的星、一片先散开再收拢的天。

线上：<https://gpt-6-astra-logo.vercel.app/>

## 原版与复刻

| [OpenAI 发布页](https://openai.com/index/gpt-6-astra/) | [本项目复刻](https://gpt-6-astra-logo.vercel.app/) |
|---|---|
| ![原版](docs/media/openai-original.gif) | ![复刻](docs/media/reconstruction.gif) |

## 快速开始

需要 Python 3。

```bash
./start.sh     # 启动 http://localhost:3021/
```

## 目录

| 路径 | 放什么 |
|------|--------|
| `code/web/` | 站点本体 |
| `code/shared/i18n/` | 六种语言的文案表 |
| `code/tests/` | 测试 |
| `docs/media/` | 上面那两段 GIF |

## 部署

Vercel，根目录设为 `code/web`。
