// Fixed built-in TSL port of eddfcd4; no runtime GLSL translation.
import * as TSL from 'three/tsl';
// Three.js Transpiler r186

export default function createNodes(uniforms, inputs = {}) {
 const viewMatrix = TSL.cameraViewMatrix;
 const gl_FragCoord = TSL.vec4(TSL.screenCoordinate.x, TSL.screenSize.y.sub(TSL.screenCoordinate.y), 0, 1);

	const { reference, int, sub, Fn, sqrt, vec2, dot, sin, fract, abs, pow, If, atan, cos, select, float, struct, floor, div, Loop, property, clamp, mod, min, max, vec4 } = TSL;

	const tDiffuse = inputs.texture;
	const radius = reference( 'value', 'float', uniforms[ 'radius' ] );
	const rotateR = reference( 'value', 'float', uniforms[ 'rotateR' ] );
	const rotateG = reference( 'value', 'float', uniforms[ 'rotateG' ] );
	const rotateB = reference( 'value', 'float', uniforms[ 'rotateB' ] );
	const scatter = reference( 'value', 'float', uniforms[ 'scatter' ] );
	const width = reference( 'value', 'float', uniforms[ 'width' ] );
	const height = reference( 'value', 'float', uniforms[ 'height' ] );
	const shape = reference( 'value', 'int', uniforms[ 'shape' ] );
	const disable = reference( 'value', 'bool', uniforms[ 'disable' ] );
	const blending = reference( 'value', 'float', uniforms[ 'blending' ] );
	const blendingMode = reference( 'value', 'int', uniforms[ 'blendingMode' ] );
	const vUV = inputs.vUV;
	const greyscale = reference( 'value', 'bool', uniforms[ 'greyscale' ] );
	const samples = int( 8 ).toVar();

	const blend = /*@__PURE__*/ Fn( ( [ a, b, t ] ) => {

		// linear blend


		return a.mul( sub( 1.0, t ) ).add( b.mul( t ) );

	} );

	const hypot = /*@__PURE__*/ Fn( ( [ x, y ] ) => {

		// vector magnitude


		return sqrt( x.mul( x ).add( y.mul( y ) ) );

	} );

	const rand = /*@__PURE__*/ Fn( ( [ seed ] ) => {

		// get pseudo-random number


		return fract( sin( dot( seed.xy, vec2( 12.9898, 78.233 ) ) ).mul( 43758.5453 ) );

	} );

	const distanceToDotRadius = /*@__PURE__*/ Fn( ( [ channel, coord, normal, p, angle, rad_max ] ) => {

		// apply shape-specific transforms

		const dist = hypot( coord.x.sub( p.x ), coord.y.sub( p.y ) ).toVar();
		const rad = channel.toVar();

		If( shape.equal( 1 ), () => {

			rad.assign( pow( abs( rad ), 1.125 ).mul( rad_max ) );

		} ).ElseIf( shape.equal( 2 ), () => {

			rad.assign( pow( abs( rad ), 1.125 ).mul( rad_max ) );

			If( dist.notEqual( 0.0 ), () => {

				const dot_p = abs( p.x.sub( coord.x ).div( dist ).mul( normal.x ).add( p.y.sub( coord.y ).div( dist ).mul( normal.y ) ) ).toVar();
				dist.assign( dist.mul( 1.0 - 0.20710678 ).add( dot_p.mul( dist ).mul( 0.41421356 ) ) );

			} );

		} ).ElseIf( shape.equal( 3 ), () => {

			rad.assign( pow( abs( rad ), 1.5 ).mul( rad_max ) );
			const dot_p = p.x.sub( coord.x ).mul( normal.x ).add( p.y.sub( coord.y ).mul( normal.y ) ).toVar();
			dist.assign( hypot( normal.x.mul( dot_p ), normal.y.mul( dot_p ) ) );

		} ).ElseIf( shape.equal( 4 ), () => {

			const theta = atan( p.y.sub( coord.y ), p.x.sub( coord.x ) ).sub( angle ).toVar();
			const sin_t = abs( sin( theta ) ).toVar();
			const cos_t = abs( cos( theta ) ).toVar();
			rad.assign( pow( abs( rad ), 1.4 ) );
			rad.assign( rad_max.mul( rad.add( select( sin_t.greaterThan( cos_t ), rad.sub( sin_t.mul( rad ) ), rad.sub( cos_t.mul( rad ) ) ) ) ) );

		} ).ElseIf( shape.equal( 5 ), () => {

			const angle45 = float( 3.14159265 / 4.0 ).toVar();
			const theta = atan( p.y.sub( coord.y ), p.x.sub( coord.x ) ).sub( angle ).sub( angle45 ).toVar();
			const sin_t = abs( sin( theta ) ).toVar();
			const cos_t = abs( cos( theta ) ).toVar();
			rad.assign( pow( abs( rad ), 1.4 ) );
			rad.assign( rad_max.mul( rad.add( select( sin_t.greaterThan( cos_t ), rad.sub( sin_t.mul( rad ) ), rad.sub( cos_t.mul( rad ) ) ) ) ) );

		} );

		return rad.sub( dist );

	} );

	const Cell = struct( {
		normal: 'vec2',
		p1: 'vec2',
		p2: 'vec2',
		p3: 'vec2',
		p4: 'vec2',
		samp2: 'float',
		samp1: 'float',
		samp3: 'float',
		samp4: 'float'
	}, 'Cell' );

	const getSample = /*@__PURE__*/ Fn( ( [ point ] ) => {

		// multi-sampled point

		const tex = tDiffuse.sample( vec2( point.x.div( width ), point.y.div( height ) ) ).toVar();
		const base = rand( vec2( floor( point.x ), floor( point.y ) ) ).mul( 6.28318531 ).toVar();
		const step = div( 6.28318531, float( samples ) ).toVar();
		const dist = radius.mul( 0.66 ).toVar();

		Loop( samples, ( { i } ) => {

			const r = base.add( step.mul( float( i ) ) ).toVar();
			const coord = point.add( vec2( cos( r ).mul( dist ), sin( r ).mul( dist ) ) ).toVar();
			tex.addAssign( tDiffuse.sample( vec2( coord.x.div( width ), coord.y.div( height ) ) ) );

		} );

		tex.divAssign( float( samples ).add( 1.0 ) );

		return tex;

	} );

	const getDotColour = /*@__PURE__*/ Fn( ( [ c, p, channel, angle, aa ] ) => {

		// get colour for given point

		const dist_c_1 = property( 'float' ), dist_c_2 = property( 'float' ), dist_c_3 = property( 'float' ), dist_c_4 = property( 'float' ), res = property( 'float' ).toVar().toVar().toVar().toVar().toVar();

		If( channel.equal( 0 ), () => {

			c.get('samp1').assign( getSample( c.get('p1') ).r );
			c.get('samp2').assign( getSample( c.get('p2') ).r );
			c.get('samp3').assign( getSample( c.get('p3') ).r );
			c.get('samp4').assign( getSample( c.get('p4') ).r );

		} ).ElseIf( channel.equal( 1 ), () => {

			c.get('samp1').assign( getSample( c.get('p1') ).g );
			c.get('samp2').assign( getSample( c.get('p2') ).g );
			c.get('samp3').assign( getSample( c.get('p3') ).g );
			c.get('samp4').assign( getSample( c.get('p4') ).g );

		} ).Else( () => {

			c.get('samp1').assign( getSample( c.get('p1') ).b );
			c.get('samp3').assign( getSample( c.get('p3') ).b );
			c.get('samp2').assign( getSample( c.get('p2') ).b );
			c.get('samp4').assign( getSample( c.get('p4') ).b );

		} );

		dist_c_1.assign( distanceToDotRadius( c.get('samp1'), c.get('p1'), c.get('normal'), p, angle, radius ) );
		dist_c_2.assign( distanceToDotRadius( c.get('samp2'), c.get('p2'), c.get('normal'), p, angle, radius ) );
		dist_c_3.assign( distanceToDotRadius( c.get('samp3'), c.get('p3'), c.get('normal'), p, angle, radius ) );
		dist_c_4.assign( distanceToDotRadius( c.get('samp4'), c.get('p4'), c.get('normal'), p, angle, radius ) );
		res.assign( select( dist_c_1.greaterThan( 0.0 ), clamp( dist_c_1.div( aa ), 0.0, 1.0 ), 0.0 ) );
		res.addAssign( select( dist_c_2.greaterThan( 0.0 ), clamp( dist_c_2.div( aa ), 0.0, 1.0 ), 0.0 ) );
		res.addAssign( select( dist_c_3.greaterThan( 0.0 ), clamp( dist_c_3.div( aa ), 0.0, 1.0 ), 0.0 ) );
		res.addAssign( select( dist_c_4.greaterThan( 0.0 ), clamp( dist_c_4.div( aa ), 0.0, 1.0 ), 0.0 ) );
		res.assign( clamp( res, 0.0, 1.0 ) );

		return res;

	} );

	const getReferenceCell = /*@__PURE__*/ Fn( ( [ p, origin, grid_angle, step ] ) => {

		// get containing cell

		const c = Cell().toVar();

		// calc grid

		const n = vec2( cos( grid_angle ), sin( grid_angle ) ).toVar();
		const threshold = step.mul( 0.5 ).toVar();
		const dot_normal = n.x.mul( p.x.sub( origin.x ) ).add( n.y.mul( p.y.sub( origin.y ) ) ).toVar();
		const dot_line = n.y.negate().mul( p.x.sub( origin.x ) ).add( n.x.mul( p.y.sub( origin.y ) ) ).toVar();
		const offset = vec2( n.x.mul( dot_normal ), n.y.mul( dot_normal ) ).toVar();
		const offset_normal = mod( hypot( offset.x, offset.y ), step ).toVar();
		const normal_dir = select( dot_normal.lessThan( 0.0 ), 1.0, - 1.0 ).toVar();
		const normal_scale = select( offset_normal.lessThan( threshold ), offset_normal.negate(), step.sub( offset_normal ) ).mul( normal_dir ).toVar();
		const offset_line = mod( hypot( p.x.sub( offset.x ).sub( origin.x ), p.y.sub( offset.y ).sub( origin.y ) ), step ).toVar();
		const line_dir = select( dot_line.lessThan( 0.0 ), 1.0, - 1.0 ).toVar();
		const line_scale = select( offset_line.lessThan( threshold ), offset_line.negate(), step.sub( offset_line ) ).mul( line_dir ).toVar();

		// get closest corner

		c.get('normal').assign( n );
		c.get('p1').x.assign( p.x.sub( n.x.mul( normal_scale ) ).add( n.y.mul( line_scale ) ) );
		c.get('p1').y.assign( p.y.sub( n.y.mul( normal_scale ) ).sub( n.x.mul( line_scale ) ) );

		// scatter

		If( scatter.notEqual( 0.0 ), () => {

			const off_mag = scatter.mul( threshold ).mul( 0.5 ).toVar();
			const off_angle = rand( vec2( floor( c.get('p1').x ), floor( c.get('p1').y ) ) ).mul( 6.28318531 ).toVar();
			c.get('p1').x.addAssign( cos( off_angle ).mul( off_mag ) );
			c.get('p1').y.addAssign( sin( off_angle ).mul( off_mag ) );

		} );

		// find corners

		const normal_step = normal_dir.mul( select( offset_normal.lessThan( threshold ), step, step.negate() ) ).toVar();
		const line_step = line_dir.mul( select( offset_line.lessThan( threshold ), step, step.negate() ) ).toVar();
		c.get('p2').x.assign( c.get('p1').x.sub( n.x.mul( normal_step ) ) );
		c.get('p2').y.assign( c.get('p1').y.sub( n.y.mul( normal_step ) ) );
		c.get('p3').x.assign( c.get('p1').x.add( n.y.mul( line_step ) ) );
		c.get('p3').y.assign( c.get('p1').y.sub( n.x.mul( line_step ) ) );
		c.get('p4').x.assign( c.get('p1').x.sub( n.x.mul( normal_step ) ).add( n.y.mul( line_step ) ) );
		c.get('p4').y.assign( c.get('p1').y.sub( n.y.mul( normal_step ) ).sub( n.x.mul( line_step ) ) );

		return c;

	} );

    const blendColour = Fn(([a, b, t]) => {
        const result = blend(a, b, sub(1, t)).toVar();
        If(blendingMode.equal(3), () => { result.assign(blend(a, min(1, a.add(b)), t)); })
            .ElseIf(blendingMode.equal(2), () => { result.assign(blend(a, max(0, a.mul(b)), t)); })
            .ElseIf(blendingMode.equal(4), () => { result.assign(blend(a, max(a, b), t)); })
            .ElseIf(blendingMode.equal(5), () => { result.assign(blend(a, min(a, b), t)); });
        return result;
    });

	const main = /*@__PURE__*/ Fn( () => {

		const result = vec4( 0.0 ).toVar();

		If( disable.not(), () => {

			// setup

			const p = vec2( vUV.x.mul( width ), vUV.y.mul( height ) ).toVar();
			const origin = vec2( 0, 0 ).toVar();
			const aa = select( radius.lessThan( 2.5 ), radius.mul( 0.5 ), 1.25 ).toVar();

			// get channel samples

			const cell_r = getReferenceCell( p, origin, rotateR, radius ).toVar();
			const cell_g = getReferenceCell( p, origin, rotateG, radius ).toVar();
			const cell_b = getReferenceCell( p, origin, rotateB, radius ).toVar();
			const r = getDotColour( cell_r, p, 0, rotateR, aa ).toVar();
			const g = getDotColour( cell_g, p, 1, rotateG, aa ).toVar();
			const b = getDotColour( cell_b, p, 2, rotateB, aa ).toVar();

			// blend with original

			const colour = tDiffuse.sample( vUV ).toVar();
			r.assign( blendColour( r, colour.r, blending ) );
			g.assign( blendColour( g, colour.g, blending ) );
			b.assign( blendColour( b, colour.b, blending ) );

			If( greyscale, () => {

				r.assign( g.assign( b.assign( r.add( b ).add( g ).div( 3.0 ) ) ) );

			} );

			result.assign( vec4( r, g, b, 1.0 ) );

		} ).Else( () => {

			result.assign( tDiffuse.sample( vUV ) );

		} );

		return result;

	} );
	return { tDiffuse, radius, rotateR, rotateG, rotateB, scatter, width, height, shape, disable, blending, blendingMode, greyscale, blend, hypot, rand, distanceToDotRadius, getSample, getDotColour, getReferenceCell, blendColour, main };

}
