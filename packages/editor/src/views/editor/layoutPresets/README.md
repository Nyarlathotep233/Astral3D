# 编辑器布局预设（layoutPresets）

`?layout=<key>` 通过 `registry.ts` 中的 `LAYOUT_PRESET_REGISTRY` 解析为 `EditorLayoutPreset`，经 `useEditorLayoutMode` 注入各布局区域。

## 内置资源（builtin）配置分两层

### 1. 分类开关（已实现，所有 category 通用）

在 `builtin/index.vue` 中生效，**不依赖** `types.ts` 里是否为每个 category 单独声明字段。

| 字段 | 含义 |
|------|------|
| `categories` | 左侧显示哪些 Tab（`BuiltinCategoryKey`） |
| `defaultCategory` | 默认选中的 Tab |

示例：只显示 Prefab + 材质，默认材质：

```ts
builtin: {
  categories: ["prefabs", "materials"],
  defaultCategory: "materials",
}
```

未写 `categories` 或值为 `"*"` 时，显示全部内置分类。

### 2. 分类内细粒度过滤（按 category 逐个接入）

仅当对应 `*.vue` 读取 `layoutPreset.resource.builtin.<category>` 时生效。**仅在 `types.ts` 增加字段而不改组件，配置无效。**

| category | 组件 | 类型字段（当前） | 列表结构 | 状态 |
|----------|------|------------------|----------|------|
| `prefabs` | `Prefabs.vue` | `prefabs.items` | 扁平 | ✅ 已接 |
| `models` | `Models.vue` | `models.subCategories` / `defaultSubCategory` / `items` | 按子分类分组 | ✅ 已接 |
| `materials` | `Materials.vue` | — | 按子分类分组（组件内写死） | ❌ 未接 |
| `particles` | `Particles.vue` | — | — | ❌ 未接 |
| `billboard` | `Billboard.vue` | — | — | ❌ 未接 |
| `htmlPanel` | `HtmlPanel.vue` | — | — | ❌ 未接 |
| `tiles` | `Tiles.vue` | — | — | ❌ 未接 |
| `lights` | `Lights.vue` | — | — | ❌ 未接 |
| `cameras` | `Cameras.vue` | — | — | ❌ 未接 |

#### 当前两种过滤形态（勿混用 `items` 语义）

- **扁平（prefabs）**：`items?: IncludeList<string>`，直接过滤资源的 `key`。
- **分组（models）**：
  - `subCategories` / `defaultSubCategory`：控制子分类 Tab；
  - `items?: Record<subCategoryKey, IncludeList<string>>`：按子分类过滤该组下的 `key`。

`models.items` 与 `prefabs.items` 同名不同义，是历史结构差异，不是类型写错。

## 新增布局预设

1. 在 `registry.ts` 定义预设并注册到 `LAYOUT_PRESET_REGISTRY`（**不必**在 `index.ts` re-export 常量，除非别处需要按名引用）。
2. URL：`/#/editor/<sceneId>?layout=<preset.key>`。

## 拓展其它 category 的细粒度控制（规范）

按顺序做，避免「只改 types / registry、组件不读」的无效配置：

1. **看组件**：该 category 的列表是扁平数组还是 `Record<subCategory, items[]>`。
2. **改组件**：`useInjectedEditorLayoutPreset()` + `filterByIncludeList` / `filterItemsByKey`（复用 `utils.ts`）。
3. **再改类型**：在 `types.ts` 的 `builtin` 下增加对应字段，形状与组件一致。
4. **再写 registry**：在布局预设里写具体白名单。

不要为每个 `BuiltinCategoryKey`  preemptively 在 `types.ts` 占位；**有组件实现再加类型**。

## 重构方向（统一类型，尚未实施）

目标：统一命名、减少 `items` 歧义，并便于 materials 等分组 category 接入。

```ts
/** 扁平资源列表（prefabs 及未来的单层 category） */
type BuiltinFlatFilter = {
  items?: IncludeList<string>;
};

/** 带子分类 Tab 的资源（models、未来的 materials） */
type BuiltinGroupedFilter<SubKey extends string> = {
  subCategories?: IncludeList<SubKey>;
  defaultSubCategory?: SubKey;
  /** 按子分类 key 过滤该组下的资源 key（勿与扁平 items 混用） */
  itemsBySubCategory?: Record<SubKey, IncludeList<string>>;
};

// 重构后 builtin 示意（二选一，实施时定稿）：
// A) 显式字段：prefabs?: BuiltinFlatFilter; models?: BuiltinGroupedFilter<ModelSubCategoryKey>; materials?: BuiltinGroupedFilter<MaterialSubCategoryKey>;
// B) 映射表：categoryFilters?: Partial<Record<BuiltinCategoryKey, BuiltinFlatFilter | BuiltinGroupedFilter<string>>>;
```

重构时同步：

- 将 `models.items` 重命名为 `itemsBySubCategory`（或迁移期兼容读取旧字段）。
- `Materials.vue` 等分组组件与 `Models.vue` 共用同一套读取/过滤 helper（可抽到 `builtin/useBuiltinCategoryFilter.ts`）。
- 更新 `registry.ts` 中已有预设字段名。

## 相关文件

| 文件 | 职责 |
|------|------|
| `types.ts` | `EditorLayoutPreset` 类型 |
| `registry.ts` | 预设定义与注册 |
| `utils.ts` | `IncludeList` 过滤工具 |
| `index.ts` | 对外导出（预设常量非必须导出） |
| `builtin/index.vue` | `categories` / `defaultCategory` |
| `builtin/*.vue` | 各分类资源与细粒度过滤 |
