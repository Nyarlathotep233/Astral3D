import assert from "node:assert/strict";
import * as THREE from "../packages/sdk/node_modules/three/build/three.module.js";
import {
  Geodetic,
} from "../packages/sdk/node_modules/@takram/three-geospatial/build/index.js";

process.on("unhandledRejection", (error) => {
  if (!String(error).includes("No available storage method found")) throw error;
});

const {
  DEFAULT_GIS_CONFIG,
  SetGeoPositionCommand,
  applyGeoAnchorTransform,
  getGeoPosition,
} = await import("../packages/sdk/dist/astral3d.es.js");

assert.ok(Number.isFinite(Date.parse(DEFAULT_GIS_CONFIG.atmosphereDateTime)));

const source = {
  longitude: 104.12345678,
  latitude: 35.12345678,
  height: 1234.5,
};
const ecef = new Geodetic(
  THREE.MathUtils.degToRad(source.longitude),
  THREE.MathUtils.degToRad(source.latitude),
  source.height,
).toECEF();
const roundTrip = new Geodetic().setFromECEF(ecef);
assert.ok(Math.abs(THREE.MathUtils.radToDeg(roundTrip.longitude) - source.longitude) < 1e-8);
assert.ok(Math.abs(THREE.MathUtils.radToDeg(roundTrip.latitude) - source.latitude) < 1e-8);
assert.ok(Math.abs(roundTrip.height - source.height) < 1e-5);

const anchor = new THREE.Group();
const child = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
child.position.set(1, 2, 3);
child.rotation.set(0.1, 0.2, 0.3);
child.scale.set(2, 3, 4);
anchor.add(child);
const childPosition = child.position.clone();
const childQuaternion = child.quaternion.clone();
const childScale = child.scale.clone();
applyGeoAnchorTransform(anchor, { longitude: 0, latitude: 0, height: 0 });
assert.ok(new THREE.Vector3(1, 0, 0).transformDirection(anchor.matrix).distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-10);
assert.ok(new THREE.Vector3(0, 1, 0).transformDirection(anchor.matrix).distanceTo(new THREE.Vector3(1, 0, 0)) < 1e-10);
assert.ok(new THREE.Vector3(0, 0, 1).transformDirection(anchor.matrix).distanceTo(new THREE.Vector3(0, 0, -1)) < 1e-10);

const next = { longitude: 120, latitude: 30, height: 80 };
const command = new SetGeoPositionCommand(anchor, next);
command.execute();
assert.deepEqual(getGeoPosition(anchor), next);
assert.ok(child.position.equals(childPosition));
assert.ok(child.quaternion.equals(childQuaternion));
assert.ok(child.scale.equals(childScale));
command.undo();
assert.deepEqual(getGeoPosition(anchor), { longitude: 0, latitude: 0, height: 0 });
command.execute();

const restored = new THREE.ObjectLoader().parse(anchor.toJSON());
applyGeoAnchorTransform(restored, getGeoPosition(restored));
assert.deepEqual(getGeoPosition(restored), next);
assert.ok(restored.position.distanceTo(anchor.position) < 1e-8);

console.log("GIS coordinate, ENU anchor, serialization and command checks passed.");
