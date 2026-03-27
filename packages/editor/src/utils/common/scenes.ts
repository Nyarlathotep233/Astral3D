import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/Addons';
import { App, Hooks, AddObjectCommand } from "@astral3d/engine";

export interface IModel extends THREE.Object3D {
	metadata: Object;
}

export function getMaterialName(material) {
	if (Array.isArray(material)) {
		const array: any = [];

		for (let i = 0; i < material.length; i++) {
			array.push(material[i].name);
		}

		return array.join(',');
	}

	return material.name;
}

export function getObjectType(object) {
	if (object.isScene) return 'Scene';
	if (object.isCamera) return 'Camera';
	if (object.isLight) return 'Light';
	if (object.isMesh) return 'Mesh';
	if (object.isLine) return 'Line';
	if (object.isPoints) return 'Points';

	return 'Object3D';
}

/**
 * 获取当前选中模型 path
 */
export function getSelectedModelPath() {
	let pathArr: string[] = [];

	function getPath(obj) {
		if (obj.parent) {
			pathArr.unshift(obj.parent.name);
			getPath(obj.parent);
		}
	}

	getPath(App.selected);

	return pathArr.join(' !! ');
}

// 屏幕坐标转世界坐标
export function screenToWorld(x: number, y: number) {
	const vector = new THREE.Vector3();
	vector.set(
		(x / window.viewer.container.offsetWidth) * 2 - 1,
		-(y / window.viewer.container.offsetHeight) * 2 + 1,
		0.5
	);
	vector.unproject(App.camera);

	const dir = vector.sub(App.camera.position).normalize();
	const distance = -App.camera.position.z / dir.z;
	return App.camera.position.clone().add(dir.multiplyScalar(distance));
}

export function reBufferGeometryUv(geometry: THREE.BufferGeometry) {
	const uv = geometry.attributes.uv;
	if (!uv) return;

	// 获取u和v的范围
	const box = {
		min: new THREE.Vector2(Infinity, Infinity),
		max: new THREE.Vector2(-Infinity, -Infinity),
	};
	for (let i = 0; i < uv.count; i++) {
		const u = uv.getX(i);
		const v = uv.getY(i);

		box.min.x = Math.min(box.min.x, u);
		box.min.y = Math.min(box.min.y, v);
		box.max.x = Math.max(box.max.x, u);
		box.max.y = Math.max(box.max.y, v);
	}

	// 计算偏移量和范围
	const offset = new THREE.Vector2(0 - box.min.x, 0 - box.min.y);
	const range = new THREE.Vector2(box.max.x - box.min.x, box.max.y - box.min.y);

	// 遍历顶点，修改uv
	for (let i = 0; i < uv.count; i++) {
		const u = uv.getX(i);
		const v = uv.getY(i);

		// 计算新的u和v
		const newU = (u + offset.x) / range.x;
		const newV = (v + offset.y) / range.y;

		// 写入新的uv
		uv.setXY(i, newU, newV);
	}

	// 通知three.js更新
	uv.needsUpdate = true;
}

export function setUserData(object: IModel, key: string, value: any) {
	// key按照.分割，设置到object的userData中
	const keys = key.split('.');
	let obj = object.userData;
	for (let i = 0; i < keys.length - 1; i++) {
		const k = keys[i];
		if (!obj[k]) {
			obj[k] = {};
		}
		obj = obj[k];
	}
	obj[keys[keys.length - 1]] = value;
}

export function setMetaData(object: IModel, key: string, value: any) {
	// key按照.分割，设置到object的metaData中
	const keys = key.split('.');
	let metadata = object.metadata;

	if (!metadata) {
		metadata = {};
		object.metadata = metadata;
	}

	for (let i = 0; i < keys.length - 1; i++) {
		const k = keys[i];
		if (!metadata[k]) {
			metadata[k] = {};
		}
		metadata = metadata[k];
	}
	metadata[keys[keys.length - 1]] = value;
}

/**
 * 创建基础场景（会用于轻量展示）
 */
