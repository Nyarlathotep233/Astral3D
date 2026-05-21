<template>
  <div ref="monacoEditorRef" class="h-full"></div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { useOsTheme } from "naive-ui";
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { useGlobalConfigStore } from "@/store/modules/globalConfig";

const props = withDefaults(defineProps<{
  source: string,
  mode: string,
  diff?: boolean,
  originalSource?: string,
  modifiedSource?: string,
  config?: {
    [key: string]: any
  }
}>(), {
  source: "",
  mode: "javascript",
  diff: false,
  originalSource: "",
  modifiedSource: "",
  config: () => ({})
})
const emits = defineEmits(["update:source"]);

const globalConfigStore = useGlobalConfigStore();
const osTheme = useOsTheme();
const monacoEditorRef = ref();
// 编辑器实列
let editor: monaco.editor.IStandaloneCodeEditor | null = null;
let diffEditor: monaco.editor.IStandaloneDiffEditor | null = null;
let model: monaco.editor.ITextModel | null = null;
let originalModel: monaco.editor.ITextModel | null = null;
let modifiedModel: monaco.editor.ITextModel | null = null;
// 导入的sqlLanguage
let sqlLanguage:any = null;
// sql语法提示示例
let sqlProvider:monaco.IDisposable | null = null;
let contentChangeDisposable: monaco.IDisposable | null = null;

const monacoTheme = computed(() => {
  const theme = globalConfigStore.theme;
  const isDark = theme === "darkTheme" || (theme === "osTheme" && osTheme.value === "dark");
  return isDark ? "vs-dark" : "vs";
});

onMounted(async () => {
  await nextTick();

  window.MonacoEnvironment = {
    getWorker(_, label) {
      if (label === 'json') {
        return new JsonWorker();
      }
      if (label === 'css' || label === 'scss' || label === 'less') {
        return new CssWorker();
      }
      if (label === 'html' || label === 'handlebars' || label === 'razor') {
        return new HtmlWorker();
      }
      if (label === 'typescript' || label === 'javascript') {
        return new TsWorker();
      }

      return new EditorWorker();
    },
  };

  await initMonaco();
})
onBeforeUnmount(() => {
  disposeEditor();
  disposeSql();
});

async function initMonaco() {
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });
  // 如果使用 Webpack 或其他打包工具，可以使用 importScripts
  monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ES2016,
    noImplicitAny: false, // 允许隐式 any 类型
    strict: false, // 禁用所有严格类型检查。
    allowJs: true,
    checkJs: false, // 禁用对 .js 文件的类型检查（仅解析语法）
    allowNonTsExtensions: true, // 允许非 .ts 文件的语法检查
  });

  // 添加 THREE 的全局声明，以便在 Monaco Editor 中使用而不报错
  // const response = await fetch('/libs/@types/three/index.d.ts');
  // const content = await response.text();
  // monaco.languages.typescript.javascriptDefaults.addExtraLib(
  //     content,
  //     'three.d.ts'
  // );

  await ensureSqlProvider();
  createEditor();
}

async function ensureSqlProvider() {
  if (props.mode !== "sql" || sqlProvider) return;

  if(!sqlLanguage){
    const { language } = await import("monaco-editor/esm/vs/basic-languages/sql/sql.js");
    sqlLanguage = language;
  }

  sqlProvider = monaco.languages.registerCompletionItemProvider('sql', {
    provideCompletionItems: (model, position) => {
      let suggestions:any = []
      const { lineNumber, column } = position
      const textBeforePointer = model.getValueInRange({
        startLineNumber: lineNumber,
        startColumn: 0,
        endLineNumber: lineNumber,
        endColumn: column,
      })
      const contents = textBeforePointer.trim().split(/\s+/)
      const lastContents = contents[contents?.length - 1];
      if (lastContents) {
        const sqlConfigKey = ['builtinFunctions', 'keywords', 'operators'];
        sqlConfigKey.forEach(key => {
          sqlLanguage[key].forEach(sql => {
            suggestions.push(
              {
                label: sql, // 显示的提示内容;
                insertText: sql, // 应插入到文档中的内容
                kind: monaco.languages.CompletionItemKind.Keyword
              }
            )
          })

        })
      }
      return {
        suggestions,
      }
    }
  })
}

