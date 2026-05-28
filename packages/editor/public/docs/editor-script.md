# Astral3D/H3D 编辑器脚本文档

> 主要面相于开发人员，主要功能有：
>
>1. 编写脚本逻辑，并将其挂载于实体模型上；
>2. 脚本组件使用`JavaScript`编程语言；
>3. 脚本组件由事件驱动，在对应生命周期内执行；
>4. 脚本组件可以访问实体模型的属性和方法；
>5. 运行时执行脚本逻辑，并获取脚本执行结果；

### 内置变量
在脚本中已经内置了以下变量：

| 变量       | 描述         | 类型                                                           |
|----------|------------|--------------------------------------------------------------|
| this     | 当前实体模型的引用  | `THREE.Object3D`                                             |
| THREE    | THREE对象    | `THREE`                                                      |
| helper   | 辅助类函数集合    | [Helper](#helper)                                            |
| renderer | 当前渲染器的引用   | `THREE.WebGLRenderer`                                        |
| scene    | 当前场景的引用    | `THREE.Scene`                                                |
| camera   | 当前场景相机的引用  | `THREE.PerspectiveCamera`                                    |
| controls | 当前场景控制器的引用 | [CameraControls](https://github.com/yomotsu/camera-controls) |
| timer    | 场景运行时间跟踪   | `three/examples/jsm/misc/Timer.js`                           |
| scriptParams | 脚本参数对象（由脚本注释声明生成） | `Record<string, unknown>` |

### 脚本参数

脚本参数直接写在脚本源码注释中，方便复制、编辑和版本管理。运行时会读取第一个 `script-params` 注释块，并把 JSON 对象注入为 `scriptParams`。

```javascript
/* script-params
{
    "speed": 90,
    "enabled": true,
    "options": {
        "mode": "auto"
    }
}
*/

function loaded() {
    console.log(scriptParams.speed);
    console.log(scriptParams["enabled"]);
}
```

需要显示名、明确类型或数字范围时，也可以用对象形式：

```javascript
/* script-params
{
    "speed": {
        "type": "number",
        "default": 90,
        "label": "速度",
        "min": 0,
        "max": 360,
        "step": 5
    }
}
*/
```

参数声明规则：

- 支持简写值，系统会自动推断类型并把该值作为默认值：`string`、`number`、`boolean`，其他 JSON 值会作为 `json` 类型。
- 支持详细对象形式，详细对象必须同时包含 `type` 与 `default`；`type` 只能是 `string`、`number`、`boolean`、`json`。
- `default` 必须与 `type` 匹配；`number` 类型的 `min`、`max` 必须是有效数字，`step` 必须是大于 `0` 的数字。

> Tips:
>
> - `scriptParams` 每个脚本独立注入。
> - 非合法 JS 标识符的 key 可通过 `scriptParams["some-key"]` 读取。
> - 修改源码中的参数声明并保存脚本，会重新安装脚本并触发 `loaded()`。
> - 只在右侧脚本卡片下方修改参数运行时取值时，不会重新安装脚本；系统会原地更新当前脚本的 `scriptParams` 对象并渲染一帧。
> - 不再使用单独的参数声明字段，也没有单独的参数声明编辑面板；右侧脚本卡片下方仍可编辑每个参数的运行时取值，取值保存到脚本 `params` 中。

### 内置方法
在脚本中已经内置了以下方法：

| 方法     | 描述        | 传入参数              |
|--------|-----------|-------------------|
| render | 驱动场景渲染一帧。 | `delta?: number` |

### 内置生命周期
支持以下几个基本生命周期：

| 生命周期            | 描述                            | 参数                                                             |
|-----------------|-------------------------------|----------------------------------------------------------------|
| loaded          | 场景加载或脚本安装完成时执行，每次安装执行一次 | -                                                              |
| beforeAnimation | 场景当前动画帧循环开始之前触发，每一帧执行一次       | `delta: number`                                                |
| afterAnimation  | 场景当前动画帧循环完成之后立即触发，每一帧执行一次     | `delta: number, toBeRender: (_needRender: boolean) => void`    |
| beforeRender    | 场景当前动画帧循环完成之后渲染之前触发，每一次渲染执行一次 | `delta: number`                                                |
| afterRender     | 场景当前帧渲染完成之后触发，每一次渲染执行一次       | `delta: number`                                                |
| beforeDestroy   | 场景销毁前调用，仅执行一次                 | -                                                              |
| afterDestroy    | 场景销毁后调用，仅执行一次                 | -                                                              |

> Tips:
>> `toBeRender`:由于本系统默认为事件驱动渲染，而非持续渲染，故提供此方法以便在脚本中实现自定义的逻辑。推荐用法：
>> ```javascript
>> afterAnimation(delta,toBeRender){
>>    // 传入 true 则本轮动画循环会渲染
>>    toBeRender(true);
>> }
>> ```

### 内置事件
支持以下几个基本事件：

| 事件            | 描述         | 参数                             |
|---------------|------------|--------------------------------|
| onPick        | 模型单击事件     | `intersect:THREE.Intersection` |
| onDoubleClick | 模型双击事件     | `intersect:THREE.Intersection` |
| onKeyDown     | 键盘按下事件(全局) | `event:KeyboardEvent`          |
| onKeyUp       | 键盘抬起事件(全局) | `event:KeyboardEvent`          |
| onPointerDown | 指针按下事件(全局) | `event:PointerEvent`           |
| onPointerUp   | 指针抬起事件(全局) | `event:PointerEvent`           |
| onPointerMove | 指针移动事件(全局) | `event:PointerEvent`           |
| onTouchStart  | 触屏按下事件(全局) | `event:TouchEvent`             |
| onTouchEnd    | 触屏释放事件(全局) | `event:TouchEvent`             |

<br/>

***

### 辅助类(<a id="helper">Helper</a>)
| 成员        | 描述                   | 类型                             |
|-----------|----------------------|--------------------------------|
| scene     | 当前场景的引用，内置变量scene的引用 | `THREE.Scene`                  |
| Animation | 未实例化的动画类             | [Animation](#helper-animation) |

| 方法           | 描述                     | 参数                                                               | 返回值              |
|--------------|------------------------|------------------------------------------------------------------|------------------|
| objectByUuid | 通过uuid获取场景中的Object3D对象 | `uuid:string`                                                    | `THREE.Object3D` |
| moveObject   | 移动3D对象到指定位置            | `object: Object3D`<br/>`parent: Object3D`<br/>`before: Object3D` | -                |
| removeObject | 从场景中移除3D对象             | `object: THREE.Object3D`                                         | -                |

### 动画类(<a id="helper-animation">Animation</a>)
#### 基础用法
```javascript
    const animation = new helper.Animation(this);
```

#### API
```typescript
    new helper.Animation(object:THREE.Object3D)
```

| 成员                  | 描述                                                                                                                                                              | 类型                                    |
|---------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------|
| object              | 构造函数形参值，动画绑定的对象。<br/> 如果实例化时传入参数this(如上)，则指向内置变量this                                                                                                            | `THREE.Object3D`                      |
| actions             | 动画动作集合                                                                                                                                                          | `THREE.AnimationAction[]`             |
| actionsMap          | 动画动作映射表，key为动作名称，value为THREE.AnimationAction对象                                                                                                                  | `Map<string,  THREE.AnimationAction>` |
| lastPlayAction    | 正在播放的动作名称                                                                                                                                                       | `THREE.AnimationAction \| undefined`  |
| repetitions         | 动画重复次数                                                                                                                                                          | `number`                              |
| ActionLoop (static) | 动画循环模式枚举：<br/> LoopOnce - 只执行一次 <br/> LoopRepeat - 重复次数为repetitions的值, 且每次循环结束时候将回到起始动作开始下一次循环。 <br/> LoopPingPong - 重复次数为repetitions的值, 且像乒乓球一样在起始点与结束点之间来回循环。 | `Enum`                                |

| 方法        | 描述                                                                                                                   | 参数                                                                                                                         | 返回值                                  |
|-----------|----------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------|--------------------------------------|
| getAction | 获取指定名称的动画动作,用于用户直接调用[THREE.AnimationAction的方法](https://threejs.org/docs/index.html#api/zh/animation/AnimationAction) | `name:string`                                                                                                              | `THREE.AnimationAction \| undefined` |
| play      | 播放指定名称的动画动作,支持链式调用                                                                                                   | `name:string` <br/> `loop:AnimationActionLoopStyles = helper.Animation.ActionLoop.LoopRepeat` <br/> `timeScale:number = 1` | `this(helper.Animation)`             |
| pause     | 暂停动画,支持链式调用                                                                                                          | `name:string \| undefined`                                                                                                 | `this(helper.Animation)`             |
| stop      | 停止动画,支持链式调用                                                                                                          | `name:string \| undefined`                                                                                                 | `this(helper.Animation)`             |

### 基础用法
完整结构：

```javascript
/**
 * 场景加载或脚本安装完成时执行，每次安装执行一次
 */
function loaded() {
    console.group('loaded');
    console.log(this);
    console.log(renderer);
    console.log(scene);
    console.log(camera);
    console.log(controls);
    console.log(timer);
    console.groupEnd()
}

/**
 * 场景当前动画帧循环开始之前触发，每一帧执行一次
 * @param {number} delta
 */
function beforeAnimation(delta) {}

/**
 * 场景当前动画帧循环完成之后立即触发，每一帧执行一次
 * @param {number} delta
 * @param {(_needRender: boolean) => void} toBeRender 设置本轮动画循环是否渲染
 */
function afterAnimation(delta,toBeRender) {}

/**
 * 场景当前动画帧循环完成之后渲染之前触发，每一次渲染执行一次
 * @param {number} delta
 */
function beforeRender(delta) {}

/**
 * 场景当前帧渲染完成之后触发，每一次渲染执行一次
 * @param {number} delta
 */
function afterRender(delta) {}

/**
 * 场景销毁前调用，仅执行一次
 */
function beforeDestroy() {}

/**
 * 场景销毁后调用，仅执行一次
 */
function afterDestroy() {}

/**
 * 模型单击事件
 * @param {THREE.Intersection} intersect
 */
function onPick(intersect) {}

/**
 * 模型双击事件
 * @param {THREE.Intersection} intersect
 */
function onDoubleClick(intersect) {}

/**
 * 键盘按下事件(全局)
 * @param {KeyboardEvent} event
 */
function onKeyDown(event) {}

/**
 * 键盘抬起事件(全局)
 * @param {KeyboardEvent} event
 */
function onKeyUp(event) {}

/**
 * 指针按下事件(全局)
 * @param {PointerEvent} event
 */
function onPointerDown(event) {}

/**
 * 指针抬起事件(全局)
 * @param {PointerEvent} event
 */
function onPointerUp(event) {}

/**
 * 指针移动事件(全局)
 * @param {PointerEvent} event
 */
function onPointerMove(event) {}

/**
 * 触屏按下事件(全局)
 * @param {TouchEvent} event
 */
function onTouchStart(event) {}

/**
 * 触屏释放事件(全局)
 * @param {TouchEvent} event
 */
function onTouchEnd(event) {}
```

*** 

### 示例代码
#### 1. 动态天空盒/模型动画/键盘事件
::: tabs#animate

@tab Scene#scene

```javascript
function afterAnimation(delta,toBeRender){
    toBeRender(true)
}

const DEG2RAD = Math.PI / 180;
function beforeRender(delta) {
    const t = delta * DEG2RAD;
    scene.backgroundRotation.y = t;
}
```

@tab:active Wolf#wolf

```javascript
const anime = new helper.Animation(this);

function loaded() {
    anime.play("01_Run_Armature_0");
}

function onKeyDown(event) {
    // 按下1则执行 "01_Run_Armature_0" 动画,按下2则执行 "02_walk_Armature_0" 动画，按下3则执行 ""05_site_Armature_0"" 动画,
    switch (event.key) {
        case "1":
            anime.stop();
            anime.play("02_walk_Armature_0");
            break;

        case "2":
            anime.stop();
            anime.play("05_site_Armature_0");
            break;

        case "3":
            anime.stop();
            anime.play("01_Run_Armature_0");
            break;
    }
}

function beforeDestroy() {
    anime.stop();
}
```

:::

<iframe height=500 width=100% src="https://editor.astraljs.com/#/preview/a18eb710-c1f8-4cff-b8ab-c3a2056ccf57" frameborder=0 allowfullscreen></iframe>
