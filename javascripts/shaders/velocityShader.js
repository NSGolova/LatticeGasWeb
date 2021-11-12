const velocityShader = `#version 300 es
  #ifdef GL_ES
  precision highp float;
  #endif

  uniform highp usampler2D state;

  uniform float scale;

  out vec4 fragColor;

  // square root of 3 over 2
  const float hex_factor = 0.8660254037844386;

  vec2 ci[6] = vec2[6](
    vec2(1., 0.),
    vec2(0.5, hex_factor),
    vec2(-0.5, hex_factor),
    vec2(-1., 0.),
    vec2(-0.5, -hex_factor),
    vec2(0.5, -hex_factor));

  void main() {
      vec2 pos = gl_FragCoord.xy;
      pos *= scale;
      pos -= scale / 2.0;

      vec2 result = vec2(0.0, 0.0);
      uint prtcl = 0u;

      for (float i = 0.0; i < scale; i += 1.0) {
        for (float j = 0.0; j < scale; j += 1.0) {
          prtcl = texelFetch(state, ivec2(pos.x + i, pos.y + j), 0).w;
          for (uint i = 0u; i < 6u; i++) {
            if ((prtcl & (1u << i)) != 0u) {
              result += ci[i];
            }
          }
        }
      }
      fragColor = vec4((result / scale) / sqrt(scale), 0.0, 0.0);
  }
`;
