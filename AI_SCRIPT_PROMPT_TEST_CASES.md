# AI 脚本生成测试用例（多场景抽卡版）

## 目标

验证前端通过 `POST /llm-api/chat/stream` 流式生成脚本时，在不同需求类型下能返回“可运行、可应用、可理解”的脚本，不局限于旋转场景。

---

## 测试环境

- 编辑器入口：`https://localhost:8090/#/editor/9d7e80cd0a8956bf0be2d100d9c31ea9`
- 推荐对象：`Box` / `Box2`（按实际场景对象名）
- AI 接口由 `astral-llm-service` 已有流式接口提供，前端通过 Nginx 反向代理访问：
  - `POST /llm-api/chat/stream`
  - 监听 `meta` / `reasoning` / `message` / `done` / `error` 事件

---

## 通用规则（所有用例都检查）

- 返回体应包含：`result.source`（非空字符串）
- 禁止明显错误：
  - `function afterAnimation(obj, time)`
  - `function onKeydown(...)`
  - `window.xxx = ...` / `globalThis.xxx = ...`
- 如果脚本有连续动画循环，应在 `afterAnimation` 中调用 `toBeRender(true)`。
- 允许少量业务偏差（抽卡策略），但代码需可运行、无明显 API 误用。

---

## 抽卡执行策略（推荐）

每条用例连续生成 3 次：

1. 记录通过次数（0~3）
2. 通过率 >= 2/3 记为“稳定可用”
3. 通过率 < 2/3 记为“需优化提示/后处理”

---

## 用例矩阵

### A. 旋转与键盘（基础动作）

#### TC-A01 基础旋转（Y 轴）
- 输入：`让对象绕 Y 轴旋转`
- 最小验收：
  - 存在 `afterAnimation(delta, toBeRender)`
  - 包含 `rotation.y` 旋转逻辑
  - 包含 `toBeRender(true)`

#### TC-A02 旋转 + 暂停切换
- 输入：`让对象绕 Z 轴旋转并支持空格暂停`
- 最小验收：
  - 包含 `rotation.z`
  - 包含 `onKeyDown(event)` 和 `Space`/空格判断
  - 暂停状态是脚本局部变量

#### TC-A03 指定速度表达
- 输入：`让对象沿X轴每秒45度旋转`
- 最小验收：
  - 速度使用“度/秒 -> 弧度/帧”换算（`degToRad(...) * delta`）
  - 包含 `rotation.x`

---

### B. 点击与指针交互

#### TC-B01 单击切换可见性
- 输入：`单击模型时切换模型显示/隐藏`
- 最小验收：
  - 存在 `onPick(intersect)`
  - 操作 `this.visible` 或目标对象 `visible`

#### TC-B02 双击重置位置
- 输入：`双击模型时把位置重置到原点`
- 最小验收：
  - 存在 `onDoubleClick(intersect)`
  - 位置重置逻辑（如 `position.set(0,0,0)`）

#### TC-B03 拖动跟随（指针）
- 输入：`按下鼠标后移动时让对象沿X轴跟随，抬起停止`
- 最小验收：
  - 存在 `onPointerDown/onPointerMove/onPointerUp`
  - 至少有“按下-移动-抬起”的状态流转

---

### C. 数据绑定与外部数据驱动

#### TC-C01 bindDataChange 驱动缩放
- 输入：`当数据变化时，根据 data.value 修改模型缩放`
- 最小验收：
  - 存在 `bindDataChange(data, config, index)`
  - 使用 `data` 值更新 `scale`

#### TC-C02 bindDataChange 驱动颜色
- 输入：`收到数据后根据状态切换材质颜色`
- 最小验收：
  - 在 `bindDataChange` 里访问材质（如 `material.color`）
  - 对异常数据有最小容错（空值判断）

---

### D. Helper 与对象操作

#### TC-D01 helper.objectByUuid 查找对象并高亮
- 输入：`通过 uuid 查找到对象并把颜色改成红色`
- 最小验收：
  - 出现 `helper.objectByUuid(...)`
  - 找到对象后执行可见效果变更

#### TC-D02 helper.moveObject 调整层级
- 输入：`把当前对象移动到指定父节点下`
- 最小验收：
  - 使用 `helper.moveObject(object, parent, before?)`
  - 逻辑不直接伪造不存在 API

#### TC-D03 helper.removeObject 删除对象
- 输入：`按 Delete 键删除当前对象`
- 最小验收：
  - `onKeyDown(event)` 中识别 Delete
  - 调用 `helper.removeObject(this)` 或目标对象

---

### E. 动画系统（helper.Animation）

#### TC-E01 loaded 自动播放动画
- 输入：`场景加载后播放对象动画 walk`
- 最小验收：
  - 存在 `const anime = new helper.Animation(this)`（或等价）
  - `loaded()` 内调用 `anime.play(...)`

#### TC-E02 按键切换动画
- 输入：`按1播放run，按2播放idle`
- 最小验收：
  - `onKeyDown(event)` 中按键分支
  - 调用 `anime.stop()/anime.play(...)` 或等价

#### TC-E03 销毁前停止动画
- 输入：`场景销毁前停止正在播放的动画`
- 最小验收：
  - 存在 `beforeDestroy()`
  - 在 `beforeDestroy` 中调用 `anime.stop()`

---

### F. 生命周期与清理

#### TC-F01 初始化日志
- 输入：`在 loaded 中打印 this 和 scene 基本信息`
- 最小验收：
  - 存在 `loaded()`
  - 合理使用内置变量，不引用不存在对象

#### TC-F02 定时更新 + 渲染驱动
- 输入：`每帧更新计时并在变化时请求渲染`
- 最小验收：
  - 使用 `afterAnimation(delta, toBeRender)`
  - 有条件地调用 `toBeRender(true)`

#### TC-F03 beforeDestroy 清理状态
- 输入：`在销毁前清理事件状态和临时变量`
- 最小验收：
  - 存在 `beforeDestroy()`
  - 有明确状态重置/清理逻辑

---

## 手动执行步骤（每条用例）

1. 打开编辑器并进入目标对象脚本弹窗。  
2. 输入用例需求，点击“AI 生成”。  
3. 在 Diff 中检查函数签名和关键逻辑点。  
4. 点击“应用当前修改”，再点击“确定”，手动保存。  
5. 在场景中操作验证（点击、按键、指针移动、数据触发等）。  
6. 刷新页面后再次验证脚本可运行。  

---

## 接口自动检查建议（Agent）

可针对 `result.source` 做正则检查：

- 必须匹配：
  - `function\\s+loaded\\s*\\(`
- 禁止匹配：
  - `function\\s+afterAnimation\\s*\\(\\s*obj\\s*,\\s*time\\s*\\)`
  - `function\\s+onKeydown\\s*\\(`
  - `window\\.` / `globalThis\\.`
- 若含 `afterAnimation(delta,toBeRender)` 且存在连续更新逻辑，建议匹配 `toBeRender\\(\\s*true\\s*\\)`。

---

## 判定规则

- A/B/C/D/E/F 每组至少 1 条用例达到“稳定可用”（>= 2/3）即视为该组通过。  
- 若出现“函数签名错误 / 虚构 API / 代码不可运行”，即该条直接失败。  
- 全部组通过后，可认为当前 prompt 在多场景下进入可用状态。  
