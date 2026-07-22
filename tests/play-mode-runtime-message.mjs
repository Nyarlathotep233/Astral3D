import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";
import vm from "node:vm";
import {isRuntimeEventMessage} from "../packages/editor/src/utils/playMode.ts";

const require = createRequire(new URL("../packages/editor/package.json", import.meta.url));
const JSZip = require("jszip");

assert.equal(isRuntimeEventMessage({
  type: "h3d:runtime:event",
  channel: "tower-crane",
  event: "update",
  payload: {id: "tower-1"},
}), true);
assert.equal(isRuntimeEventMessage({type: "h3d:play:started", channel: "tower-crane", event: "update"}), false);
assert.equal(isRuntimeEventMessage({type: "h3d:runtime:event", channel: " ", event: "update"}), false);

const prefabBuffer = await readFile(new URL(
  "../packages/editor/public/static/prefabs/tower-crane.h3dprefab.zip",
  import.meta.url,
));
const prefabZip = await JSZip.loadAsync(prefabBuffer);
const prefab = JSON.parse(await prefabZip.file("prefab.json").async("string"));
const towerScript = Object.values(prefab.scripts).flat()[0].source;

assert.equal(towerScript.includes("H3D_TOWER_CRANE_"), false);

const outbound = [];
const listeners = new Set();
const parent = {
  postMessage(data, targetOrigin) {
    outbound.push({data, targetOrigin});
  },
};
const windowObject = {
  parent,
  addEventListener(type, listener) {
    if (type === "message") listeners.add(listener);
  },
  removeEventListener(type, listener) {
    if (type === "message") listeners.delete(listener);
  },
};
const context = vm.createContext({
  console: {log() {}, warn() {}, error() {}},
  render() {},
  scriptParams: {id: "tower-1"},
  window: windowObject,
});
vm.runInContext(towerScript, context);

const ring = {
  name: "Ring",
  children: [],
  material: {color: {value: 0x00f7ff, getHex() { return this.value; }, set(value) { this.value = value; }}, opacity: 0.1},
};
const root = {name: "TowerRoot", children: [ring], updateMatrixWorld() {}};
context.loaded.call(root);
assert.deepEqual(outbound.map(({data}) => data.event), ["register", "ready"]);
assert.equal(listeners.size, 1);

outbound.length = 0;
const send = (data) => [...listeners][0]({origin: "https://localhost:8090", data});
send({type: "H3D_TOWER_CRANE_PING"});
send({type: "h3d:runtime:event", channel: "tower-crane", event: "ping", payload: {}});
assert.deepEqual(outbound.map(({data}) => data.event), ["register", "ready"]);
assert(outbound.every(({data}) => data.type === "h3d:runtime:event"));
assert(outbound.every(({data}) => data.channel === "tower-crane"));
assert(outbound.every(({data}) => data.payload.id === "tower-1"));

outbound.length = 0;
send({
  type: "h3d:runtime:event",
  channel: "tower-crane",
  event: "update",
  payload: {id: "tower-1", rotationDeg: 45, isAlarm: true},
});
assert.equal(outbound.length, 1);
assert.equal(outbound[0].data.event, "ack");
assert.equal(outbound[0].data.payload.ok, true);
assert.equal(ring.material.color.value, 0xff0000);
assert.equal(ring.material.opacity, 0.1);

send({
  type: "h3d:runtime:event",
  channel: "tower-crane",
  event: "update",
  payload: {id: "tower-1", isAlarm: false},
});
assert.equal(ring.material.color.value, 0x00f7ff);
assert.equal(ring.material.opacity, 0.1);

outbound.length = 0;
send({type: "h3d:runtime:event", channel: "tower-crane", event: "update", id: "tower-1", payload: {}});
assert.equal(outbound.length, 0);

context.unloaded();
assert.equal(listeners.size, 0);
assert.equal(outbound.at(-1).data.event, "unregister");
context.loaded.call(root);
assert.equal(listeners.size, 1);