function createEditor() {
  disposeEditor();

  if (!monacoEditorRef.value) return;

  if (props.diff) {
    createDiffEditor();
    return;
  }

  createSingleEditor();
}

function createSingleEditor() {
  model = monaco.editor.createModel(props.source || "", props.mode);
  editor = monaco.editor.create(monacoEditorRef.value, {
    model,
    ...Object.assign({
      theme: monacoTheme.value, // 官方自带三种主题 vs, hc-black, or vs-dark
      readOnly: false, // 是否只读内容不可编辑
      readOnlyMessage: { value: "不可以修改哦", supportThemeIcons: true, supportHtml: true }, // 为只读时编辑内日提示词
      codeLens: true, // 代码透镜
      folding: true, // 代码折叠
      snippetSuggestions: 'inline' as 'inline', // 代码提示
      tabCompletion: 'on' as 'on', // 代码提示按tab完成
      foldingStrategy: 'auto' as 'auto', // 折叠策略
      smoothScrolling: true, // 滚动动画
      // acceptSuggestionOnCommitCharacter: true, // 接受关于提交字符的建议
      // acceptSuggestionOnEnter: 'on', // 接受输入建议 "on" | "off" | "smart"
      // accessibilityPageSize: 10, // 辅助功能页面大小 Number 说明：控制编辑器中可由屏幕阅读器读出的行数。警告：这对大于默认值的数字具有性能含义。
      // accessibilitySupport: 'on', // 辅助功能支持 控制编辑器是否应在为屏幕阅读器优化的模式下运行。
      // autoClosingBrackets: 'always', // 是否自动添加结束括号(包括中括号) "always" | "languageDefined" | "beforeWhitespace" | "never"
      // autoClosingDelete: 'always', // 是否自动删除结束括号(包括中括号) "always" | "never" | "auto"
      // autoClosingOvertype: 'always', // 是否关闭改写 即使用insert模式时是覆盖后面的文字还是不覆盖后面的文字 "always" | "never" | "auto"
      // autoClosingQuotes: 'always', // 是否自动添加结束的单引号 双引号 "always" | "languageDefined" | "beforeWhitespace" | "never"
      // automaticLayout: true, // 自动布局
      // codeLensFontFamily: '', // codeLens的字体样式
      // codeLensFontSize: 13, // codeLens的字体大小
      // colorDecorators: true, // 呈现内联色彩装饰器和颜色选择器
      // comments: {
      //     ignoreEmptyLines: true, // 插入行注释时忽略空行。默认为真。
      //     insertSpace: true, // 在行注释标记之后和块注释标记内插入一个空格。默认为真。
      // }, // 注释配置
      contextmenu: true, // 启用上下文菜单
      // columnSelection: true, // 启用列编辑 按下shift键位然后按↑↓键位可以实现列选择 然后实现列编辑
      // autoSurround: 'never', // 是否应自动环绕选择
      // copyWithSyntaxHighlighting: true, // 是否应将语法突出显示复制到剪贴板中 即 当你复制到word中是否保持文字高亮颜色
      // cursorBlinking: 'smooth', // 光标动画样式
      // cursorSmoothCaretAnimation: 'on', // 是否启用光标平滑插入动画  当你在快速输入文字的时候 光标是直接平滑的移动还是直接"闪现"到当前文字所处位置
      // cursorStyle: 'line', // "Block"|"BlockOutline"|"Line"|"LineThin"|"Underline"|"UnderlineThin" 光标样式
      // cursorSurroundingLines: 0, // 光标环绕行数 当文字输入超过屏幕时 可以看见右侧滚动条中光标所处位置是在滚动条中间还是顶部还是底部 即光标环绕行数 环绕行数越大 光标在滚动条中位置越居中
      // cursorSurroundingLinesStyle: 'all', // "default" | "all" 光标环绕样式
      // cursorWidth: 2, // <=25 光标宽度
      minimap: {
        enabled: props.mode !== 'sql', // 是否启用预览图
      },
      // scrollbar: {
      //     verticalScrollbarSize: 5,
      //     horizontalScrollbarSize: 5,
      //     arrowSize: 10,
      //     alwaysConsumeMouseWheel: false,
      // },
      // links: true, // 是否点击链接
      // overviewRulerBorder: true, // 是否应围绕概览标尺绘制边框
      // renderLineHighlight: 'gutter', // 当前行突出显示方式
      // scrollBeyondLastLine: false, // 设置编辑器是否可以滚动到最后一行之后
      // lineNumbers: 'on',
      // lineNumbersMinChars: 0,

      // fontSize: 13,
      // roundedSelection: false, // 右侧不显示编辑器预览框
      // autoIndent: 'full',
      // formatOnType: true,
      // formatOnPaste: true
    }, props.config)
  });

  contentChangeDisposable = editor.onDidChangeModelContent(() => {
    if (!editor) return;
    emits('update:source', editor.getValue());
  });
}

