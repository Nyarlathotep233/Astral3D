import {ClippingGroup, Object3D, Plane} from 'three/webgpu';

const groups = new WeakMap<Object3D, ClippingGroup>();
const clipping = new WeakMap<Object3D, Plane[]>();
export function setSceneClipping(target: Object3D, planes: Plane[] | null) {
    if (planes) clipping.set(target, planes);
    else clipping.delete(target);
}

/** Render-only ClippingGroups. Original parents, transforms, UUIDs and saved tree stay intact. */
export function renderWithClipping(scene: Object3D, render: () => void) {
    const restore: (() => void)[] = [];
    function visit(parent: Object3D, inherited?: Plane[]) {
        const planes = clipping.get(parent) || inherited;
        const original = parent.children;
        const children = original.map(child => {
            const childPlanes = clipping.get(child) || planes;
            if (childPlanes && !child.ignore) {
                let group = groups.get(child);
                if (!group) { group = new ClippingGroup(); groups.set(child, group); }
                group.clippingPlanes = childPlanes;
                group.clipIntersection = false;
                group.clipShadows = true;
                group.children = [child];
                group.parent = parent;
                group.matrixWorld.copy(parent.matrixWorld);
                // No add()/attach(): do not emit events or modify the logical parent.
                group.toJSON = meta => child.toJSON(meta);
                return group;
            }
            visit(child);
            return child;
        });
        if (children.some((child, i) => child !== original[i])) {
            parent.children = children;
            restore.push(() => { parent.children = original; });
        }
    }
    visit(scene);
    try { render(); } finally { for (const undo of restore.reverse()) undo(); }
}
