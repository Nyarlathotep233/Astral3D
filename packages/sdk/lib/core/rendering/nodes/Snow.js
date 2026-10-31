// Fixed built-in TSL port of eddfcd4; no runtime GLSL translation.
import * as TSL from 'three/tsl';
// Three.js Transpiler r186

export default function createNodes(uniforms, inputs = {}) {
 const viewMatrix = TSL.cameraViewMatrix;
 const gl_FragCoord = TSL.vec4(TSL.screenCoordinate.x, TSL.screenSize.y.sub(TSL.screenCoordinate.y), 0, 1);

	const { screenCoordinate, vec3, reference, vec2, distance, smoothstep, Fn, sin, fract, uv, float, floor, vec4, mul, div, mix, Loop } = TSL;

	// Polyfills

	const iResolution = reference( 'value', 'vec2', uniforms[ 'iResolution' ] );
	const iTime = reference( 'value', 'float', uniforms[ 'iTime' ] );
	const size = reference( 'value', 'float', uniforms[ 'size' ] );

	// 输入的 size,显示给用户的值是实际值的十倍

	const density = reference( 'value', 'float', uniforms[ 'density' ] );
	const speed = reference( 'value', 'float', uniforms[ 'speed' ] );
	const alpha = reference( 'value', 'float', uniforms[ 'alpha' ] );
	const vUv = inputs.vUv;

	const ball = /*@__PURE__*/ Fn( ( [ p ] ) => {

		const d = distance( vec2( .5 ), p ).toVar();

		return smoothstep( size.div( 10.0 ), size.div( 10.0 ).sub( .05 ), d );

	} );

	const N11 = /*@__PURE__*/ Fn( ( [ n ] ) => {

		return fract( sin( n.mul( 871.213 ) ).mul( 3134.422 ) );

	} );

	const N21 = /*@__PURE__*/ Fn( ( [ uv ] ) => {

		return N11( N11( uv.x ).add( uv.y ) );

	} );

	const snow = /*@__PURE__*/ Fn( ( [ uv, t ] ) => {

		const org_uv = vec2( uv.x, uv.y ).toVar();
		const z = float( 10. ).toVar();
		uv.y.addAssign( t.mul( .5 ) );
		const gv = fract( uv.mul( z ) ).toVar();
		const id = floor( uv.mul( z ) ).toVar();
		gv.x.addAssign( sin( N21( id ).mul( 128. ).add( t ) ).mul( .4 ) );
		gv.y.addAssign( sin( N11( N21( id ) ).mul( 128. ).add( t ) ).mul( .4 ) );
		const dots = ball( gv ).toVar();

		return dots;

	} );

	const main = /*@__PURE__*/ Fn( () => {

		const result = vec4( 0.0 ).toVar();
		const col = vec4( 0.0 ).rgb.toVar();
		const uv = gl_FragCoord.xy.div( iResolution.xy ).toVar();
		uv.x.mulAssign( iResolution.x.div( iResolution.y ) );
		const t = iTime.mul( .3 ).mul( speed ).toVar();
		const gh_uv = uv.toVar();

		// Time varying pixel color

		const colSnow = vec3( 0. ).toVar();
		const m = float( 0. ).toVar();

		Loop( { start: 0., end: 1., type: 'float', condition: '<=', update: ( { i } ) => i.addAssign( div( 1., mul( 32., density ) ) ) }, ( { i } ) => {

			const z = mix( 1., .5, i ).toVar();
			const offset = vec2( N11( i ), N11( N11( i ) ) ).toVar();
			m.addAssign( snow( uv.add( offset ).mul( z ), t ).mul( .3 ) );

		} );

		colSnow.assign( vec3( m ).mul( 1.2 ) );
		colSnow.addAssign( col.mul( .8 ).mul( mix( .5, 1., uv.y ) ) );

		// 如果不是雪的像素，设置为透明
		// if (m <= 0.0) {
		//     result = vec4(0.0, 0.0, 0.0, 0.0); // 完全透明
		// } else {
		//     result = vec4(colSnow, alpha); // 雪的像素保持原有颜色和透明度
		// }

		result.assign( vec4( colSnow, alpha ) );

		return result;

	} );
	return { iResolution, iTime, size, density, speed, alpha, ball, N11, N21, snow, main };

}
