// Fixed built-in TSL port of eddfcd4; no runtime GLSL translation.
import * as TSL from 'three/tsl';
// Three.js Transpiler r186

export default function createNodes(uniforms, inputs = {}) {
 const viewMatrix = TSL.cameraViewMatrix;
 const gl_FragCoord = TSL.vec4(TSL.screenCoordinate.x, TSL.screenSize.y.sub(TSL.screenCoordinate.y), 0, 1);

	const { reference, vec4, fract, vec2, float, mod, If, floor, sub, Fn } = TSL;

	const vUv = inputs.vUv;
	const uTime = reference( 'value', 'float', uniforms[ 'uTime' ] );

	const main = /*@__PURE__*/ Fn( () => {

		const result = vec4( 0.0 ).toVar();
		const uv = vUv.toVar();
		const cycle = fract( uTime ).toVar();
		const grid = vec2( 10, 10 ).toVar();
		const position = uv.mul( grid ).sub( vec2( cycle, 0 ) ).toVar();
		const color = float( 0.0 ).toVar();

		If( mod( position.y, 2.0 ).lessThan( 1.0 ), () => {

			If( fract( position.x ).lessThan( cycle ), () => {

				color.assign( 1.0 );

			} );

		} ).Else( () => {

			If( fract( position.x ).greaterThan( cycle ), () => {

				color.assign( 1.0 );

			} );

		} );

		If( mod( floor( uTime ), 2.0 ).lessThan( 1.0 ), () => {

			color.assign( sub( 1.0, color ) );

		} );

		result.assign( vec4( color, color, color, 1.0 ) );

		return result;

	} );
	return { uTime, main };

}
