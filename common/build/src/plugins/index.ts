import type {PluginOption} from 'vite';
import topLevelAwait from "vite-plugin-top-level-await";
import EnhanceLog from 'vite-plugin-enhance-log';

import {createConfigPluginConfig} from "./appConfig.ts";
import {configCompressPlugin} from "./compress.ts";
import {configVisualizerConfig} from "./visualizer.ts";

interface Options {
    isBuild: boolean;
    root: string;
    compress: {
        compress: "gzip" | "brotli" | "none";
        deleteOriginFile: boolean;
    };
    enableAnalyze?: boolean;
    enableConfig?: boolean;
    nativeTopLevelAwait?: boolean;
}

export async function createPlugins({isBuild,compress,enableAnalyze,enableConfig,nativeTopLevelAwait = false}: Options) {
    const vitePlugins: (PluginOption | PluginOption[])[] = [
        ...(nativeTopLevelAwait ? [] : [topLevelAwait({
            // 每个块模块的顶级await promise的导出名称
            promiseExportName: "__tla",
            // 用于在每个块模块中生成顶级await承诺的导入名称的函数
            promiseImportName: i => `__tla_${i}`
        })]),
        EnhanceLog({
            /** 高亮文件名（firefox不支持） */
            colorFileName: true,
            splitBy: '\n',
            preTip: '🚀🚀🚀🚀🚀🚀',
            enableFileName: { enableDir: false}
        }),
    ];

    if(enableConfig){
        const appConfigPlugin = await createConfigPluginConfig(isBuild);
        vitePlugins.push(appConfigPlugin);
    }

    // 以下插件只在生产环境中工作
    if (isBuild) {
        // rollup-plugin-gzip
        vitePlugins.push(configCompressPlugin(compress));

        // 打包视图分析 rollup-plugin-visualizer
        if (enableAnalyze) {
            vitePlugins.push(configVisualizerConfig());
        }
    }

    return vitePlugins;
}