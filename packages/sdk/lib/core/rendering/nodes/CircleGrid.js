// Fixed built-in TSL port of eddfcd4; no runtime GLSL translation.
import * as TSL from 'three/tsl';
// Three.js Transpiler r186

export default function createNodes(uniforms, inputs = {}) {
 const viewMatrix = TSL.cameraViewMatrix;
 const gl_FragCoord = TSL.vec4(TSL.screenCoordinate.x, TSL.screenSize.y.sub(TSL.screenCoordinate.y), 0, 1);

	const { reference, vec3, mul, cos, Fn, vec4, fract, length, exp, sin, abs, div, pow, Loop } = TSL;

	// 片元着色器中所有浮点数精度为中精度

	const vUv = inputs.vUv;
	const uTime = reference( 'value', 'float', uniforms[ 'uTime' ] );

	const palette = /*@__PURE__*/ Fn( ( [ t ] ) => {

		const a = vec3( 0.5, 0.5, 0.5 ).toVar();
		const b = vec3( 0.5, 0.5, 0.5 ).toVar();
		const c = vec3( 1.0, 1.0, 1.0 ).toVar();
		const d = vec3( 0.263, 0.416, 0.557 ).toVar();

		return a.add( b.mul( cos( mul( 6.28318, c.mul( t ).add( d ) ) ) ) );

	} );

	const main = /*@__PURE__*/ Fn( () => {

		const result = vec4( 0.0 ).toVar();
		const uv = vUv.toVar();
		uv.subAssign( .5 );

		// 使坐标范围从-0.5到0.5

		uv.mulAssign( 3. );

		// 使坐标范围从-1.5到1.5

		const uv0 = uv.toVar();
		const finalColor = vec3( 0.0 ).toVar();

		Loop( { start: 0.0, end: 4.0, type: 'float' }, ( { i } ) => {

			uv.assign( fract( uv.mul( 1.5 ) ).sub( 0.5 ) );
			const d = length( uv ).mul( exp( length( uv0 ).negate() ) ).toVar();
			const col = palette( length( uv0 ).add( i.mul( .4 ) ).add( uTime.mul( .4 ) ) ).toVar();
			d.assign( sin( d.mul( 8. ).add( uTime ) ).div( 8. ) );
			d.assign( abs( d ) );
			d.assign( pow( div( 0.01, d ), 1.2 ) );
			finalColor.addAssign( col.mul( d ) );

		} );

		result.assign( vec4( finalColor, 1. ) );

		return result;

	} );
	return { uTime, palette, main };

}
