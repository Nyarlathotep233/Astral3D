import type { Object3D } from 'three';

/** Only for an owned, detached import result. Never use on live/shared scene resources. */
export function disposeDetachedObject(object: Object3D) {
  const resources = new Set<any>(), images = new Set<any>();
  object.traverse((child: any) => {
    if (child.geometry) resources.add(child.geometry);
    for (const material of Array.isArray(child.material) ? child.material : child.material ? [child.material] : []) {
      resources.add(material);
      for (const value of Object.values(material) as any[]) if (value?.isTexture) {
        resources.add(value);
        if (value.source?.data) images.add(value.source.data);
      }
    }
  });
  for (const resource of resources) resource.dispose();
  for (const image of images) if (typeof image.close === 'function') image.close();
}
