// Fixed built-in TSL port of eddfcd4; no runtime GLSL translation.
import * as TSL from 'three/tsl';
// Three.js Transpiler r186

export default function createNodes(uniforms, inputs = {}) {
 const viewMatrix = TSL.cameraViewMatrix;
 const gl_FragCoord = TSL.vec4(TSL.screenCoordinate.x, TSL.screenSize.y.sub(TSL.screenCoordinate.y), 0, 1);

	const { reference, vec4, Fn } = TSL;

	const uColor = reference( 'value', 'color', uniforms[ 'uColor' ] );
	const uOpacity = reference( 'value', 'float', uniforms[ 'uOpacity' ] );
	const vOpacity = inputs.vOpacity;

	const main = /*@__PURE__*/ Fn( () => {

		const result = vec4( 0.0 ).toVar();
		result.assign( vec4( uColor, vOpacity.mul( uOpacity ) ) );

		return result;

	} );
	return { uColor, uOpacity, main };

}
