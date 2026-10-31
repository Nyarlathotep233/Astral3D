// Fixed built-in TSL port of eddfcd4.
import * as TSL from 'three/tsl';
// Three.js Transpiler r186

export default function createNodes(uniforms, inputs = {}) {
 const viewMatrix = TSL.cameraViewMatrix;

	const { reference, mod, Fn, vec4, dot, floor, property, vec2, select, vec3, sub, max, fract, mul, abs, float, uv, Loop, div, mix, normalize, smoothstep, If, clamp, sin } = TSL;

	const vUv = inputs.vUv;
	const vNormal = inputs.vNormal;
	const uTime = reference( 'value', 'float', uniforms[ 'uTime' ] );
	const uResolution = reference( 'value', 'vec2', uniforms[ 'uResolution' ] );
	const uHasTexture = reference( 'value', 'float', uniforms[ 'uHasTexture' ] );
	const uColor = reference( 'value', 'vec4', uniforms[ 'uColor' ] );
	const uTexture = inputs.textures['uTexture'];
	const uNoiseMap = inputs.textures['uNoiseMap'];

	const permute = /*@__PURE__*/ Fn( ( [ x ] ) => {

		return mod( x.mul( 34.0 ).add( 1.0 ).mul( x ), 289.0 );

	} );

	const snoise = /*@__PURE__*/ Fn( ( [ v ] ) => {

		const C = vec4( 0.211324865405187, 0.366025403784439, - 0.577350269189626, 0.024390243902439 ).toVar();
		const i = floor( v.add( dot( v, C.yy ) ) ).toVar();
		const x0 = v.sub( i ).add( dot( i, C.xx ) ).toVar();
		const i1 = property( 'vec2' ).toVar();
		i1.assign( select( x0.x.greaterThan( x0.y ), vec2( 1.0, 0.0 ), vec2( 0.0, 1.0 ) ) );
		const x12 = x0.xyxy.add( C.xxzz ).toVar();
		x12.xy.subAssign( i1 );
		i.assign( mod( i, 289.0 ) );
		const p = permute( permute( i.y.add( vec3( 0.0, i1.y, 1.0 ) ) ).add( i.x ).add( vec3( 0.0, i1.x, 1.0 ) ) ).toVar();
		const m = max( sub( 0.5, vec3( dot( x0, x0 ), dot( x12.xy, x12.xy ), dot( x12.zw, x12.zw ) ) ), 0.0 ).toVar();
		m.assign( m.mul( m ) );
		m.assign( m.mul( m ) );
		const x = mul( 2.0, fract( p.mul( C.www ) ) ).sub( 1.0 ).toVar();
		const h = abs( x ).sub( 0.5 ).toVar();
		const ox = floor( x.add( 0.5 ) ).toVar();
		const a0 = x.sub( ox ).toVar();
		m.mulAssign( sub( 1.79284291400159, mul( 0.85373472095314, a0.mul( a0 ).add( h.mul( h ) ) ) ) );
		const g = property( 'vec3' ).toVar();
		g.x.assign( a0.x.mul( x0.x ).add( h.x.mul( x0.y ) ) );
		g.yz.assign( a0.yz.mul( x12.xz ).add( h.yz.mul( x12.yw ) ) );

		return mul( 130.0, dot( m, g ) );

	} );

	const fbm = /*@__PURE__*/ Fn( ( [ uv_immutable, h3damp, h3dmin ] ) => {

		const uv = uv_immutable.toVar();
		const amp = h3damp.toVar();
		const f = float( 0. ).toVar();

		Loop( { start: 0, end: 3, name: 'x' }, () => {

			f.addAssign( snoise( uv.xz ).mul( 0.5 ).add( 0.5 ).mul( .25 ).add( mul( .75, amp ) ) );
			amp.mulAssign( h3damp );
			uv.mulAssign( 2.7 );

		} );

		return max( f, h3dmin );

	} );

	const main = /*@__PURE__*/ Fn( () => {

		const result = vec4( 0.0 ).toVar();
		const uv = vUv.toVar();
		const h3dnoise = fbm( vec3( uv.x.mul( 100. ), 0.0, uv.y.mul( 100. ) ), 0.47, 0.2 ).toVar();
		const norm = vec3( 0.0, 1.0, 0.0 ).toVar();
		const normalDistribution = vec3( div( 1.0, h3dnoise ), h3dnoise, sub( 1.0, h3dnoise ) ).toVar();
		normalDistribution.assign( normalDistribution.mul( 2. ).sub( 1. ) );
		const newnorm = norm.mul( normalDistribution ).toVar();
		newnorm.assign( select( dot( newnorm, norm ).lessThan( 0.0 ), newnorm.negate(), newnorm ) );
		const color = mix( vec3( h3dnoise ), vec3( 0.529411765, 0.8, 1.0 ).mul( vec3( h3dnoise ) ), sub( 1.0, dot( newnorm, vec3( 0.0, 1.0, 0.0 ) ) ) ).toVar();
		const yAxis = normalize( viewMatrix.mul( vec4( 0.0, 1.0, 0.0, 0.0 ) ) ).toVar();
		const snowThickness = smoothstep( 0.5, 1.0, abs( dot( vNormal, yAxis.xyz ) ) ).toVar();

		If( uHasTexture.greaterThan( 0.5 ), () => {

			result.assign( uTexture.sample( uv ) );

		} ).Else( () => {

			result.assign( uColor );

		} );

		snowThickness.mulAssign( sub( 1.0, clamp( uNoiseMap.sample( uv ).r, 0.0, 1.0 - 0.8 ) ) );
		const noiseColor = snowThickness.mul( uTime ).mul( vec4( 1.0, 1.0, 1.0, 1.0 ) ).toVar();

		If( snowThickness.greaterThan( 0.1 ), () => {

			result.assign( mix( noiseColor, result, clamp( fbm( vec3( uv.x.mul( 10. ), 0.0, uv.y.mul( 10. ) ).mul( .5 ).add( .5 ), 0.47, 0.0 ).sub( sin( uTime.mul( .5 ) ) ), 0.0, 1.0 ) ) );

		} ).Else( () => {

			result.addAssign( noiseColor );

		} );

		return result;

	} );
	return { uTime, uResolution, uHasTexture, uColor, uTexture, uNoiseMap, permute, snoise, fbm, main };

}
