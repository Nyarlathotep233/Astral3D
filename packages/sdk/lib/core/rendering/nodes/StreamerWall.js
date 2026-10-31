// Fixed built-in TSL port of eddfcd4; no runtime GLSL translation.
import * as TSL from 'three/tsl';
// Three.js Transpiler r186

export default function createNodes(uniforms, inputs = {}) {
 const viewMatrix = TSL.cameraViewMatrix;
 const gl_FragCoord = TSL.vec4(TSL.screenCoordinate.x, TSL.screenSize.y.sub(TSL.screenCoordinate.y), 0, 1);

	const { reference, vec4, fract, vec2, Fn } = TSL;

	const vUv = inputs.vUv;
	const uTime = reference( 'value', 'float', uniforms[ 'uTime' ] );
	const uFlowTexture = inputs.textures['uFlowTexture'];
	const uBgTexture = inputs.textures['uBgTexture'];

	const main = /*@__PURE__*/ Fn( () => {

		const result = vec4( 0.0 ).toVar();
		const position = vUv.toVar();
		const colorA = uFlowTexture.sample( vec2( vUv.x, fract( vUv.y.sub( uTime ) ) ) ).toVar();
		const colorB = uBgTexture.sample( position.xy ).toVar();
		result.assign( colorB.add( colorB.mul( colorA ) ) );

		return result;

	} );
	return { uTime, uFlowTexture, uBgTexture, main };

}
