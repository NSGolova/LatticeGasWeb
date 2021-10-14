const drawingShader = `#version 300 es
  #ifdef GL_ES
  precision highp float;
  #endif

  uniform highp usampler2D state;

  uniform vec2 scale;
  uniform vec2 size;

  uniform vec2 camera;
  uniform vec2 resolution;
  uniform float zoom;

  out vec4 fragColor;

  const uint Nothing = 0u, E=1u, SE=2u, SW=4u, W=8u, NW=16u, NE=32u, REST=64u, BOUNDARY=128u;

  vec3 hsv2rgb(vec3 c) {
      vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  vec4 vectorAngleColor(vec2 v) {
      float angle = 0.5 + atan(v.y, v.x);
      return vec4(hsv2rgb(vec3(angle, 1.0, 1.0)), 1.0);
  }

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

  //   |2|1|
  // |3|*|0|
  //   |4|5|
  ivec2 oddNbors[6] = ivec2[6](ivec2(1, 0), ivec2(1, 1), ivec2(0, 1), ivec2(-1, 0), ivec2(0, -1), ivec2(1, -1));
  // |2|1|
  // |3|*|0|
  // |4|5|
  ivec2 evenNbors[6] = ivec2[6](ivec2(1, 0), ivec2(0, 1), ivec2(-1, 1), ivec2(-1, 0), ivec2(-1, -1), ivec2(0, -1));

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
          vec2 velocity = vec2(0.0, 0.0);
          for (uint i = 0u; i < 6u; i++) {
            if ((prtcl & (1u << i)) != 0u) {
              velocity += ci[i];
            }
          }
          angleColor = vectorAngleColor(velocity);
      }
    }

    return angleColor;
  }

  void main() {
      vec2 npos = (((gl_FragCoord.xy - resolution * 0.5) / scale) / zoom - camera / scale * vec2(1.0, -1.0)) * size * 2.0;
      npos += size * 0.5;
      ivec2 pos;
      // if (zoom < 0.3) {
      //   pos = ivec2(npos / 2.0).yx;
      // } else {
        pos = ivec2(nearestHexCell(npos) / 2.0);
      // }

      vec4 angleColor;

      // int smoot = int(0.5 / zoom);
      // for (int xx = pos.x - smoot; xx < pos.x + smoot; xx++) {
      //   for (int yy = pos.y - smoot; yy < pos.y + smoot; yy++) {
      //     angleColor += colorAt(ivec2(xx, yy));
      //   }
      // }
      // angleColor = angleColor / float(smoot*2*smoot*2);


      angleColor += colorAt(pos);
      fragColor = angleColor;
  }
`;
