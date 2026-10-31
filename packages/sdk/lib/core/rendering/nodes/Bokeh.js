// TSL port of Three BokehShader: same 41 samples and focus/aperture/maxblur equation.
import {Fn, vec2, vec4, uv, clamp, uniform, convertToTexture} from 'three/tsl';
const samples=[[0,0.4,1],[0.15,0.37,1],[0.29,0.29,1],[-0.37,0.15,1],[0.4,0,1],[0.37,-0.15,1],[0.29,-0.29,1],[-0.15,-0.37,1],[0,-0.4,1],[-0.15,0.37,1],[-0.29,0.29,1],[0.37,0.15,1],[-0.4,0,1],[-0.37,-0.15,1],[-0.29,-0.29,1],[0.15,-0.37,1],[0.15,0.37,0.9],[-0.37,0.15,0.9],[0.37,-0.15,0.9],[-0.15,-0.37,0.9],[-0.15,0.37,0.9],[0.37,0.15,0.9],[-0.37,-0.15,0.9],[0.15,-0.37,0.9],[0.29,0.29,0.7],[0.4,0,0.7],[0.29,-0.29,0.7],[0,-0.4,0.7],[-0.29,0.29,0.7],[-0.4,0,0.7],[-0.29,-0.29,0.7],[0,0.4,0.7],[0.29,0.29,0.4],[0.4,0,0.4],[0.29,-0.29,0.4],[0,-0.4,0.4],[-0.29,0.29,0.4],[-0.4,0,0.4],[-0.29,-0.29,0.4],[0,0.4,0.4]];
export function bokeh(input, viewZ, camera, options) {
 const image=convertToTexture(input);
 const aspect=uniform(1).onRenderUpdate(() => camera.isPerspectiveCamera ? camera.aspect : (camera.right-camera.left)/(camera.top-camera.bottom));
 return Fn(() => {
 const blur=clamp(viewZ.add(options.focus).mul(options.aperture), -options.maxblur, options.maxblur);
 const value=image.sample(uv()).toVar();
 for(const [x,y,scale] of samples) value.addAssign(image.sample(uv().add(vec2(x,y).mul(vec2(1,aspect)).mul(blur).mul(scale))));
 return vec4(value.rgb.div(41), 1);
 })();
}
