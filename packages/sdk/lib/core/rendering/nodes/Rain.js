// Fixed built-in TSL port of eddfcd4; no runtime GLSL translation.
import * as TSL from 'three/tsl';
// Three.js Transpiler r186

export default function createNodes(uniforms, inputs = {}) {
 const viewMatrix = TSL.cameraViewMatrix;
 const gl_FragCoord = TSL.vec4(TSL.screenCoordinate.x, TSL.screenSize.y.sub(TSL.screenCoordinate.y), 0, 1);

	const { screenCoordinate, vec3, reference, vec2, fract, mul, Fn, floor, sub, mix, vec4, cos, abs, pow, clamp } = TSL;

	// Polyfills

	const u_resolution = reference( 'value', 'vec2', uniforms[ 'u_resolution' ] );
	const u_time = reference( 'value', 'float', uniforms[ 'u_time' ] );
	const speed = reference( 'value', 'float', uniforms[ 'speed' ] );
	const color = reference( 'value', 'color', uniforms[ 'color' ] );
	const radian = reference( 'value', 'float', uniforms[ 'radian' ] );
	const alpha = reference( 'value', 'float', uniforms[ 'alpha' ] );
	const size = reference( 'value', 'float', uniforms[ 'size' ] );
	const vUv = inputs.vUv;

	const hash = /*@__PURE__*/ Fn( ( [ p_immutable ] ) => {

		const p = p_immutable.toVar();
		p.assign( mul( 50.0, fract( p.mul( 0.3183099 ).add( vec2( 0.71, 0.113 ) ) ) ) );

		return TSL.float(-1).add( mul( 2.0, fract( p.x.mul( p.y ).mul( p.x.add( p.y ) ) ) ) );

	} );

	const noise = /*@__PURE__*/ Fn( ( [ p ] ) => {

		const i = floor( p ).toVar();
		const f = fract( p ).toVar();
		const u = f.mul( f ).mul( sub( 3.0, mul( 2.0, f ) ) ).toVar();

		return mix( mix( hash( i.add( vec2( 0.0, 0.0 ) ) ), hash( i.add( vec2( 1.0, 0.0 ) ) ), u.x ), mix( hash( i.add( vec2( 0.0, 1.0 ) ) ), hash( i.add( vec2( 1.0, 1.0 ) ) ), u.x ), u.y );

	} );

	const main = /*@__PURE__*/ Fn( () => {

		const result = vec4( 0.0 ).toVar();
		const col = vec4( 0.0 ).rgb.toVar();
		const q = gl_FragCoord.xy.div( u_resolution.xy ).toVar();
		const p = TSL.float(-1).add( mul( 2.0, q ) ).toVar();
		const st = p.mul( vec2( .5, .01 ) ).add( vec2( u_time ).mul( 0.05 ).mul( speed ) ).sub( vec2( q.y.mul( cos( radian ) ), 0.0 ) ).toVar();
		st.mulAssign( sub( 1000.0, size.mul( 500.0 ) ) );
		const f = noise( st ).mul( noise( st.mul( .773 ) ) ).mul( 1.55 ).toVar();
		f.assign( clamp( pow( abs( f ), 23.0 ).mul( 13.0 ), 0.0, q.y.mul( .14 ) ).mul( 2.7 ) );
		col.addAssign( clamp( f, 0.0, 1.0 ).mul( color ) );
		result.assign( vec4( col, alpha ) );

		return result;

	} );
	return { u_resolution, u_time, speed, color, radian, alpha, size, hash, noise, main };

}
