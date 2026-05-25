import { Object3D } from 'three';
import { Command } from './Command';
import { useDispatchSignal } from "@/hooks";
import App from "../app/App";

/**
 * @param object THREE.Object3D
 * @param script javascript object
 * @param attributeName string
 * @param newValue string, object
 * @constructor
 */
class SetScriptValueCommand extends Command {
	private object: Object3D;
	private script: IScript.IStruct;
	private attributeName: string;
	private oldValue: any;
	private newValue: any;

	constructor(object:Object3D, script:IScript.IStruct, attributeName:string, newValue:any) {
		super();

		this.type = 'SetScriptValueCommand';
		this.name = `Set script.${attributeName}`;
		this.updatable = attributeName !== 'name';

		this.object = object;
		this.script = script;

		this.attributeName = attributeName;
		this.oldValue = this.captureValue(script, attributeName);
		this.newValue = attributeName === 'params' ? this.cloneParams(newValue) : newValue;
	}

	private cloneParams(params?: Record<string, unknown>) {
		if (!params) return {};

		try {
			return JSON.parse(JSON.stringify(params));
		} catch {
			return { ...params };
		}
	}

	private captureValue(script: IScript.IStruct, attributeName: string) {
		if (attributeName === 'params') {
			return this.cloneParams(script.params);
		}

		return script !== undefined ? script[attributeName] : undefined;
	}

	private applyParamsValue(params: Record<string, unknown>) {
		if (!this.script.params) {
			this.script.params = {};
		}

		for (const key of Object.keys(this.script.params)) {
			delete this.script.params[key];
		}

		Object.assign(this.script.params, params);
	}

	execute() {
		const previousValue = this.captureValue(this.script, this.attributeName);

		if (this.attributeName === 'params') {
			this.applyParamsValue(this.newValue);
		} else {
			this.script[this.attributeName] = this.newValue;
		}

		useDispatchSignal("scriptChanged",this.attributeName,this.object,this.script,previousValue);
	}

	undo() {
		const previousValue = this.captureValue(this.script, this.attributeName);

		if (this.attributeName === 'params') {
			this.applyParamsValue(this.oldValue);
		} else {
			this.script[this.attributeName] = this.oldValue;
		}

		useDispatchSignal("scriptChanged",this.attributeName,this.object,this.script,previousValue);
	}

	update(cmd) {
		this.newValue = this.attributeName === 'params' ? this.cloneParams(cmd.newValue) : cmd.newValue;
	}

	toJSON() {
		const output = super.toJSON();

		output.objectUuid = this.object.uuid;
		output.index = App.scripts[this.object.uuid].indexOf(this.script);
		output.attributeName = this.attributeName;
		output.oldValue = this.oldValue;
		output.newValue = this.newValue;

		return output;
	}

	fromJSON(json) {
		super.fromJSON(json);

		this.oldValue = json.oldValue;
		this.newValue = json.newValue;
		this.attributeName = json.attributeName;
		this.object = App.getObjectByUuid(json.objectUuid) as Object3D;
		this.script = App.scripts[json.objectUuid][json.index];
	}
}

export { SetScriptValueCommand };
