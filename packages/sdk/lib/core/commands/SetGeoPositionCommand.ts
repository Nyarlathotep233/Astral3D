import { Command } from "./Command";
import App from "../app/App";
import {
    applyGeoAnchorTransform,
    getGeoPosition,
    type GeoPosition,
} from "../viewer/modules/GisLayer";
import { useDispatchSignal } from "@/hooks";

class SetGeoPositionCommand extends Command {
    public object;
    public oldValue: GeoPosition;
    public newValue: GeoPosition;

    constructor(object?, newValue?: GeoPosition) {
        super();

        this.type = "SetGeoPositionCommand";
        this.name = "Set geographic position";
        this.updatable = true;
        this.object = object;
        this.oldValue = object ? getGeoPosition(object)! : { longitude: 0, latitude: 0, height: 0 };
        this.newValue = newValue ? { ...newValue } : { longitude: 0, latitude: 0, height: 0 };
    }

    execute() {
        applyGeoAnchorTransform(this.object, this.newValue);
        useDispatchSignal("objectChanged", this.object);
        useDispatchSignal("sceneGraphChanged");
    }

    undo() {
        applyGeoAnchorTransform(this.object, this.oldValue);
        useDispatchSignal("objectChanged", this.object);
        useDispatchSignal("sceneGraphChanged");
    }

    update(command) {
        this.newValue = { ...command.newValue };
    }

    toJSON() {
        const output = super.toJSON();
        output.objectUuid = this.object.uuid;
        output.oldValue = this.oldValue;
        output.newValue = this.newValue;
        return output;
    }

    fromJSON(json) {
        super.fromJSON(json);
        this.object = App.getObjectByUuid(json.objectUuid);
        this.oldValue = json.oldValue;
        this.newValue = json.newValue;
    }
}

export { SetGeoPositionCommand };
