// Fixed built-in TSL port of eddfcd4; no runtime GLSL translation.
import * as TSL from 'three/tsl';
// Three.js Transpiler r186

export default function createNodes(uniforms, inputs = {}) {
 const viewMatrix = TSL.cameraViewMatrix;
 const gl_FragCoord = TSL.vec4(TSL.screenCoordinate.x, TSL.screenSize.y.sub(TSL.screenCoordinate.y), 0, 1);

	const { reference, cos, sin, mat3, Fn, vec2, dot, fract, floor, mul, sub, mix, float, mat2, mod, select, Loop, vec4, If, property, vec3, clamp, length, uv, distance, pow, max, color } = TSL;

	const vUv = inputs.vUv;
	const uTime = reference( 'value', 'float', uniforms[ 'uTime' ] );
	const uResolution = reference( 'value', 'vec2', uniforms[ 'uResolution' ] );

	const rotX = /*@__PURE__*/ Fn( ( [ a ] ) => {

		const c = cos( a ).toVar();
		const s = sin( a ).toVar();

		return mat3( 1, 0, 0, 0, c, s.negate(), 0, s, c );

	} );

	const rotY = /*@__PURE__*/ Fn( ( [ a ] ) => {

		const c = cos( a ).toVar();
		const s = sin( a ).toVar();

		return mat3( c, 0, s.negate(), 0, 1, 0, s, 0, c );

	} );

	const random = /*@__PURE__*/ Fn( ( [ pos ] ) => {

		return fract( sin( dot( pos.xy, vec2( 13.9898, 78.233 ) ) ).mul( 43758.5453123 ) );

	} );

	const noise = /*@__PURE__*/ Fn( ( [ pos ] ) => {

		const i = floor( pos ).toVar();
		const f = fract( pos ).toVar();
		const a = random( i.add( vec2( 0.0, 0.0 ) ) ).toVar();
		const b = random( i.add( vec2( 1.0, 0.0 ) ) ).toVar();
		const c = random( i.add( vec2( 0.0, 1.0 ) ) ).toVar();
		const d = random( i.add( vec2( 1.0, 1.0 ) ) ).toVar();
		const u = f.mul( f ).mul( sub( 3.0, mul( 2.0, f ) ) ).toVar();

		return mix( a, b, u.x ).add( c.sub( a ).mul( u.y ).mul( sub( 1.0, u.x ) ) ).add( d.sub( b ).mul( u.x ).mul( u.y ) );

	} );

	const fbm = /*@__PURE__*/ Fn( ( [ pos_immutable ] ) => {

		const pos = pos_immutable.toVar();
		const v = float( 0.0 ).toVar();
		const a = float( 0.5 ).toVar();
		const shift = vec2( 100.0 ).toVar();
		const rot = mat2( cos( 0.5 ), sin( 0.5 ), sin( 0.5 ).negate(), cos( 0.5 ) ).toVar();

		Loop( 6, ( { i } ) => {

			const dir = select( mod( float( i ), 2.0 ).greaterThan( 0.5 ), 1.0, - 1.0 ).toVar();
			v.addAssign( a.mul( noise( pos.sub( mul( 0.05, dir ).mul( uTime ) ) ) ) );
			pos.assign( rot.mul( pos ).mul( 2.0 ).add( shift ) );
			a.mulAssign( 0.5 );

		} );

		return v;

	} );

	const main = /*@__PURE__*/ Fn( () => {

		const result = vec4( 0.0 ).toVar();
		const uv = vUv.toVar();
		const p = uv.mul( 3.0 ).sub( 1.0 ).mul( 0.5 ).toVar();

		// 屏幕适配

		If( uResolution.x.greaterThan( uResolution.y ), () => {

			p.x.mulAssign( uResolution.x.div( uResolution.y ) );

		} ).Else( () => {

			p.y.mulAssign( uResolution.y.div( uResolution.x ) );

		} );

		p.subAssign( vec2( 12.0, 0.0 ) );
		const t = float( 0.0 ), d = property( 'float' ).toVar().toVar();
		const time2 = float( 1.0 ).toVar();
		const q = vec2( 0.0 ).toVar();
		q.x.assign( fbm( p.add( mul( 0.00, time2 ) ) ) );
		q.y.assign( fbm( p.add( vec2( 1.0 ) ) ) );
		const r = vec2( 0.0 ).toVar();
		r.x.assign( fbm( p.add( mul( 1.0, q ) ).add( vec2( 1.7, 1.2 ) ).add( mul( 0.15, time2 ) ) ) );
		r.y.assign( fbm( p.add( mul( 1.0, q ) ).add( vec2( 8.3, 2.8 ) ).add( mul( 0.126, time2 ) ) ) );
		const f = fbm( p.add( r ) ).toVar();
		const color = mix( vec3( 1.0, 1.0, 2.0 ), vec3( 1.0, 1.0, 1.0 ), clamp( f.mul( f ).mul( 5.5 ), 1.2, 15.5 ) ).toVar();
		color.assign( mix( color, vec3( 1.0, 1.0, 1.0 ), clamp( length( q ), 2.0, 2.0 ) ) );
		color.assign( mix( color, vec3( 0.3, 0.2, 1.0 ), clamp( length( r.x ), 0.0, 5.0 ) ) );
		color.assign( f.mul( f ).mul( f ).mul( 1.0 ).add( 0.5 * 1.7 * 0.0 ).add( mul( 0.9, f ) ).mul( color ) );
		const alpha = sub( 50.0, max( pow( mul( 100.0, distance( uv.x, - 1.0 ) ), 0.0 ), pow( mul( 2.0, distance( uv.y, 0.5 ) ), 5.0 ) ) ).toVar();
		result.assign( vec4( color.mul( 100.0 ), color.r ) );
		result.assign( vec4( color, alpha.mul( color.r ) ) );

		return result;

	} );
	return { uTime, uResolution, rotX, rotY, random, noise, fbm, main };

}
