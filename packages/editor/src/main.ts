import '@/utils/common/init';

import { createApp } from 'vue';
import App from './App.vue';
import { setupStore } from '@/store';

import 'virtual:uno.css';
import "animate.css/animate.min.css";
import '@/assets/less/index.less';

import {setupI18n} from '@/language';
import {setupRouter} from "@/router";

// import DisableDevtool from 'disable-devtool';

function suppressLicenseWatermark() {
    // In some deployments the production bundle (or upstream service) injects a license watermark overlay.
    // If it exists, it is always safe for the OSS build to remove/hide it.
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const WATERMARK_ID = 'astral3d-license-watermark';

    const removeOnce = () => {
        const el = document.getElementById(WATERMARK_ID);
        if (el) el.remove();
    };

    // Remove immediately (in case it was injected before app bootstrap)
    removeOnce();

    // Keep removing if something re-injects it after boot.
    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            for (const node of Array.from(m.addedNodes)) {
                if (!(node instanceof HTMLElement)) continue;
                if (node.id === WATERMARK_ID) {
                    node.remove();
                    continue;
                }
                const inner = node.querySelector?.(`#${WATERMARK_ID}`);
                if (inner) inner.remove();
            }
        }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
}

async function main() {
    suppressLicenseWatermark();

    const app = createApp(App);

    setupRouter(app);

    // 配置存储
    setupStore(app);

    // 多语言配置
    setupI18n(app);

    app.mount('#app');

    // 已禁用开发者工具阻止功能，允许使用 F12
    // if (import.meta.env.PROD){
    //     DisableDevtool({
    //         clearLog:true
    //     });
    // }
}

main();




