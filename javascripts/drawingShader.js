const drawingShader = `#version 300 es
  #ifdef GL_ES
  precision highp float;
  #endif

  uniform highp usampler2D state;
  uniform highp sampler2D velocityMap;

  uniform vec2 scale;
  uniform vec2 size;

  uniform vec2 camera;
  uniform vec2 resolution;
  uniform float zoom;

  uniform float velocityScale;
  uniform int showVelocity;

  out vec4 fragColor;

  const uint Nothing = 0u, E=1u, SE=2u, SW=4u, W=8u, NW=16u, NE=32u, REST=64u, BOUNDARY=128u;

  // square root of 3 over 2
  const float hex_factor = 0.8660254037844386;

  vec2 ci[6] = vec2[6](
    vec2(1., 0.),
    vec2(0.5, hex_factor),
    vec2(-0.5, hex_factor),
    vec2(-1., 0.),
    vec2(-0.5, -hex_factor),
    vec2(0.5, -hex_factor));

  #define HEX_FROM_CART(p) vec2(p.x / hex_factor, p.y)
  #define CART_FROM_HEX(g) vec2(g.x * hex_factor, g.y)

  //////////////////////////////////////////////////////////////////////
  // Given a 2D position, find integer coordinates of center of nearest
  // hexagon in plane.

  vec2 nearestHexCell(in vec2 pos) {

      // integer coords in hex center grid -- will need to be adjusted
      vec2 gpos = HEX_FROM_CART(pos);
      vec2 hex_int = floor(gpos);

      // adjust integer coords
      float sy = step(2.0, mod(hex_int.x+1.0, 4.0));
      hex_int += mod(vec2(hex_int.x, hex_int.y + sy), 2.0);

      // difference vector
      vec2 gdiff = gpos - hex_int;

      // figure out which side of line we are on and modify
      // hex center if necessary
      if (dot(abs(gdiff), vec2(hex_factor*hex_factor, 0.5)) > 1.0) {
          vec2 delta = sign(gdiff) * vec2(2.0, 1.0);
          hex_int += delta;
      }

      return vec2(hex_int.y, hex_int.x);
  }

  vec3 hsv2rgb(vec3 c) {
      vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  vec4 vectorAngleColor(vec2 v) {
      float angle = 0.5 + atan(v.y, v.x);
      return vec4(hsv2rgb(vec3(angle, 1.0, 1.0)), 1.0);
  }

  vec2 velocityFromParticle(uint prtc) {
    vec2 velocity = vec2(0.0, 0.0);
    for (uint i = 0u; i < 6u; i++) {
      if ((prtc & (1u << i)) != 0u) {
        velocity += ci[i];
      }
    }
    return velocity;
  }

  vec4 colorAt(ivec2 pos) {
    vec4 angleColor;
    uvec4 data = texelFetch(state, pos, 0);
    if (data.y == 1u) {
      angleColor = vec4(1.0, 1.0, 1.0, 1.0);
    } else {
      uint prtcl = data.x;

      switch (prtcl) {
        case Nothing:
          angleColor = vec4(0.0, 0.0, 0.0, 1.0);
          break;
        case BOUNDARY:
          angleColor = vec4(0.9, 0.9, 0.9, 1.0);
          break;
        case REST:
          angleColor = vec4(0.6, 0.6, 0.6, 1.0);
          break;
        default:
          angleColor = vectorAngleColor(velocityFromParticle(prtcl));
      }
    }

    return angleColor;
  }

  // Based on https://www.shadertoy.com/view/4s23DG
  // 2D vector field visualization by Morgan McGuire, @morgan3d
  const float PI = 3.1415927;
  const int   ARROW_V_STYLE = 1;
  const int   ARROW_LINE_STYLE = 2;

  // Choose your arrow head style
  const int   ARROW_STYLE = ARROW_LINE_STYLE;

  // How sharp should the arrow head be? Used
  const float ARROW_HEAD_ANGLE = 45.0 * PI / 180.0;

  float arrowTileSize() {
    return ((velocityScale) / size.x) * zoom * scale.x;
  }

  // v = field sampled at tileCenterCoord(p), scaled by the length
  // desired in pixels for arrows
  // Returns 1.0 where there is an arrow pixel.
  float arrow(vec2 p, vec2 v, vec2 center) {

    float arrowSize = arrowTileSize();
    float arrowHeadLength = arrowSize / 6.0;
    float arrowShaftThickness = 2.0;

    // Make everything relative to the center, which may be fractional
    p -= p + (center.yx / velocityScale) * (arrowSize);

    v *= arrowHeadLength;

    float mag_v = length(v), mag_p = length(p);

  	if (mag_v > 0.0) {
  		// Non-zero velocity case
  		vec2 dir_p = p / mag_p, dir_v = v / mag_v;

  		// We can't draw arrows larger than the tile radius, so clamp magnitude.
  		// Enforce a minimum length to help see direction
  		mag_v = clamp(mag_v, 5.0, arrowSize / 2.0);

  		// Arrow tip location
  		v = dir_v * mag_v;

  		// Define a 2D implicit surface so that the arrow is antialiased.
  		// In each line, the left expression defines a shape and the right controls
  		// how quickly it fades in or out.

  		float dist;
  		if (ARROW_STYLE == ARROW_LINE_STYLE) {
  			// Signed distance from a line segment based on https://www.shadertoy.com/view/ls2GWG by
  			// Matthias Reitinger, @mreitinger

  			// Line arrow style
  			dist =
  				max(
  					// Shaft
  					arrowShaftThickness / 4.0 -
  						max(abs(dot(p, vec2(dir_v.y, -dir_v.x))), // Width
  						    abs(dot(p, dir_v)) - mag_v + arrowHeadLength / 2.0), // Length

     			         // Arrow head
  					 min(0.0, dot(v - p, dir_v) - cos(ARROW_HEAD_ANGLE / 2.0) * length(v - p)) * 2.0 + // Front sides
  					 min(0.0, dot(p, dir_v) + arrowHeadLength - mag_v)); // Back
  		} else {
  			// V arrow style
  			dist = min(0.0, mag_v - mag_p) * 2.0 + // length
  				   min(0.0, dot(normalize(v - p), dir_v) - cos(ARROW_HEAD_ANGLE / 2.0)) * 2.0 * length(v - p) + // head sides
  				   min(0.0, dot(p, dir_v) + 1.0) + // head back
  				   min(0.0, cos(ARROW_HEAD_ANGLE / 2.0) - dot(normalize(v * 0.33 - p), dir_v)) * mag_v * 0.8; // cutout
  		}

  		return clamp(1.0 + dist, 0.0, 1.0);
  	} else {
  		// Center of the pixel is always on the arrow
  		return max(0.0, 1.2 - mag_p);
  	}
  }

  void main() {
      vec2 npos = (((gl_FragCoord.xy - resolution * 0.5) / scale) / zoom - camera / scale * vec2(1.0, -1.0)) * size * 2.0;
      npos += size * 0.5;

      vec2 sqrPos = vec2(npos / 2.0).yx;
      sqrPos.y /= hex_factor;

      if ((sqrPos.x < 0.0 && sqrPos.y < 0.0)
      || (sqrPos.x > size.x && sqrPos.y > size.y)) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }

      ivec2 pos;
      if (zoom < 0.3) {
        pos = ivec2(sqrPos);
      } else {
        vec2 hexPos = nearestHexCell(npos) / 2.0;
        pos = ivec2(hexPos);
      }

      vec4 angleColor;

      angleColor += colorAt(pos);

      if (showVelocity == 0) {
        fragColor = angleColor;
        return;
      }

      ivec2 iPos = ivec2(sqrPos / velocityScale);
      vec2 centerOffset = vec2(velocityScale, velocityScale) / 2.0 - (sqrPos - vec2(iPos) * velocityScale);
      vec2 average = texelFetch(velocityMap, iPos, 0).yx * vec2(-1.0, -1.0);

      if (arrow(gl_FragCoord.xy, average, centerOffset) >= 0.9) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
      } else {
        fragColor = angleColor;
      }

  }
`;
