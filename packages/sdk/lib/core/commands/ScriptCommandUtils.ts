import type { Object3D } from 'three';
import { useDispatchSignal } from "@/hooks";
import App from "../app/App";

function cloneScript(script: ISceneScript): ISceneScript {
    return JSON.parse(JSON.stringify(script));
}

function cloneScripts(scripts: ISceneScript[] = []): ISceneScript[] {
    return scripts.map((script) => cloneScript(script));
}

function findObjectByUuid(root: Object3D, uuid: string): Object3D | undefined {
    if (root.uuid === uuid) return root;
    return root.getObjectByProperty('uuid', uuid);
}

export function cloneScriptsByUuid(scripts: ISceneJson['scripts'] = {}): ISceneJson['scripts'] {
    const clonedScripts: ISceneJson['scripts'] = {};

    Object.entries(scripts).forEach(([uuid, scriptList]) => {
        if (!scriptList || scriptList.length === 0) return;
        clonedScripts[uuid] = cloneScripts(scriptList);
    });

    return clonedScripts;
}

export function collectScriptsByObject(object: Object3D): ISceneJson['scripts'] {
    const scripts: ISceneJson['scripts'] = {};

    object.traverse((child) => {
        const sourceScripts = App.scripts[child.uuid];
        if (!sourceScripts || sourceScripts.length === 0) return;
        scripts[child.uuid] = cloneScripts(sourceScripts);
    });

    return scripts;
}

export function installObjectScripts(root: Object3D, scripts: ISceneJson['scripts'] = {}) {
    Object.entries(scripts).forEach(([uuid, scriptList]) => {
        if (!scriptList || scriptList.length === 0) return;

        const object = findObjectByUuid(root, uuid) || App.scene.getObjectByProperty('uuid', uuid);
        if (!object) return;

        const clonedScripts = cloneScripts(scriptList);
        App.scripts[uuid] = clonedScripts;

        clonedScripts.forEach((script) => {
            useDispatchSignal("scriptAdded", object, script);
        });
    });
}

export function uninstallObjectScripts(root: Object3D, scripts: ISceneJson['scripts'] = {}) {
    Object.entries(scripts).forEach(([uuid, scriptList]) => {
        if (!scriptList || scriptList.length === 0) return;

        const object = findObjectByUuid(root, uuid) || App.scene.getObjectByProperty('uuid', uuid);

        if (object) {
            scriptList.forEach((script) => {
                useDispatchSignal("scriptRemoved", object, script);
            });
        }

        delete App.scripts[uuid];
    });
}
