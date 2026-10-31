import { ViewportGizmo, GizmoOptions } from "three-viewport-gizmo";
import CameraControls from "camera-controls";
import { useAddSignal, useRemoveSignal } from "@/hooks";
import App from "@/core/app/App";
import Viewer from "../Viewer";
import {getOsTheme} from "@/utils";

export class Helper {
    private _updateFn;
    private viewer: Viewer;
    private gizmo: ViewportGizmo | undefined;
    private controls: CameraControls;

    constructor(viewer: Viewer, controls: CameraControls) {
        this.viewer = viewer;
        this.controls = controls;
    }

    /**
     * 如果当前正在动画视图更改,则返回true
     */
    get animating() {
        if (this.gizmo) {
            return this.gizmo.animating;
        }

        return false;
    }

    set hidden(value: boolean) {
        if (this.gizmo) {
            const dom = document.querySelector(`#${this.gizmo.options.id}`) as HTMLElement;
            if (!dom) return;
            dom.style.display = value ? "block" : "none";

            this.update();
        }
    }

    init() {
        this._updateFn = this.update.bind(this);
        useAddSignal('cameraChanged', this._updateFn);
        useAddSignal('sceneResize', this._updateFn);

        if (!this.viewer.renderer) return;

        this.gizmo = new ViewportGizmo(this.viewer.camera, this.viewer.renderer, this.getGizmoConfig());
        this.controls.getTarget(this.gizmo.target);

        this.initEvent();
    }

    /**
     * 初始化视角控制器事件
     */
    initEvent() {
        if (!this.gizmo) return;

        this.gizmo.addEventListener("start", () => {
            this.controls.enabled = false;
            this.viewer.render();
        });
        this.gizmo.addEventListener("end", () => {
            this.controls.enabled = true;
            this.viewer.render();
        });
        this.gizmo.addEventListener("change", () => {
            this.controls.setPosition(...this.viewer.camera.position.toArray());
            this.viewer.render();
        });

        this.initDomEvent();
    }

    /**
     * 初始化视角控制器dom事件
     */
    initDomEvent() {
        if (!this.gizmo?.options?.id) return;

        const dom = document.querySelector(`#${this.gizmo.options.id}`);
        if (!dom) return;

        dom.addEventListener("pointermove", () => {
            this.viewer.render();
        })
    }

    /**
     * 获取ViewportGizmo配置
     * @param type
     */
    getGizmoConfig(type = "cube") {
        const _opt = {
            type,
            id: "astral-viewer-helper",
            container: this.viewer.container,
            placement: "bottom-right",
        } as GizmoOptions;

        if (type === "sphere") return _opt;

        const configTheme = App.config.getKey('theme');
        if (configTheme === "os") {
            if (getOsTheme() !== "dark") {
                return _opt;
            }
        } else if (configTheme === "light") {
            return _opt;
        }

        let colors = {
            color: 0x333333,
            labelColor: 0xdddddd,
            hover: {
                color: App.config.getKey('mainColor') || "#388dc2",
                labelColor: 0xffffff,
            },
        };
        let background = {
            color: 0x444444,
            hover: { color: 0x444444 },
        };

        return {
            ..._opt,
            background: background,
            corners: colors,
            edges: colors,
            right: colors,
            top: colors,
            front: colors,
        } as GizmoOptions;
    }

    /**
     * 设置外观，会在全局配置中的主色调及白天/黑夜模式切换时调用
     */
    setConfig() {
        if (!this.gizmo) return;

        this.gizmo.set(this.getGizmoConfig());

        this.initDomEvent();

        this.viewer.render();
    }

    update() {
        if (!this.gizmo) return;

        this.controls.getTarget(this.gizmo.target);
        this.gizmo.update(false);
    }

    render() {
        if (!this.gizmo) return;

        const target = this.viewer.renderer.getRenderTarget();
        if (!target) { this.gizmo.render(); return; }
        // The pinned gizmo changes renderer viewport only; WebGPU offscreen passes
        // use the render target's viewport/scissor instead (in physical pixels).
        const viewport = target.viewport.clone(), scissor = target.scissor.clone();
        const scissorTest = target.scissorTest;
        const rect = (this.gizmo as unknown as {_viewport: number[]})._viewport;
        target.viewport.fromArray(rect).multiplyScalar(this.viewer.renderer.getPixelRatio());
        target.scissor.copy(target.viewport);
        target.scissorTest = true;
        try { this.gizmo.render(); }
        finally { target.viewport.copy(viewport); target.scissor.copy(scissor); target.scissorTest = scissorTest; }
    }

    dispose() {
        if (this.gizmo) this.gizmo.dispose();

        if(this._updateFn){
            useRemoveSignal('cameraChanged', this._updateFn);
            useRemoveSignal('sceneResize', this._updateFn);
            this._updateFn = null;
        }
    }
}
