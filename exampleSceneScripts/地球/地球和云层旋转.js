// ===== 可调参数 =====
const CONFIG = {
  // 地表/城市灯整体自转速度（度/秒）
  landDegPerSec: 2.0,

  // 云层自转速度（度/秒）
  // 建议比 land 稍微快一点点，形成相对漂移
  cloudsDegPerSec: 2.18,

  // 大气层是否跟着地表一起转
  rotateAtmosphere: false,

  // 大气层旋转速度（仅 rotateAtmosphere=true 时生效）
  atmosphereDegPerSec: 2.0,

  autoRotate: true,
  debug: false,

  // ===== CityLights Shader 参数 =====
  cityIntensity: 1.35,          // 城市灯整体强度
  cloudShadowStrength: 0.65,    // 云层对灯光的遮挡强度（0~1）
  cloudThreshold: 0.18,         // 云层判定阈值，越大越“厚云才挡光”
  alphaCutoff: 0.015,           // 太低会有黑底脏边，太高会闪
  twilightStart: -0.12,         // 晨昏线过渡起点（夜面）
  twilightEnd: 0.05,            // 晨昏线过渡终点（靠近日面）

  // 如果发现“云层遮灯”的漂移方向反了，把这个改成 -1
  cloudOffsetSign: 1,
};

// ===== 全局引用 =====
let earthLand = null;
let earthClouds = null;
let earthAtmosphere = null;
let earthSurface = null;
let earthCityLights = null;
let directionalLight = null;

// ===== CityLights 材质 / 贴图 =====
let cityShaderMaterial = null;
let cachedNightMap = null;
let cachedNightAlphaMap = null;
let cachedCloudMap = null;

// ===== 临时变量，避免每帧 new =====
const _lightPos = new THREE.Vector3();
const _targetPos = new THREE.Vector3();
const _sunDir = new THREE.Vector3();

// ===== Shader 源码 =====
const CITY_LIGHTS_VERTEX_SHADER = `
varying vec2 vUv;
varying vec3 vWorldNormal;

void main() {
    vUv = uv;

    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const CITY_LIGHTS_FRAGMENT_SHADER = `
uniform sampler2D uNightMap;
uniform sampler2D uNightAlphaMap;
uniform sampler2D uCloudMap;

uniform vec3 uSunDir;

uniform float uHasNightAlpha;
uniform float uCloudLonOffset;
uniform float uCityIntensity;
uniform float uCloudShadowStrength;
uniform float uCloudThreshold;
uniform float uAlphaCutoff;
uniform float uTwilightStart;
uniform float uTwilightEnd;

varying vec2 vUv;
varying vec3 vWorldNormal;

const vec3 LUMA = vec3(0.299, 0.587, 0.114);
const float PI2 = 6.283185307179586;