function createDiffEditor() {
  originalModel = monaco.editor.createModel(props.originalSource || "", props.mode);
  const nextModified = props.modifiedSource || props.source || "";
  modifiedModel = monaco.editor.createModel(nextModified, props.mode);

  diffEditor = monaco.editor.createDiffEditor(monacoEditorRef.value, {
    theme: monacoTheme.value,
    renderSideBySide: true,
    readOnly: true,
    originalEditable: false,
    minimap: {
      enabled: false,
    },
    automaticLayout: true,
    ...props.config
  });

  diffEditor.setModel({
    original: originalModel,
    modified: modifiedModel
  });
}

function disposeEditor() {
  if (contentChangeDisposable) {
    contentChangeDisposable.dispose();
    contentChangeDisposable = null;
  }

  if (editor) {
    editor.dispose();
    editor = null;
  }

  if (diffEditor) {
    diffEditor.dispose();
    diffEditor = null;
  }

  if (model) {
    model.dispose();
    model = null;
  }

  if (originalModel) {
    originalModel.dispose();
    originalModel = null;
  }

  if (modifiedModel) {
    modifiedModel.dispose();
    modifiedModel = null;
  }
}

function disposeSql() {
  if(sqlProvider){
    sqlProvider.dispose();
    sqlProvider = null;
  }

  if(sqlLanguage){
    sqlLanguage = null;
  }
}

function syncModelValue(targetModel: monaco.editor.ITextModel | null, value: string) {
  if (!targetModel) return;
  const nextValue = value || "";

  if (targetModel.getValue() === nextValue) {
    return;
  }

  targetModel.setValue(nextValue);
}

watch(() => props.diff, () => {
  createEditor();
});

watch(() => props.mode, async () => {
  await ensureSqlProvider();
  createEditor();
});

watch(() => props.source, (value) => {
  if (props.diff) {
    if (props.modifiedSource) return;
    syncModelValue(modifiedModel, value || "");
    return;
  }

  syncModelValue(model, value || "");
});

watch(() => props.originalSource, (value) => {
  if (!props.diff) return;
  syncModelValue(originalModel, value || "");
});

watch(() => props.modifiedSource, (value) => {
  if (!props.diff) return;
  syncModelValue(modifiedModel, value || "");
});

watch(() => props.config, () => {
  createEditor();
}, { deep: true });

watch(monacoTheme, (theme) => {
  monaco.editor.setTheme(theme);
});

watch(() => monacoEditorRef.value, () => {
  if (!monacoEditorRef.value) return;
  createEditor();
});

function getCurrentMarkers() {
  const target = props.diff ? modifiedModel : model;
  if (!target) return [];
  return monaco.editor.getModelMarkers({ resource: target.uri });
}

function getErrors() {
  const markers: string[] = [];
  const ignoreError = ["All destructured elements are unused", "is declared but its value is never read"];
  getCurrentMarkers().forEach(marker => {
    const { message, severity, startLineNumber, startColumn, endLineNumber, endColumn } = marker;

    if (severity !== monaco.MarkerSeverity.Error) return;

    const isIgnore = ignoreError.some(ignore => message.indexOf(ignore) >= 0);

    if (isIgnore) return;

    markers.push(`${message} [${startLineNumber}行${startColumn}列 - ${endLineNumber}行${endColumn}列]`);
  });

  return markers;
}

defineExpose({
  getErrors
})
</script>
