import {build} from 'vite';

for (const format of ['es', 'umd']) {
    process.env.H3D_SDK_FORMAT = format;
    await build();
}
