const quadShader = `#version 300 es
  #ifdef GL_ES
  precision highp float;
  #endif

  in vec4 quad;

  void main() {
      gl_Position = quad;
  }
`;
const copyShader = `#version 300 es
  #ifdef GL_ES
  precision highp float;
  #endif

  uniform highp isampler2D state;

  uniform vec2 scale;
  uniform vec2 size;

  uniform vec2 camera;
  uniform vec2 resolution;
  uniform float zoom;

  out vec4 fragColor;

  const int Nothing = 0, E=1, SE=2, SW=4, W=8, NW=16, NE=32, REST=64, BOUNDARY=-128;

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
    ivec4 data = texelFetch(state, pos, 0);
    if (data.y == 1) {
      angleColor = vec4(1.0, 1.0, 1.0, 1.0);
    } else {
      int prtcl = data.x;

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
          for (int i = 0; i < 6; i++) {
            if ((prtcl & (1 << i)) != 0) {
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

const collisionShader = `#version 300 es
  #ifdef GL_ES
  precision highp float;
  #endif

  uniform highp isampler2D state;
  uniform vec2 scale;
  uniform int colissionMap[129];
  uniform vec3 tool;
  uniform int shape;
  uniform int operation;
  uniform int toolInUse;
  out ivec4 fragColor;

  const int Nothing = 0, E=1, SE=2, SW=4, W=8, NW=16, NE=32, REST=64, BOUNDARY=-128;
  const int collision = 0, initializeRandom = 1, initializeWind = 2, resize = 3, clear = 4;
  const int circleShape = 0, squareShape = 1;
  const int fanTool = 0, wallTool = 1, nothingTool = 2, clearTool = 128;

  // square root of 3 over 2
  const float hex_factor = 0.8660254037844386;

  int xorshift(in int value) {
    // Xorshift*32
    // Based on George Marsaglia's work: http://www.jstatsoft.org/v08/i14/paper
    value ^= value << 13;
    value ^= value >> 17;
    value ^= value << 5;
    return value;
  }

  int decodeColor(ivec4 v) {
      return v.x << 24 | v.y << 16 | v.z << 8 | v.w;
  }

  ivec4 encodeColor(int c) {
    return ivec4((c >> 24) & 0xff,
          (c >> 16) & 0xff,
          (c >> 8) & 0xff,
          c & 0xff);
  }

  int periodicCoordinatePart(int k, int maxk) {
      if (k < 0) {
          return k + maxk;
      } else if (k == (maxk - 1)) {
          return 0;
      } else {
          return k;
      }
  }

  ivec2 periodicCoordinate(ivec2 k, ivec2 maxK) {
    return ivec2(periodicCoordinatePart(k.x, maxK.x), periodicCoordinatePart(k.y, maxK.y));
  }

  //   |2|1|
  // |3|*|0|
  //   |4|5|
  ivec2 oddNbors[6] = ivec2[6](ivec2(1, 0), ivec2(1, 1), ivec2(0, 1), ivec2(-1, 0), ivec2(0, -1), ivec2(1, -1));
  // |2|1|
  // |3|*|0|
  // |4|5|
  ivec2 evenNbors[6] = ivec2[6](ivec2(1, 0), ivec2(0, 1), ivec2(-1, 1), ivec2(-1, 0), ivec2(-1, -1), ivec2(0, -1));

  void calcCollision(inout ivec4 data, ivec2 position) {
    int prtcl = data.x;
    if (prtcl == BOUNDARY) { return; }
    int result = prtcl & REST;
    ivec2 nbors[6];
    if (position.y % 2 == 0) { nbors = evenNbors; } else { nbors = oddNbors; }
    for (int dir = 0, odir = 3; dir < 6; dir++, odir = (odir + 1) % 6) {
      ivec2 nborPosition = periodicCoordinate(position + nbors[odir], ivec2(scale));
      int nbor = texelFetch(state, nborPosition, 0).x;
      if (nbor != BOUNDARY) {
        // accept an inbound particle travelling in this direction, if there is one
        result |= nbor & (1 << dir);
      } else if ((prtcl & (1 << odir)) != 0) {
        // or if the neighbor is a boundary then reverse one of our own particles
        result |= 1 << dir;
      }
    }
    data.x = colissionMap[result];
  }

  void generateRandom(inout ivec4 data, ivec2 position) {
    int random = xorshift(position.x * position.y) % 128;
    if ((random & BOUNDARY) != BOUNDARY) {
      data.x = random;
    }
  }

  void generateWind(inout ivec4 data, ivec2 position) {
    vec2 pos = vec2(position);
    if (pos.x < scale.x * 0.02 || pos.x > scale.x * 0.98 ||
        (pos.y < scale.y * 0.32 && pos.y > scale.y * 0.3 && pos.x < scale.x * 0.7 && pos.x > scale.x * 0.3)) {
        data.x = BOUNDARY;
    } else if (pos.y > scale.y * 0.33) {
        int random = xorshift(position.x * position.y) % 128;
        if ((random & E) == E) {
          data.x = random;
        }
    }
  }

  bool pointIsInTool(vec2 pos) {
    switch (shape) {
      case circleShape:
        // checking the equation of
        // ellipse with the given point
        float p = (pow((pos.x - tool.y), 2.0) / pow(tool.z * hex_factor, 2.0))
              + (pow((pos.y - tool.x), 2.0) / pow(tool.z, 2.0));
        return p <= 1.0;
        break;
      case squareShape:

        bool xx = (pos.x >= tool.y - tool.z * hex_factor) && (pos.x < tool.y + tool.z * hex_factor);
        bool yy = (pos.y >= tool.x - tool.z) && (pos.y < tool.x + tool.z);
        return xx && yy;
        break;
    }
  }

  void showTool(inout ivec4 data, vec2 pos) {
    if (pointIsInTool(pos)) {
      data.y = 1;
    } else {
      data.y = 0;
    }
  }

  void applyTool(inout ivec4 data, vec2 pos, int tool) {
    if (pointIsInTool(pos)) {
      switch (tool) {
        case wallTool:
          data.x = BOUNDARY;
          break;
        case clearTool:
          data.x = Nothing;
          break;
        case fanTool:
          generateRandom(data, ivec2(pos));
          break;
      }
    }
    data.y = 0;
  }

  void main() {
    vec2 pos = gl_FragCoord.xy;
    ivec2 position = ivec2(gl_FragCoord.xy);
    ivec4 data = texelFetch(state, position, 0);

    switch (operation) {
      case collision:
        calcCollision(data, position);
        break;
      case initializeRandom:
        generateRandom(data, position);
        break;
      case initializeWind:
        generateWind(data, position);
        break;
      case clear:
        data.x = Nothing;
        break;
    }

    if (toolInUse == nothingTool) {
      showTool(data, pos);
    } else {
      applyTool(data, pos, toolInUse);
    }

    fragColor = data;
  }
`;
