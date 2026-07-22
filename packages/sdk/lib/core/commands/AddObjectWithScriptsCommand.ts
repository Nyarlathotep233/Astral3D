import { Command } from './Command';
import { ObjectLoader } from '../loader/ObjectLoader';
import App from "../app/App";
import { cloneScriptsByUuid, installObjectScripts, uninstallObjectScripts } from './ScriptCommandUtils';

/**
 * Add an Object3D and install scripts bound to objects in its subtree.
 */
class AddObjectWithScriptsCommand extends Command {
    public object;
    public scripts: ISceneJson['scripts'];

    constructor(object?, scripts: ISceneJson['scripts'] = {}) {
        super();

        this.type = 'AddObjectWithScriptsCommand';
        this.object = object;
        this.scripts = cloneScriptsByUuid(scripts);
        if (object !== undefined) {
            this.name = `Add object with scripts`;
        }
    }

    execute() {
        App.addObject(this.object, undefined, undefined, true);
        installObjectScripts(this.object, this.scripts);
        App.select(this.object);
    }

    undo() {
        uninstallObjectScripts(this.object, this.scripts);
        App.removeObject(this.object);
        App.deselect();
    }

    toJSON() {
        const output = super.toJSON();
        output.object = this.object.toJSON();
        output.scripts = this.scripts;
        return output;
    }

    fromJSON(json) {
        super.fromJSON(json);
        this.scripts = cloneScriptsByUuid(json.scripts || {});
        this.object = App.getObjectByUuid(json.object.object.uuid);

        if (this.object === undefined) {
            const loader = new ObjectLoader();
            this.object = loader.parse(json.object);
        }
    }
}

export { AddObjectWithScriptsCommand };
