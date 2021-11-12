const computationShader = `#version 300 es
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

  uniform int selectedTool;
  uniform ivec4 toolInUse;
  uniform uint applyImageTreshold;

  out uvec4 fragColor;

  const uint Nothing = 0u, E=1u, SE=2u, SW=4u, W=8u, NW=16u, NE=32u, REST=64u, TOOLM=128u;
  const uint PARTICKLE = 0u, BOUNDARY=1u, GENERATOR=2u, SINK=4u;

  const int collision = 0, initializeRandom = 1, initializeWind = 2, resize = 3, clear = 4, applyImage = 5;

  const int circleShape = 0, squareShape = 1;
  const int brushTool = 0, nothingTool = 1, imageTool = 2, clearTool = 128;
  const int fanBrush = 0, wallBrush = 1, generatorBrush = 2, sinkBrush = 3;

  // square root of 3 over 2
  const float hex_factor = 0.8660254037844386;

  vec2 ci[6] = vec2[6](
    vec2(1., 0.),
    vec2(0.5, hex_factor),
    vec2(-0.5, hex_factor),
    vec2(-1., 0.),
    vec2(-0.5, -hex_factor),
    vec2(0.5, -hex_factor));

  uint xorshift(in uint value) {
    // Xorshift*32
    // Based on George Marsaglia's work: http://www.jstatsoft.org/v08/i14/paper
    value ^= value << 13u;
    value ^= value >> 17u;
    value ^= value << 5u;
    return value;
  }

  vec3 rgb2hsv(vec3 c) {
      vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
      vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
      vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));

      float d = q.x - min(q.w, q.y);
      float e = 1.0e-10;
      return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
  }

  int periodicCoordinatePart(int k, int maxk) {
      if (k < 0) {
          return k + maxk;
      } else if (k == maxk) {
          return 0;
      } else {
          return k;
      }
  }

  ivec2 periodicCoordinate(ivec2 k, ivec2 maxK) {
    return ivec2(periodicCoordinatePart(k.x, maxK.x), periodicCoordinatePart(k.y, maxK.y));
  }

  uint rand(vec2 co){
    return uint(fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453) * 128.0);
  }

  uint approximateImage(vec2 pos){
    vec2 origin = vec2(pos.y, -pos.x);

    origin.x -= tool.x;
    origin.y += tool.y;
    origin.x *= hex_factor;

    origin /= (tool.z / 20.0);

    uvec4 imageData = texelFetch(imageToApply, ivec2(origin), 0);
    vec3 particleColor = rgb2hsv(vec3(imageData.xyz) / 128.0);
    float tangent = particleColor.x;
    // if (tangent < 0.0) {
    //   tangent += 1.0;
    // }
    // tangent = 1.0 - tangent;
    uint result = 0u;
    uint index = uint(tangent * 12.1);
    if (index % 2u == 0u) {
      result |= 1u << (index == 12u ? 0u : index / 2u);
    } else {
      result |= 1u << ((index + 1u) == 12u ? 0u : (index + 1u) / 2u);
      result |= 1u << ((index - 1u) / 2u);
    }

    // uint result = uint(32.0 * tangent);

    return result;
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
    uint prtcl = data.w;
    uint prtclType = data.y;
    ivec2 nbors[6];
    if (position.y % 2 == 0) {
      nbors = evenNbors;
    } else {
      nbors = oddNbors;
    }
    ivec2 iScale = ivec2(scale);

    if (prtclType == PARTICKLE) {
      uint result = prtcl & REST;
      uint penetration = 0u;

      ivec2 nborPosition;
      uvec4 nborVec;
      uint nbor, nborType, nborStrength, nborPenetration;

      for (uint dir = 0u, odir = 3u; dir < 6u; dir++, odir = (odir + 1u) % 6u) {
        nborPosition = periodicCoordinate(position + nbors[odir], iScale);
        nborVec = texelFetch(state, nborPosition, 0);
        nbor = nborVec.w;
        nborType = nborVec.y;

        if (nborType == PARTICKLE) {
          // accept an inbound particle travelling in this direction, if there is one
          result |= nbor & (1u << dir);
        }
        else {
          nborStrength = nborVec.x;
          nborPenetration = nborVec.z;

          // accept an inbound particle penetrating in this direction, if there is one
          result |= nborPenetration & (1u << dir);

          if ((nborType & BOUNDARY) != 0u && ((prtcl & (1u << odir)) != 0u) ) {
            if (((nbor & (1u << dir)) != 0u || nbor == REST) && (nborStrength == 128u || nborStrength > rand(vec2(position)))) {
              // or if the neighbor is a boundary then reverse one of our own particles
              result |= 1u << dir;
            } else {
              penetration |= 1u << odir;
            }
          } else if ((nborType & GENERATOR) != 0u && ((nbor & (1u << dir)) != 0u || nbor == REST)) {
            if (nborStrength == 128u || nborStrength > rand(vec2(position))) {
              // or if the neighbor is a generator then add one particle in same direction
              result |= 1u << dir;
            }
            penetration |= prtcl & (1u << odir);
          } else if ((nborType & SINK) != 0u && ((nbor & (1u << odir)) != 0u || nbor == REST)) {
            if (nborStrength != 128u && nborStrength < rand(vec2(position))) {
              // or if the neighbor is a penetrated sink then add one particle in same direction
              penetration |= prtcl & (1u << odir);
            }
          } else {
            penetration |= prtcl & (1u << odir);
          }
        }
      }
      data.w = colissionMap[result];
      data.z = colissionMap[penetration];
    }
     else {

      uint penetration = 0u;
      uint nbor, nborType, nborStrength, nborPenetration;

      for (uint dir = 0u, odir = 3u; dir < 6u; dir++, odir = (odir + 1u) % 6u) {
        ivec2 nborPosition = periodicCoordinate(position + nbors[odir], iScale);
        uvec4 nborVec = texelFetch(state, nborPosition, 0);
        nbor = nborVec.w;
        nborType = nborVec.y;
        nborPenetration = nborVec.z;
        nborStrength = nborVec.x;

        if (nborType == PARTICKLE) {
          if ((nborPenetration & (1u << dir)) != 0u) {
            if ((penetration & (1u << dir)) == 0u) {
              // If nbor is partickle moving in our direction - we penetrated.
              penetration |= 1u << dir;
            } else {
              // If nbor is partickle moving in our direction - we penetrated.
              penetration |= 1u << odir;
            }
          }
        } else if ((nborPenetration & (1u << dir)) != 0u) {
          if (data.y == BOUNDARY) {
            if (((prtcl & (1u << odir)) != 0u || prtcl == REST) && (data.x == 128u || data.x > rand(vec2(position)))) {
              if ((penetration & (1u << odir)) == 0u) {
                // Reverse penetrated partickle
                penetration |= 1u << odir;
              } else {
                penetration |= 1u << dir;
              }
            } else {
              if ((penetration & (1u << dir)) == 0u) {
                // Penetrated even more
                penetration |= 1u << dir;
              } else {
                penetration |= 1u << odir;
              }
            }
          } else if (data.y == SINK) {
            if (((prtcl & (1u << odir)) == 0u && prtcl != REST) || (data.x != 128u && data.x <= rand(vec2(position)))) {
              // penetrated even more
              penetration |= 1u << dir;
            }
          }
          else if (data.y == GENERATOR) {
            penetration |= 1u << dir;
          }
        }
      }
      data.z = colissionMap[penetration];;
    }
  }

  void generateRandom(inout uvec4 data, ivec2 position) {
    uint random = rand(vec2(position));
    if ((random & REST) != REST) {
      data.w = random;
    }
  }

  void generateWind(inout uvec4 data, ivec2 position) {
    vec2 pos = vec2(position);
    if (pos.x < scale.x * 0.02 || pos.x > scale.x * 0.98 ||
        (pos.y < scale.y * 0.82 && pos.y > scale.y * 0.8 && pos.x < scale.x * 0.6 && pos.x > scale.x * 0.4)) {
        data.x = 128u;
        data.y = BOUNDARY;
        data.w = REST;
    }
    else if (pos.y > scale.y * 0.998) {
      data.x = 10u;
      data.y = GENERATOR;
      data.w = NE+NW;
    }
    else {
      data.w = rand(pos);
    }
  }

  void calculateResize(inout uvec4 data, ivec2 position) {
    ivec2 oldStateSize = ivec2(oldSize);
    vec2 pos = vec2(position);

    if (oldStateSize.x >= int(scale.x)) {
      float prtclDiameter = float(oldStateSize.x) / scale.x;
      pos *= prtclDiameter;
      pos -= prtclDiameter / 2.0;
      uvec4 addState = uvec4(0u, 0u, 0u, 0u);

      uint denominator = uint(prtclDiameter + 1.0) * uint(prtclDiameter + 1.0);

      for (float i = 0.0; i < prtclDiameter; i += 1.0) {
        for (float j = 0.0; j < prtclDiameter; j += 1.0) {
          addState += texelFetch(state, ivec2(pos.x + i, pos.y + j), 0) ;
        }
      }

      data = addState / denominator;
    } else {
      pos /= scale.x / float(oldStateSize.x);
      data = texelFetch(state, ivec2(pos), 0);
    }
  }

  bool pointIsInTool(vec2 pos) {
    if (selectedTool == imageTool) {
      vec2 origin = vec2(pos.y, -pos.x);

      origin.x -= tool.x;
      origin.y += tool.y;
      origin.x *= hex_factor;

      origin /= (tool.z / 20.0);

      uvec4 imageData = texelFetch(imageToApply, ivec2(origin), 0);
      uint sum = imageData.x + imageData.y + imageData.z;
      switch (shape) {
        case circleShape:
          return sum > applyImageTreshold;
          break;
        case squareShape:
          return sum < applyImageTreshold && sum != 0u;
          break;
      }
    } else {
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
  }

  void showTool(inout uvec4 data, vec2 pos) {
    if (pointIsInTool(pos)) {
      data.z |= TOOLM;
    } else {
      data.z &= ~TOOLM;
    }
  }

  void applyImageTool(inout uvec4 data, vec2 pos, ivec4 tool) {
    switch (tool.y) {
      case wallBrush:
        data.x = uint(tool.z);
        data.y = BOUNDARY;
        data.w = uint(tool.w);
        break;
      case generatorBrush:
        data.x = uint(tool.z);
        data.y = GENERATOR;
        data.w = uint(tool.w);
        break;
      case sinkBrush:
        data.x = uint(tool.z);
        data.y = SINK;
        data.w = uint(tool.w);
        break;
      case fanBrush:
        if ((uint(tool.w) & REST) != 0u) {
          data.y = PARTICKLE;
          data.w = approximateImage(pos);
        } else {
          data.y = PARTICKLE;
          data.w = uint(tool.w);
        }
        break;
    }
  }

  void applyBrushTool(inout uvec4 data, vec2 pos, ivec4 tool) {
    switch (tool.y) {
      case wallBrush:
        data.x = uint(tool.z);
        data.y = BOUNDARY;
        data.w = uint(tool.w);
        break;
      case generatorBrush:
        data.x = uint(tool.z);
        data.y = GENERATOR;
        data.w = uint(tool.w);
        break;
      case sinkBrush:
        data.x = uint(tool.z);
        data.y = SINK;
        data.w = uint(tool.w);
        break;
      case fanBrush:
        if ((uint(tool.w) & REST) != 0u) {
          data.w = rand(pos);
        } else {
          data.w = uint(tool.w);
        }
        break;
    }
  }

  void applyTool(inout uvec4 data, vec2 pos, ivec4 tool) {
    if (pointIsInTool(pos)) {
      switch (tool.x) {
        case imageTool:
          applyImageTool(data, pos, tool);
          break;
        case clearTool:
          data.w = Nothing;
          data.y = PARTICKLE;
          break;
        case brushTool:
          applyBrushTool(data, pos, tool);
          break;
      }
    }
    data.z &= ~TOOLM;
  }

  void main() {
    vec2 pos = gl_FragCoord.xy;
    ivec2 position = ivec2(gl_FragCoord.xy);
    uvec4 data = texelFetch(state, position, 0);

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
        data.w = Nothing;
        data.y = PARTICKLE;
        break;
      case resize:
        calculateResize(data, position);
        break;
    }

    if (toolInUse.x == nothingTool) {
      showTool(data, pos);
    } else {
      applyTool(data, pos, toolInUse);
    }

    fragColor = data;
  }
`;
