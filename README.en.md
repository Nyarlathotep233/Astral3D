# <img src="https://editor.astraljs.com/static/images/logo/logo.png" width="30" height="30"> Astral 3D Editor

🌍 [简体中文](README.md) | English

[![Online Demo](https://img.shields.io/badge/Online_Demo-Astral_3D_Editor-8732D7?style=for-the-badge&logo=google-chrome&logoColor=white)](https://editor.astraljs.com)

> Modern Web 3D editor based on Vue3 + Three.js

## ⚠️ Fork Notice

This repository is forked from [mlt131220/Astral3D](https://github.com/mlt131220/Astral3D). This repo is a community-maintained/derivative version and is not the official repository of the original author.

- Upstream: https://github.com/mlt131220/Astral3D
- License: Inherits and follows the original project's license and related notices

<div align="center">
  <img src="http://editor-doc.astraljs.com/images/home/thumbnailDark.png?t=20250518" width="800" alt="Editor City Preview">
  <img src="http://editor-doc.astraljs.com/images/home/industryDark.png?t=20250318" width="800" alt="Editor Preview">
</div>

## 💬 Join the community

Get the latest news and technical support in the following ways:

| ![QQ Group](https://img.shields.io/badge/QQ_Group-1040320579-07C160?logo=wechat&logoColor=white) | ![Contact Author](https://img.shields.io/badge/Contact_Author-WeChat(Business)-07C160?logo=wechat&logoColor=white) |
|---------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| <img src="https://fs.mhbdng.cn/astral3d/4851677b-661d-4e60-884d-414316290425.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=NQQLQF1YWRT2TJD5FA27%2F20251004%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20251004T155028Z&X-Amz-Expires=3600&X-Amz-Security-Token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJwYXJlbnQiOiJtbHQxMzEyMjAiLCJleHAiOjE3NTk2MjQ5MTJ9.j5yb8tpX9-NR38EzzO3TCYKkTy8gvDMV8KaLNIsqMiHdxrIgmE8TKQspHvnRhRJPrcOMJyYGnT_4AVPlAdZLyw&X-Amz-Signature=3f3f323627ece52ddc5b47d05a673363b0403540edaf1cc9bf6a2ff225738ba0&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject" width="200">                                                                            | <img src="https://fs.mhbdng.cn/astral3d/c1c7ecef-d655-4bb3-97e8-54402e3a48ef.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=NQQLQF1YWRT2TJD5FA27%2F20251004%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20251004T154710Z&X-Amz-Expires=3600&X-Amz-Security-Token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJwYXJlbnQiOiJtbHQxMzEyMjAiLCJleHAiOjE3NTk2MjQ5MTJ9.j5yb8tpX9-NR38EzzO3TCYKkTy8gvDMV8KaLNIsqMiHdxrIgmE8TKQspHvnRhRJPrcOMJyYGnT_4AVPlAdZLyw&X-Amz-Signature=88d0a04a67c06812258d6cd60bea6875b993008b859b51e6c0c83395ccf41aa1&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject" width="200">                                                                                         |



## 🚀 Core competence

### Core function
- ✅ Multi-format support: 30+ model format (GLTF/OBJ/FBX/GLB/RVT/IFC, etc.)
- ✅ BIM Model Lightweight Demonstration (RVT/IFC)
- ✅ CAD drawing analysis (DWG/DXF)
- ✅ Scenario subcontract storage and loading
- ✅ Animation editor

### Expansion capability
- 🧩 plug-in system
- 📜 When the script is running
- 💫 Particle system
- ❄️ Weather system
- ☁️ Cloud Storage Integration (USS again)
- 🎠 Resource center

### Coming soon
- 🚧 Physical engine support
- 🚧 WebGPU support
- 🚧 Data components (API/WebSocket)
- 🚧 low code data large screen
- 🚧 WebSocket Multi-party collaboration

## 🛠️ Technology stack

![Vue3](https://img.shields.io/badge/Vue-3.5.22-4FC08D?logo=vuedotjs)
![Three.js](https://img.shields.io/badge/Three.js-r176-000000?logo=threedotjs)
![Cesium](https://img.shields.io/badge/Cesium-1.107.0-0133B4?logo=cesium)
![NaiveUI](https://img.shields.io/badge/Naive_UI-2.43.1-66C060?logo=vue.js)
![UnoCSS](https://img.shields.io/badge/UnoCSS-0.46.5-333333?logo=unocss)

## ⚡ Quick start

### pre-demand
- Node.js ≥ 23.11.x
- Yarn

### Local run
```bash
    git clone git@gitlab.haolink.com:zhangzechao/astral3d.git

    cd Astral3D
    pnpm install
    pnpm run sdk:build
    pnpm run editor:dev
```

### Production construction
```bash
    pnpm run editor:build
```

## 📚 Ecological correlation

### Back-end implementation
[![Java Backend](https://img.shields.io/badge/Back_end_implementation-AstralService-00ADD8)](https://github.com/yx8663/astral-service)

### Document center
[![Documentation](https://img.shields.io/badge/Document_center-Astral_Docs-8732D7?logo=gitbook)](http://editor-doc.astraljs.com/)

## ☕ Support project

If this project is helpful to you, please feel free to:

1. In case wall [user] (https://github.com/mlt131220/Astral3D/issues/2) leave your usage scenario
2. Scan code support developers:

| AliPay                                                                    | WeChat                                                                       |
|---------------------------------------------------------------------------|------------------------------------------------------------------------------|
| <img src="https://editor-doc.astraljs.com/images/AliPay.png" width="200"> | <img src="https://editor-doc.astraljs.com/images/WeChatPay.png" width="200"> |

## ⚖️ License agreement

This project adopts the [![Apache License] (https://img.shields.io/badge/License-Apache_2.0-blue.svg)] (License) open source licenses, please comply with the terms of the agreement and the following supplementary conditions:

- ✅ allows: individual learning/secondary development
- ⚠️ A copyright notice is required
- ⚠️ commercial use requires authorization
- ❌ Prohibited: using this project for business or illegal purposes that are competitive with **hangzhou xingluan digital technology**

**[Full legal notice](LEGAL.md)** | **[Contribution guide](CONTRIBUTING.md)**

## 🌟 Star trend

[![Star History Chart](https://api.star-history.com/svg?repos=mlt131220/Astral3D&type=Date)](https://star-history.com/#mlt131220/Astral3D&Date)