void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 L = normalize(uSunDir);

    // ndotl > 0 表示向着太阳
    float ndotl = dot(N, L);

    // 夜灯只在夜面渐亮
    float nightMask = 1.0 - smoothstep(uTwilightStart, uTwilightEnd, ndotl);

    // 夜景图
    vec4 nightTex = texture2D(uNightMap, vUv);
    float nightLuma = dot(nightTex.rgb, LUMA);

    // 如果有单独的 alpha 图，就优先用它；否则退化为用夜景图亮度做遮罩
    float baseMask = 0.0;
    if (uHasNightAlpha > 0.5) {
        vec3 alphaRgb = texture2D(uNightAlphaMap, vUv).rgb;
        baseMask = dot(alphaRgb, LUMA);
    } else {
        baseMask = smoothstep(0.02, 0.18, nightLuma);
    }

    // 根据云层相对地表的旋转差，修正云图采样
    vec2 cloudUv = vUv;
    cloudUv.x = fract(cloudUv.x + uCloudLonOffset / PI2);

    vec3 cloudRgb = texture2D(uCloudMap, cloudUv).rgb;
    float cloud = dot(cloudRgb, LUMA);

    // 让“厚云”更明显地遮灯，薄云只轻微影响
    cloud = smoothstep(uCloudThreshold, 1.0, cloud);

    // 云层遮挡：有云处把灯压暗，而不是硬切
    float cloudOcclusion = clamp(1.0 - cloud * uCloudShadowStrength, 0.0, 1.0);

    vec3 color = nightTex.rgb * uCityIntensity * nightMask * cloudOcclusion;

    // alpha 也跟着灯光和云层一起变化，避免黑壳感
    float alpha = clamp(baseMask * nightMask * cloudOcclusion, 0.0, 1.0);

    if (alpha < uAlphaCutoff) discard;

    gl_FragColor = vec4(color, alpha);
}
`;

// ===== 工具函数 =====
function normalizeAngleRad(v) {
  return Math.atan2(Math.sin(v), Math.cos(v));
}

function getSunDir(out) {
  if (!directionalLight) return out.set(0, 0, -1);

  directionalLight.updateMatrixWorld(true);

  if (directionalLight.target) {
    directionalLight.target.updateMatrixWorld(true);
    directionalLight.getWorldPosition(_lightPos);
    directionalLight.target.getWorldPosition(_targetPos);

    // 从表面点指向光源的方向
    out.copy(_lightPos).sub(_targetPos).normalize();
  } else {
    out.set(0, 0, -1);
  }

  return out;
}

function prepareTexture(tex) {
  if (!tex) return null;

  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;

  return tex;
}

function createCityLightsShaderMaterial(sourceMaterial) {
  const nightMap =
    cachedNightMap ||
    sourceMaterial.emissiveMap ||
    sourceMaterial.map ||
    null;

  const nightAlphaMap =
    cachedNightAlphaMap ||
    sourceMaterial.alphaMap ||
    null;

  const cloudMap =
    cachedCloudMap ||
    (earthClouds && earthClouds.material
      ? (earthClouds.material.map || earthClouds.material.alphaMap || null)
      : null);

  cachedNightMap = prepareTexture(nightMap);
  cachedNightAlphaMap = prepareTexture(nightAlphaMap);
  cachedCloudMap = prepareTexture(cloudMap);

  if (!cachedNightMap) {
    console.warn("Earth_CityLights: 未找到夜景贴图（emissiveMap/map）。");
  }
  if (!cachedCloudMap) {
    console.warn("Earth_CityLights: 未找到云层贴图（Earth_Clouds.material.map）。");
  }

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uNightMap: { value: cachedNightMap },
      uNightAlphaMap: { value: cachedNightAlphaMap },
      uCloudMap: { value: cachedCloudMap },

      uSunDir: { value: new THREE.Vector3(0, 0, -1) },

      uHasNightAlpha: { value: cachedNightAlphaMap ? 1.0 : 0.0 },
      uCloudLonOffset: { value: 0.0 },
      uCityIntensity: { value: CONFIG.cityIntensity },
      uCloudShadowStrength: { value: CONFIG.cloudShadowStrength },
      uCloudThreshold: { value: CONFIG.cloudThreshold },
      uAlphaCutoff: { value: CONFIG.alphaCutoff },
      uTwilightStart: { value: CONFIG.twilightStart },
      uTwilightEnd: { value: CONFIG.twilightEnd },
    },
    vertexShader: CITY_LIGHTS_VERTEX_SHADER,
    fragmentShader: CITY_LIGHTS_FRAGMENT_SHADER,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.NormalBlending,
  });

  mat.name = "Earth_CityLights_Shader";
  mat.userData.__earthCityLightsShader = true;

  return mat;
}

function patchCityLightsMaterial() {
  if (!earthCityLights) return;

  const currentMat = earthCityLights.material;
  if (!currentMat) return;

  // 已经是我们自己的 shader，就不重复换
  if (currentMat.userData && currentMat.userData.__earthCityLightsShader) {
    cityShaderMaterial = currentMat;
    return;
  }

  cityShaderMaterial = createCityLightsShaderMaterial(currentMat);
  earthCityLights.material = cityShaderMaterial;

  // 建议保持这个层在 Surface 之后、Clouds 之前
  earthCityLights.renderOrder = 1;

  if (CONFIG.debug) {
    console.log("Earth_CityLights material patched to ShaderMaterial");
  }
}

function ensureCityLightsPatched() {
  if (!earthCityLights) return;
  if (!earthCityLights.material) return;

  if (
    !earthCityLights.material.userData ||
    !earthCityLights.material.userData.__earthCityLightsShader
  ) {
    patchCityLightsMaterial();
  } else {
    cityShaderMaterial = earthCityLights.material;
  }
}

// ===== 生命周期 =====
function loaded() {
  earthLand = scene.getObjectByName("Earth_Land");
  earthClouds = scene.getObjectByName("Earth_Clouds");
  earthAtmosphere = scene.getObjectByName("Earth_Atmosphere");
  earthSurface = scene.getObjectByName("Earth_Surface");
  earthCityLights = scene.getObjectByName("Earth_CityLights");
  directionalLight = scene.getObjectByName("DirectionalLight");

  if (CONFIG.debug) {
    console.group("Earth_Main loaded");
    console.log("earthLand =", earthLand);
    console.log("earthClouds =", earthClouds);
    console.log("earthAtmosphere =", earthAtmosphere);
    console.log("earthSurface =", earthSurface);
    console.log("earthCityLights =", earthCityLights);
    console.log("directionalLight =", directionalLight);
    console.groupEnd();
  }

  patchCityLightsMaterial();
}

function beforeRender(delta) {
  ensureCityLightsPatched();

  if (!cityShaderMaterial || !cityShaderMaterial.uniforms) return;
  if (!earthLand || !earthClouds) return;

  // 更新太阳方向
  getSunDir(_sunDir);
  cityShaderMaterial.uniforms.uSunDir.value.copy(_sunDir);

  // 更新云层相对地表的经度偏移
  let cloudOffset = earthClouds.rotation.y - earthLand.rotation.y;
  cloudOffset = normalizeAngleRad(cloudOffset) * CONFIG.cloudOffsetSign;
  cityShaderMaterial.uniforms.uCloudLonOffset.value = cloudOffset;

  // 如果你后面想热调参数，这里也可以每帧同步
  cityShaderMaterial.uniforms.uCityIntensity.value = CONFIG.cityIntensity;
  cityShaderMaterial.uniforms.uCloudShadowStrength.value = CONFIG.cloudShadowStrength;
  cityShaderMaterial.uniforms.uCloudThreshold.value = CONFIG.cloudThreshold;
  cityShaderMaterial.uniforms.uAlphaCutoff.value = CONFIG.alphaCutoff;
  cityShaderMaterial.uniforms.uTwilightStart.value = CONFIG.twilightStart;
  cityShaderMaterial.uniforms.uTwilightEnd.value = CONFIG.twilightEnd;
}

function afterAnimation(delta, toBeRender) {
  if (!CONFIG.autoRotate) return;

  // 1) 地表和城市灯一起转
  if (earthLand) {
    const landStep =
      THREE.MathUtils.degToRad(CONFIG.landDegPerSec) * delta;
    earthLand.rotation.y += landStep;
  }

  // 2) 云层单独转，略快一点，形成相对漂移
  if (earthClouds) {
    const cloudStep =
      THREE.MathUtils.degToRad(CONFIG.cloudsDegPerSec) * delta;
    earthClouds.rotation.y += cloudStep;
  }

  // 3) 大气层可选是否旋转
  if (CONFIG.rotateAtmosphere && earthAtmosphere) {
    const atmosphereStep =
      THREE.MathUtils.degToRad(CONFIG.atmosphereDegPerSec) * delta;
    earthAtmosphere.rotation.y += atmosphereStep;
  }

  toBeRender(true);
}

function onKeyDown(event) {
  switch (event.key) {
    case " ":
      CONFIG.autoRotate = !CONFIG.autoRotate;
      console.log("autoRotate =", CONFIG.autoRotate);
      break;

    case "[":
      CONFIG.landDegPerSec = Math.max(0, CONFIG.landDegPerSec - 0.2);
      console.log("landDegPerSec =", CONFIG.landDegPerSec);
      break;

    case "]":
      CONFIG.landDegPerSec += 0.2;
      console.log("landDegPerSec =", CONFIG.landDegPerSec);
      break;

    case "-":
      CONFIG.cloudsDegPerSec = Math.max(0, CONFIG.cloudsDegPerSec - 0.05);
      console.log("cloudsDegPerSec =", CONFIG.cloudsDegPerSec);
      break;

    case "=":
      CONFIG.cloudsDegPerSec += 0.05;
      console.log("cloudsDegPerSec =", CONFIG.cloudsDegPerSec);
      break;

    case "1":
      CONFIG.cityIntensity = Math.max(0, CONFIG.cityIntensity - 0.1);
      console.log("cityIntensity =", CONFIG.cityIntensity);
      break;

    case "2":
      CONFIG.cityIntensity += 0.1;
      console.log("cityIntensity =", CONFIG.cityIntensity);
      break;

    case "3":
      CONFIG.cloudShadowStrength = Math.max(0, CONFIG.cloudShadowStrength - 0.05);
      console.log("cloudShadowStrength =", CONFIG.cloudShadowStrength);
      break;

    case "4":
      CONFIG.cloudShadowStrength = Math.min(1.0, CONFIG.cloudShadowStrength + 0.05);
      console.log("cloudShadowStrength =", CONFIG.cloudShadowStrength);
      break;

    case "r":
    case "R":
      if (earthLand) earthLand.rotation.set(0, 0, 0);
      if (earthClouds) earthClouds.rotation.set(0, 0, 0);
      if (earthAtmosphere) earthAtmosphere.rotation.set(0, 0, 0);
      console.log("rotation reset");
      break;
  }
}
