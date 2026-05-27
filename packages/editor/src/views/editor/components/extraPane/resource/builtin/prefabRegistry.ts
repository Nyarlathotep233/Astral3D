export type BuiltinPrefabResource = {
  key: string;
  name: string;
  image: string;
  path: string;
};

export const BUILTIN_PREFAB_RESOURCES: BuiltinPrefabResource[] = [
  // 将编辑器导出的 .h3dprefab.zip 放到 public/static/prefabs 后，在这里配置为内置 Prefab 资源。
  {
    key: "tower-crane",
    name: "塔吊",
    image: "/static/images/resource/prefab/tower-crane.png",
    path: "/static/prefabs/tower-crane.h3dprefab.zip",
  },
];

export function getBuiltinPrefabResource(key: string) {
  return BUILTIN_PREFAB_RESOURCES.find((resource) => resource.key === key) || null;
}
