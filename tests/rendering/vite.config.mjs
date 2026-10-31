import {fileURLToPath} from 'node:url';
const path = value => fileURLToPath(new URL(value, import.meta.url));
export default {
 root: path('../../'),
 publicDir: path('../../packages/sdk/public'),
 resolve: {alias: [
  {find: '@', replacement: path('../../packages/sdk/lib')},
  {find: /^three$/, replacement: path('../../packages/sdk/node_modules/three/build/three.module.js')},
  {find: 'three/webgpu', replacement: path('../../packages/sdk/node_modules/three/build/three.webgpu.js')},
  {find: 'three/tsl', replacement: path('../../packages/sdk/node_modules/three/build/three.tsl.js')},
  {find: 'three/addons', replacement: path('../../packages/sdk/node_modules/three/examples/jsm')},
  {find: 'three/examples', replacement: path('../../packages/sdk/node_modules/three/examples')},
 ]},
 optimizeDeps: {include: ['three', 'three/webgpu', 'three/tsl']},
};
