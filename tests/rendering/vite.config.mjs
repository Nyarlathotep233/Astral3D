import {fileURLToPath} from 'node:url';

export default {
  root: fileURLToPath(new URL('../../', import.meta.url)),
  resolve: {
    alias: {
      'three/webgpu': fileURLToPath(new URL('../../packages/sdk/node_modules/three/build/three.webgpu.js', import.meta.url)),
      'three/tsl': fileURLToPath(new URL('../../packages/sdk/node_modules/three/build/three.tsl.js', import.meta.url)),
      'three': fileURLToPath(new URL('../../packages/sdk/node_modules/three/build/three.module.js', import.meta.url)),
    },
  },
  optimizeDeps: {include: ['three', 'three/webgpu', 'three/tsl']},
};