export function createBasicScene(container: HTMLElement) {
	let scene = new THREE.Scene();

	let camera = new THREE.PerspectiveCamera(60, container.offsetWidth / container.offsetHeight, 0.1, 1000);
	camera.position.set(0, 2, 8);
	camera.lookAt(0, 0, 0);

	let renderer = new THREE.WebGLRenderer({
		antialias: true,
		powerPreference: "high-performance"
	});

	renderer.setSize(container.offsetWidth, container.offsetHeight);
	renderer.setClearColor(0x0c1126);
	renderer.setPixelRatio(window.devicePixelRatio);
	container.appendChild(renderer.domElement);

	// 添加光源
	const ambientLight = new THREE.AmbientLight(0x404040, 2);
	scene.add(ambientLight);

	const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
	directionalLight.position.set(5, 5, 5);
	scene.add(directionalLight);

	const backLight = new THREE.DirectionalLight(0xffffff, 0.5);
	backLight.position.set(-5, -5, -5);
	scene.add(backLight);

	// 初始化轨道控制器
	let controls = new OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.dampingFactor = 0.05;
	controls.screenSpacePanning = true;

	// @ts-ignore监听视窗变化（节流）
	let timer: NodeJS.Timeout | null = null;
	let resizeObserver = new ResizeObserver(() => {
		if (timer) return;
		timer = setTimeout(function () {
			camera.aspect = container.offsetWidth / container.offsetHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(container.offsetWidth, container.offsetHeight);
					
			timer = null;
		}, 16)
	});
	resizeObserver.observe(container);

	const animate = () => {
		controls.update();
		renderer.render(scene, camera);
	}

	renderer.setAnimationLoop(animate);

	const dispose = () => {
		resizeObserver.unobserve(container);
		resizeObserver.disconnect();
		// @ts-ignore
		resizeObserver = null;
		
		renderer.setAnimationLoop(null);
		renderer.dispose();
		// @ts-ignore
		renderer = null;

		controls.dispose();
		// @ts-ignore
		controls = null;

		camera.clear();
		// @ts-ignore
		camera = null;

		scene.clear();
		// @ts-ignore
		scene = null;
	}

	return {
		scene,
		camera,
		renderer,
		controls,
		dispose
	}
}

function deepCloneScript(script: ISceneScript): ISceneScript {
	return JSON.parse(JSON.stringify(script));
}

function getUniqueNameInParent(parent: THREE.Object3D, sourceName: string) {
	const fallbackName = "Object3D";
	const rawName = (sourceName || fallbackName).trim() || fallbackName;
	const siblingNames = new Set(parent.children.map((child) => child.name));

	if (!siblingNames.has(rawName)) return rawName;

	const match = rawName.match(/^(.*?)(?: \((\d+)\))?$/);
	const nameBase = (match && match[1] ? match[1] : rawName).trim() || fallbackName;
	let index = match && match[2] ? Number(match[2]) + 1 : 1;

	let candidate = `${nameBase} (${index})`;
	while (siblingNames.has(candidate)) {
		index += 1;
		candidate = `${nameBase} (${index})`;
	}

	return candidate;
}

/**
 * 复制场景对象（包含子层级）并同步复制脚本。
 * 注意：复制后的对象会作为新对象添加到场景中。
 */
export function duplicateObjectWithScripts(sourceObject: THREE.Object3D | null) {
	if (!sourceObject || sourceObject.parent === null) return null;

	const duplicatedObject = sourceObject.clone();
	duplicatedObject.name = getUniqueNameInParent(App.scene, sourceObject.name || duplicatedObject.name);

	const sourceNodes: THREE.Object3D[] = [];
	const duplicatedNodes: THREE.Object3D[] = [];

	sourceObject.traverse((node) => sourceNodes.push(node));
	duplicatedObject.traverse((node) => duplicatedNodes.push(node));

	const pairCount = Math.min(sourceNodes.length, duplicatedNodes.length);

	for (let i = 0; i < pairCount; i++) {
		const sourceNode = sourceNodes[i];
		const duplicatedNode = duplicatedNodes[i];
		const sourceScripts = App.scripts[sourceNode.uuid];

		if (!sourceScripts || sourceScripts.length === 0) continue;

		const copiedScripts = sourceScripts.map((script) => deepCloneScript(script));
		App.scripts[duplicatedNode.uuid] = copiedScripts;

		copiedScripts.forEach((script) => {
			Hooks.useDispatchSignal("scriptAdded", duplicatedNode, script);
		});
	}

	App.execute(new AddObjectCommand(duplicatedObject));
	return duplicatedObject;
}
