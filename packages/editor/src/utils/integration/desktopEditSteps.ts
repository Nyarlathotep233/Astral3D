import type { Material, Object3D } from 'three';

export function materialAt(object: Object3D, slot: number): Material {
  const value = (object as any).material;
  const material = Array.isArray(value) ? value[slot] : slot === 0 ? value : undefined;
  if (!material?.isMaterial) throw new Error(`Material slot ${slot} not found on ${object.uuid}`);
  if (material.isShaderMaterial || material.isRawShaderMaterial) throw new Error('GLSL materials are not editable through MCP');
  return material;
}

export function materialStep(object: Object3D, op: any, replace: (value: Material) => void, notify: (value: Material) => void) {
  const original = materialAt(object, op.slot);
  for (const key of Object.keys(op.values)) {
    if ((original as any)[key] === undefined) throw new Error(`Material ${original.type} does not support ${key}`);
  }
  const material = op.scope === 'object' ? original.clone() : original;
  const before: Record<string, any> = {};
  for (const key of Object.keys(op.values)) {
    const value = (material as any)[key];
    before[key] = value?.isColor ? value.clone() : value;
  }
  const set = (values: Record<string, any>) => { material.setValues(values); material.needsUpdate = true; };
  return {
    execute() { set(op.values); if (op.scope === 'object') replace(material); notify(material); },
    undo() { if (op.scope === 'object') replace(original); else set(before); notify(original); },
  };
}

/** Preserve script object/array identity across edits and history; never evaluate source. */
export function scriptStep(scripts: Record<string, any[]>, object: Object3D, op: any, notify: (event: string, ...args: any[]) => void) {
  const existed = Object.hasOwn(scripts, object.uuid);
  const list = scripts[object.uuid] || [];
  const index = op.type === 'script-add' ? list.length : op.index;
  const script = op.type === 'script-add' ? JSON.parse(JSON.stringify(op.script)) : list[index];
  if (!script) throw new Error(`Script index ${index} not found on ${object.uuid}`);
  if (op.type === 'script-add') return {
    execute() { scripts[object.uuid] = list; if (!list.includes(script)) list.splice(index, 0, script); notify('scriptAdded', object, script); },
    undo() { const i=list.indexOf(script); if(i>=0)list.splice(i,1); if(!existed&&!list.length)delete scripts[object.uuid]; notify('scriptRemoved',object,script); },
  };
  if (op.type === 'script-remove') return {
    execute() { const i=list.indexOf(script); if(i>=0)list.splice(i,1); notify('scriptRemoved',object,script); },
    undo() { if(!list.includes(script))list.splice(index,0,script); notify('scriptAdded',object,script); },
  };
  const before = new Map(Object.keys(op.values).map(key => [key, { exists: Object.hasOwn(script,key), value:script[key] }]));
  const values = JSON.parse(JSON.stringify(op.values));
  const apply = (undo: boolean) => {
    for (const [key, old] of before) {
      const previous = script[key];
      if (undo && !old.exists) delete script[key];
      else script[key] = undo ? old.value : values[key];
      notify('scriptChanged',key,object,script,previous);
    }
  };
  return { execute() { apply(false); }, undo() { apply(true); } };
}
