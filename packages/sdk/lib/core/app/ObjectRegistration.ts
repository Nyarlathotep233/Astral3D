import type { Object3D } from 'three';
import { BatchRecoveryError } from '../commands/AtomicBatchCommand';

/** A failed resource traversal was restored before any object membership signal. */
export class ObjectRegistrationError extends Error {
    readonly registrationRestored = true;
    readonly cause: unknown;
    constructor(cause: unknown) {
        super(cause instanceof Error ? cause.message : String(cause));
        this.cause = cause;
        this.name = 'ObjectRegistrationError';
    }
}

/** Snapshot only this subtree's registry keys, not the whole scene per batch operation. */
export function runObjectRegistration(app: any, counts: Map<object, number>, root: Object3D, mutate: () => void, refresh: () => void) {
    const restore: Array<() => void> = [];
    const materials = new Set<any>();
    const geometries = new Set<any>();
    const entry = (record: any, key: string | number) => {
        const present = Object.prototype.hasOwnProperty.call(record, key), value = record[key];
        restore.push(() => { if (present) record[key] = value; else delete record[key]; });
    };
    const mapEntry = (map: Map<any, any>, key: any) => {
        const present = map.has(key), value = map.get(key);
        restore.push(() => { if (present) map.set(key, value); else map.delete(key); });
    };
    const visit = (child: any) => {
        if (child.ignore) return;
        if (child.geometry) geometries.add(child.geometry);
        for (const material of Array.isArray(child.material) ? child.material : child.material ? [child.material] : []) materials.add(material);
        entry(app.cameras, child.uuid);
        const helper = app.helpers[child.id], helperParent = helper?.parent, helperIndex = helperParent?.children.indexOf(helper);
        restore.push(() => {
            const current = app.helpers[child.id];
            if (current && current !== helper) {
                // Helpers own their geometry/material; never dispose the imported mesh resources.
                current.parent?.remove(current);
                current.traverse((part: any) => {
                    part.geometry?.dispose();
                    for (const material of Array.isArray(part.material) ? part.material : part.material ? [part.material] : []) material.dispose();
                });
            }
            if (helper) {
                app.helpers[child.id] = helper;
                if (helper.parent !== helperParent) {
                    helper.parent?.remove(helper);
                    if (helperParent) { helperParent.children.splice(helperIndex, 0, helper); helper.parent = helperParent; }
                }
            } else delete app.helpers[child.id];
        });
        const animations = child.animations, clips = [...animations];
        const mixer = app.animationManager.mixerMap.get(child.uuid);
        const uncachedClips = mixer ? clips.filter(clip => !clip.getClip && !mixer.existingAction(clip, child)) : [];
        mapEntry(app.animationManager.mixerMap, child.uuid);
        for (const clip of clips) mapEntry(app.animationManager.actionMap, clip.getClip ? clip.getClip().uuid : clip.uuid);
        restore.push(() => {
            const current = app.animationManager.mixerMap.get(child.uuid);
            if (current && current !== mixer) { current.stopAllAction(); current.uncacheRoot(child); }
            for (const clip of uncachedClips) mixer.uncacheAction(clip, child);
            child.animations = animations; animations.splice(0, animations.length, ...clips);
        });
        const castShadow = child.castShadow, receiveShadow = child.receiveShadow;
        restore.push(() => { child.castShadow = castShadow; child.receiveShadow = receiveShadow; });
        if ((child.isHtmlPanel || child.isHtmlSprite) && child.element) {
            const element = child.element, parent = element.parentNode, next = element.nextSibling;
            restore.push(() => { if (parent && element.parentNode !== parent) parent.insertBefore(element, next?.parentNode === parent ? next : null); });
        }
        for (const descendant of child.children) visit(descendant);
    };
    visit(root);
    for (const geometry of geometries) entry(app.geometries, geometry.uuid);
    for (const material of materials) {
        entry(app.materials, material.uuid); mapEntry(counts, material);
        const shadowSide = material.shadowSide;
        restore.push(() => { material.shadowSide = shadowSide; });
    }
    try { mutate(); }
    catch (error) {
        const failures: unknown[] = [];
        for (const action of restore.reverse()) { try { action(); } catch (failure) { failures.push(failure); } }
        try { refresh(); } catch (failure) { failures.push(failure); }
        if (failures.length) throw new BatchRecoveryError([error, ...failures], 'Object resource registration failed and recovery was incomplete');
        throw new ObjectRegistrationError(error);
    }
}
