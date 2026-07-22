import { Command } from './Command';
import { ObjectLoader } from '../loader/ObjectLoader';
import App from "../app/App";
import { cloneScriptsByUuid, collectScriptsByObject, installObjectScripts, uninstallObjectScripts } from './ScriptCommandUtils';

/**
 * @param object THREE.Object3D
 * @constructor
 */
class RemoveObjectCommand extends Command {
	public object;
	public parent;
	public index;
	public scripts: ISceneJson['scripts'];

	constructor( object? ) {
		super();

		this.type = 'RemoveObjectCommand';
		this.name = 'Remove object';

		this.object = object;
		this.parent = ( object !== undefined ) ? object.parent : undefined;
		this.scripts = object !== undefined && typeof object.traverse === 'function' ? collectScriptsByObject(object) : {};
		if ( this.parent !== undefined ) {
			this.index = this.parent.children.indexOf( this.object );
		}
	}

	execute() {
		uninstallObjectScripts(this.object, this.scripts);
		App.removeObject( this.object );
		App.deselect();
	}

	undo() {
		App.addObject( this.object, this.parent, this.index, true );
		installObjectScripts(this.object, this.scripts);
		App.select( this.object );
	}

	toJSON() {
		const output = super.toJSON();
		output.object = this.object.toJSON();
		output.index = this.index;
		output.parentUuid = this.parent.uuid;
		output.scripts = this.scripts;

		return output;
	}

	fromJSON( json ) {
		super.fromJSON( json );

		this.parent = App.getObjectByUuid( json.parentUuid );
		if ( this.parent === undefined ) {
			this.parent = App.scene;
		}

		this.index = json.index;
		this.scripts = cloneScriptsByUuid(json.scripts || {});
		this.object = App.getObjectByUuid( json.object.object.uuid );

		if ( this.object === undefined ) {
			const loader = new ObjectLoader();
			this.object = loader.parse( json.object );
		}
	}
}

export { RemoveObjectCommand };
