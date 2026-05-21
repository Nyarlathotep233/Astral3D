import {ref} from 'vue';
import {defineStore} from 'pinia';
import {darkTheme, useOsTheme} from "naive-ui";
import type {GlobalTheme} from 'naive-ui';
import { useStorage } from '@vueuse/core';
import {store} from '@/store';
import {generate} from '@ant-design/colors'
import {App} from "@astral3d/engine";

const osThemeRef = useOsTheme();

/**
 * 全局配置
 */
export const useGlobalConfigStore = defineStore('global-config', () => {
    /* 主题 */
    const themeLocal = useStorage<IConfig.Theme>("astral-theme",  "darkTheme");
    const getProviderTheme = (): GlobalTheme => <GlobalTheme>(themeLocal.value === 'osTheme' ? (osThemeRef.value === 'dark' ? darkTheme : null) : themeLocal.value === 'lightTheme' ? null : darkTheme);
    const themeLink = {
        'osTheme': {
            next: 'lightTheme',
            prev: 'darkTheme'
        },
        'lightTheme': {
            next: 'darkTheme',
            prev: 'osTheme'
        },
        'darkTheme': {
            next: 'osTheme',
            prev: 'lightTheme'
        }
    }
    const setTheme = () => {
        const current = themeLocal.value || 'darkTheme';
        const next = <IConfig.Theme>themeLink[current].next;
        themeLocal.value = next;

        App.config.setKey("theme", next.replace("Theme", ""));
        if (window.viewer) {
            // 设置viewHelper外观
            window.viewer.modules.viewHelper.setConfig();
        }
    }

    /* i18n */
    const localeLocal = useStorage<IConfig.Locale>("astral-locale",  "zh-CN");
    const setLocaleLocal = (local:IConfig.Locale) => {
        localeLocal.value = local;
    }

    /* 主色 */
    const mainColor = useStorage<IConfig.Color>("astral-main-color",  {
        "CMYK": [99, 48, 11, 1],
        "RGB": [23, 114, 180],
        "hex": "#1772b4",
        "hexHover": "#388dc2",
        "hexPressed": "#033869",
        "hexSuppl": "#0b548f",
        "name": "\u7fa4\u9752",
        "pinyin": "qunqing"
    });
    const setPrimaryColor = (color: IConfig.Color) => {
        const colors = generate(color.hex);

        color.hexHover = colors[4] // Hover浅一些，取第5个颜色
        color.hexSuppl = colors[6] // 比主色深一档，取第7个颜色
        color.hexPressed = colors[7]

        mainColor.value = color;

        App.config.setKey("mainColor",color.hexHover);

        if (window.viewer) {
            // 设置viewer grid中心校以及边线颜色
            window.viewer.initGrid();
            // 设置viewHelper外观
            window.viewer.modules.viewHelper.setConfig();
        }
    }

    /* 全局Loading */
    const loading = ref(false);
    const loadingText = ref("");

    return {
        theme: themeLocal,
        locale: localeLocal,
        mainColor,
        loading,
        loadingText,
        getProviderTheme,
        setTheme,
        setLocale: setLocaleLocal,
        setPrimaryColor
    }
});

// setup 之外使用
export function useGlobalConfigStoreWithOut() {
    return useGlobalConfigStore(store);
}
