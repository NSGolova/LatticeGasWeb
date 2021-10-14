const quadShader = `#version 300 es
  #ifdef GL_ES
  precision highp float;
  #endif

  in vec4 quad;

  void main() {
      gl_Position = quad;
  }
`;
