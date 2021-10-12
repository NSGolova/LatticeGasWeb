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

const collisionShader = `#version 300 es
  #ifdef GL_ES
  precision highp float;
  #endif

  uniform highp usampler2D state;
  uniform highp usampler2D imageToApply;
  uniform vec2 scale;
  uniform vec2 oldSize;
  uniform uint colissionMap[129];
  uniform vec3 tool;
  uniform int shape;
  uniform int operation;
  uniform int toolInUse;
  out uvec4 fragColor;

  const uint Nothing = 0u, E=1u, SE=2u, SW=4u, W=8u, NW=16u, NE=32u, REST=64u, BOUNDARY=128u;
  const int collision = 0, initializeRandom = 1, initializeWind = 2, resize = 3, clear = 4, applyImage = 5;
  const int circleShape = 0, squareShape = 1;
  const int fanTool = 0, wallTool = 1, nothingTool = 2, clearTool = 128;

  // square root of 3 over 2
  const float hex_factor = 0.8660254037844386;

  uint xorshift(in uint value) {
    // Xorshift*32
    // Based on George Marsaglia's work: http://www.jstatsoft.org/v08/i14/paper
    value ^= value << 13u;
    value ^= value >> 17u;
    value ^= value << 5u;
    return value;
  }

  uint decodeColor(uvec4 v) {
      return v.x << 24u | v.y << 16u | v.z << 8u | v.w;
  }

  uvec4 encodeColor(uint c) {
    return uvec4((c >> 24u) & 0xffu,
          (c >> 16u) & 0xffu,
          (c >> 8u) & 0xffu,
          c & 0xffu);
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

  void calcCollision(inout uvec4 data, ivec2 position) {
    uint prtcl = data.x;

    if (prtcl == BOUNDARY) { return; }

    uint result = prtcl & REST;
    ivec2 nbors[6];
    if (position.y % 2 == 0) {
      nbors = evenNbors;
    } else {
      nbors = oddNbors;
    }

    for (uint dir = 0u, odir = 3u; dir < 6u; dir++, odir = (odir + 1u) % 6u) {
      ivec2 nborPosition = periodicCoordinate(position + nbors[odir], ivec2(scale));
      uint nbor = texelFetch(state, nborPosition, 0).x;
      if (nbor != BOUNDARY) {
        // accept an inbound particle travelling in this direction, if there is one
        result |= nbor & (1u << dir);
      } else if ((prtcl & (1u << odir)) != 0u) {
        // or if the neighbor is a boundary then reverse one of our own particles
        result |= 1u << dir;
      }
    }
    data.x = colissionMap[result];
  }

  uint rand(vec2 co){
    return uint(fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453) * 64.0);
  }

  void generateRandom(inout uvec4 data, ivec2 position) {
    uint random = rand(vec2(position));
    if ((random & BOUNDARY) != BOUNDARY && (random & REST) != REST) {
      data.x = random;
    }
  }

  void generateWind(inout uvec4 data, ivec2 position) {
    vec2 pos = vec2(position);
    if (pos.x < scale.x * 0.02 || pos.x > scale.x * 0.98 ||
        (pos.y < scale.y * 0.82 && pos.y > scale.y * 0.8 && pos.x < scale.x * 0.6 && pos.x > scale.x * 0.4)) {
        data.x = BOUNDARY;
    // } else if (pos.y < scale.y * 0.66 && pos.y > scale.y * 0.33) {
    // } else if (position.x % 2 == 0 && position.y % 2 == 0) {
      // int random = rand(pos);
      //   if (((random & NE) == NE) || ((random & NW) == NW)) {
      //     data.x = NE+NW;
      //   }
    } else {
      data.x = NE+NW + rand(pos);
    }
  }

  void calculateResize(inout uvec4 data, ivec2 position) {
    ivec2 oldStateSize = ivec2(oldSize);
    vec2 pos = vec2(position);

    if (oldStateSize.x >= int(scale.x)) {
      float prtclDiameter = float(oldStateSize.x) / scale.x;
      pos *= prtclDiameter;
      pos -= prtclDiameter / 2.0;
      uint addState = 0u;

      uint denominator = uint(prtclDiameter + 1.0) * uint(prtclDiameter + 1.0);

      for (float i = 0.0; i < prtclDiameter; i += 1.0) {
        for (float j = 0.0; j < prtclDiameter; j += 1.0) {
          addState += texelFetch(state, ivec2(pos.x + i, pos.y + j), 0).x / denominator;
        }
      }

      if (addState > 120u) {
        data.x = 128u;
      } else {
        data.x = addState;
      }

    } else {
      pos /= scale.x / float(oldStateSize.x);
      data.x = texelFetch(state, ivec2(pos), 0).x;
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

  void showTool(inout uvec4 data, vec2 pos) {
    if (pointIsInTool(pos)) {
      data.y = 1u;
    } else {
      data.y = 0u;
    }
  }

  void applyTool(inout uvec4 data, vec2 pos, int tool) {
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
    data.y = 0u;
  }

  void calculateApplyImage(inout uvec4 data, ivec2 position) {
    uvec4 imageData = texelFetch(imageToApply, ivec2(position.y, int(scale.x) - position.x), 0);
    uint sum = imageData.x + imageData.y + imageData.z;
    if (sum < 580u || sum == 0u) {
      data.x = BOUNDARY;
    } else {
      data.x = sum / 6u;
    }
  }

  void main() {
    vec2 pos = gl_FragCoord.xy;
    ivec2 position = ivec2(gl_FragCoord.xy);
    uvec4 data = texelFetch(state, position, 0);
    data.w = 128u;

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
      case resize:
        calculateResize(data, position);
        break;
      case applyImage:
        calculateApplyImage(data, position);
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
