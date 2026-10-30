// Fixed camera, lighting and resolution for WebGL / WebGPU comparisons.
export function createFixture(T) {
  const scene = new T.Scene();
  scene.background = new T.Color('#272727');
  const camera = new T.PerspectiveCamera(45, 960 / 640, 0.1, 100);
  camera.position.set(6, 5, 9);
  camera.lookAt(0, 0.6, 0);
  scene.add(new T.HemisphereLight(0xffffff, 0x444444, 2));
  const light = new T.DirectionalLight(0xffffff, 3);
  light.position.set(4, 7, 3);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  scene.add(light);
  const ground = new T.Mesh(new T.PlaneGeometry(16, 16), new T.MeshStandardMaterial({color: '#777777', roughness: 0.8}));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const materials = [
    new T.MeshStandardMaterial({color: '#1772b4', roughness: 0.4, metalness: 0.2}),
    new T.MeshPhysicalMaterial({color: '#e6a23c', roughness: 0.2, clearcoat: 1}),
    new T.MeshStandardMaterial({color: '#55ccaa', transparent: true, opacity: 0.45}),
  ];
  materials.forEach((material, i) => {
    const object = new T.Mesh(new T.SphereGeometry(0.75, 32, 24), material);
    object.name = `fixture-${i}`;
    object.position.set((i - 1) * 2, 0.75, 0);
    object.castShadow = object.receiveShadow = true;
    scene.add(object);
  });
  return {scene, camera};
}
