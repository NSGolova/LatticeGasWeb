var zoom = 0.1;
var camera = [0., 0.];

var sizeMultiply = 10.0;
var resolution, viewsize, statesize;

const OperationType = {
  collision: 0,
  initializeRandom: 1,
  initializeWind: 2,
  resize: 3
};

const GasType = {
  FHPI: 0,
  FHPII: 1,
  FHPIII: 2,
  FHP6: 3
};
var type = GasType.FHPIII;

const ToolType = {
  fan: 0,
  wall: 1,
  clear: 128
};
var tool = ToolType.fan;
var toolRadius = 10;
var toolPosition;

var iterations = -1;
var speed = 5; // ms

var paused = true;
var curDrag;
var prevDrag;

const E=1, SE=2, SW=4, W=8, NW=16, NE=32, REST=64, BOUNDARY=128;
const directionCircle = [NW, SW, W, SE, NE, E];
var collisionRules;

var gl, buffers, programs, framebuffers, textures;

main();

function main() {
  gl = document.querySelector('#glcanvas').getContext('webgl2');

  if (!gl) {
    const text = `
    Unable to initialize WebGL. Your browser or machine may not support it.
    Use Google Chrome for the best experience.
    Check out https://discussions.apple.com/thread/8655829 for Safari.
    `;
    alert(text);
    return;
  }

  const quad = `#version 300 es
    #ifdef GL_ES
    precision highp float;
    #endif

    in vec4 quad;

    void main() {
        gl_Position = quad;
    }
  `;
  const copy = `#version 300 es
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

    vec3 hsv2rgb(vec3 c)
    {
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }

    vec4 vectorAngleColor(vec2 v)
    {
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
        if (zoom < 0.3) {
          pos = ivec2(npos / 2.0).yx;
        } else {
          pos = ivec2(nearestHexCell(npos) / 2.0);
        }

        vec4 angleColor;
        angleColor += colorAt(pos);

        // TODO: add hex grid for the close zoom
        // angleColor -= smoothstep(.49, .5, iso);
        fragColor = angleColor;
    }
  `;

  const col = `#version 300 es
    #ifdef GL_ES
    precision highp float;
    #endif

    uniform highp isampler2D state;
    uniform vec2 scale;
    uniform int colissionMap[129];
    uniform vec3 tool;
    uniform int operation;
    out ivec4 fragColor;

    const int Nothing = 0, E=1, SE=2, SW=4, W=8, NW=16, NE=32, REST=64, BOUNDARY=-128;
    const int collision = 0, initializeRandom = 1, initializeWind = 2, resize = 3;

    int xorshift(in int value) {
      // Xorshift*32
      // Based on George Marsaglia's work: http://www.jstatsoft.org/v08/i14/paper
      value ^= value << 13;
      value ^= value >> 17;
      value ^= value << 5;
      return value;
    }

    int decodeColor (ivec4 v) {
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
      }

      bool xx = (pos.x >= tool.y - tool.z) && (pos.x < tool.y + tool.z);
      bool yy = (pos.y >= tool.x - tool.z) && (pos.y < tool.x + tool.z);
      if (xx && yy) {
        data.y = 1;
      } else {
        data.y = 0;
      }
      fragColor = data;
    }
  `;

  programs = {
    copy: initShaderProgram(gl, quad, copy),
    col: initShaderProgram(gl, quad, col)
  };

  programVars = {
    copy: {
      quad: gl.getAttribLocation(programs.copy, 'quad'),
      state: gl.getUniformLocation(programs.copy, 'state'),
      size: gl.getUniformLocation(programs.copy, 'size'),
      scale: gl.getUniformLocation(programs.copy, 'scale'),
      camera: gl.getUniformLocation(programs.copy, 'camera'),
      zoom: gl.getUniformLocation(programs.copy, 'zoom'),
      resolution: gl.getUniformLocation(programs.copy, 'resolution')
    },
    col: {
      quad: gl.getAttribLocation(programs.col, 'quad'),
      state: gl.getUniformLocation(programs.col, 'state'),
      scale: gl.getUniformLocation(programs.col, 'scale'),
      colissionMap: gl.getUniformLocation(programs.col, 'colissionMap'),
      tool: gl.getUniformLocation(programs.col, 'tool'),
      operation: gl.getUniformLocation(programs.col, 'operation')
    }
  }

  buffers = {
      quad: createArray(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]))
  };

  framebuffers = {
      step: gl.createFramebuffer()
  };

  setupDefault();
  start();

  setupButtons();
  setupEventHandlers();
}

function setupDefault() {
  recalculateTextures();
  initCollisionRules();

  zoom = 100 / statesize[0];
  camera = [-resolution[0] * 2.5, resolution[1] * (3 * resolution[0] / resolution[1])];

  stepRandom();
}

function resize() {
  pause();
  var oldFront = textures.front;
  recalculateTextures();

  textures.front = oldFront;
  step();
  textures.back = createTexture(gl.REPEAT, gl.NEAREST);
  step();
  drawy();
  start();
}

function recalculateTextures() {
  const canvas = document.querySelector('#glcanvas');
  const placeholder = document.querySelector('#placeholder');

  resolution = [placeholder.getBoundingClientRect().width, placeholder.getBoundingClientRect().height];

  canvas.width = resolution[0];
  canvas.height = resolution[1];

  viewsize = new Float32Array([(Math.pow(2, baseLog(2, resolution[0]) + 1) * sizeMultiply) | 0, (Math.pow(2, baseLog(2, resolution[0]) + 1) * sizeMultiply) | 0]);
  statesize = new Float32Array([(viewsize[0] / 16.0) | 0, (viewsize[1] / 16.0) | 0]);

  textures = {
      front: createTexture(gl.REPEAT, gl.NEAREST),
      back: createTexture(gl.REPEAT, gl.NEAREST)
  };
}

function createTexture(wrap, filter, size) {
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    wrap = wrap == null ? gl.CLAMP_TO_EDGE : wrap;
    filter = filter == null ? gl.LINEAR : filter;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);

    gl.bindTexture(gl.TEXTURE_2D, texture);
    if (size) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size[0], size[1],
                        0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8I, statesize[0], statesize[1],
                        0, gl.RGBA_INTEGER, gl.BYTE, null);
    }

    return texture;
}

function createArray(data) {
    var buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return buffer;
}

function set(state) {
    var rgba = new Int8Array(statesize[0] * statesize[1] * 4);
    for (var i = 0; i < statesize[0]; i++) {
      for (var j = 0; j < statesize[1]; j++) {
        var ii = i * statesize[0] + j;
        for (var d = 0; d < 4; d++) {
          rgba[ii * 4 + d] = state[i][j][d];
        }
      }
    }

    gl.bindTexture(gl.TEXTURE_2D, textures.front);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0,
                     statesize[0], statesize[1],
                     gl.RGBA_INTEGER, gl.BYTE, rgba);
}

function get() {
    var w = statesize[0], h = statesize[1];
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers.step);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
                            gl.TEXTURE_2D, textures.front, 0);
    var rgba = new Int8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA_INTEGER, gl.BYTE, rgba);
    var state = new Array(w);

    for (var i = 0; i < statesize[0]; i++) {
      state[i] = [];
      for (var j = 0; j < statesize[1]; j++) {
        var ii = i * statesize[0] + j;
        state[i][j] = new Int8Array(4);
        for (var d = 0; d < 4; d++) {
          state[i][j][d] = rgba[ii * 4 + d];
        }
      }
    }
    return state;
}

function migrate(oldState) {
  var result = new Array(statesize[0]);

  if (oldState.length > statesize[0]) {
    result = oldState.slice(oldState.length / 2 - statesize[0] / 2, oldState.length / 2 + statesize[0] / 2);
    for (var x = 0; x < statesize[0]; x++) {
      result[x] = result[x].slice(oldState[0].length / 2 - statesize[1] / 2, oldState[0].length / 2 + statesize[1] / 2);
    }
  } else {
    const widthStart = statesize[0] / 2 - oldState.length / 2, widthEnd = oldState.length / 2 + statesize[0] / 2;
    const heigthStart = statesize[1] / 2 - oldState[0].length / 2, heightEnd = oldState[0].length / 2 + statesize[1] / 2;
    for (var i = 0; i < statesize[0]; i++) {
      result[i] = [];
      for (var j = 0; j < statesize[1]; j++) {
        result[i][j] = new Int8Array(4);
        if (i > widthStart && i < widthEnd &&
        j > heigthStart && j < heightEnd) {
          for (var d = 0; d < 4; d++) {
            result[i][j][d] = oldState[i - widthStart][j - heigthStart][d];
          }
        }
      }
    }
  }
  set(result);
  drawy();
}

function initCollisionRules() {
  // We're following:
  // [1] Wylie, 1990:       http://pages.cs.wisc.edu/~wylie/doc/PhD_thesis.pdf
  // [2] Arai et al., 2007: http://www.fz-juelich.de/nic-series/volume38/arai.pdf
  // (see also: [3] Wolf-Gladrow, 2000: http://epic.awi.de/Publications/Wol2000c.pdf)

  // N.B. Interestingly, [2] and [3] seem to miss out several FHP collisions,
  //  e.g. [2] has REST+NE+SE+W and NW+NE+SW+SE in different classes, likewise E+W+REST and NE+SE+W
  //  (also in [2] the last transition in Fig. 6 is misprinted (mass conservation error) and again in
  //   Procedure 3 in Fig. 7)
  //  e.g. [3] misses NE+SE+W <-> E+W+REST

  // A "collision class" [2] is a set of states that can be swapped at will, without
  // affecting the mass or momentum of that node. For best results, a gas should be
  // "collision-saturated" - it swaps everything that can be swapped.

  // these are some possible collision classes to choose from:
  // first four from Fig. 1.6 in [1], for FHP6
  const pair_head_on = [[E+W, NE+SW, NW+SE]]; // i) "linear"
  const symmetric_3 = [[E+NW+SW, W+NE+SE]]; // ii) "triple"
  const two_plus_spectator = [ // iii) "lambda"
      [E+SW+NE, E+SE+NW], [SE+E+W, SE+NE+SW], [SW+E+W, SW+NW+SE],
      [W+NW+SE, W+NE+SW], [NW+E+W, NW+NE+SW], [NE+E+W, NE+NW+SE]];
  const four_particles = [[NE+NW+SE+SW, E+W+SE+NW, E+W+NE+SW]]; // iv) "dual-linear"
  // next ones from Fig. 1.9 in [1], for FHP7
  const pair_head_on_plus_rest = // ii) and iii) "triple" and "linear+rest"
      [[E+W+REST, NE+SW+REST, NW+SE+REST, E+NW+SW, W+NE+SE]];
  const pair_head_on_plus_rest_no_triple = // iii) "linear+rest" (used in FHP-II)
      [[E+W+REST, NE+SW+REST, NW+SE+REST]];
  const one_plus_rest = [ // iv) and v) "fundamental+rest" and "jay"
      [E+REST, SE+NE], [NE+REST, E+NW], [NW+REST, W+NE],
      [W+REST, NW+SW], [SW+REST, W+SE], [SE+REST, SW+E]];
  const two_plus_spectator_including_rest = [ // vi) and (vii) "lambda" and "jay+rest"
      [E+SW+NE, E+SE+NW, NE+SE+REST], [SE+E+W, SE+NE+SW, E+SW+REST],
      [SW+E+W, SW+NW+SE, W+SE+REST], [W+NW+SE, W+NE+SW, NW+SW+REST],
      [NW+E+W, NW+NE+SW, NE+W+REST], [NE+E+W, NE+NW+SE, NW+E+REST]];
  const four_particles_including_rest_no_momentum = // viii) and ix) "dual-linear" and "dual-triple + rest"
      [[NE+NW+SE+SW, E+W+SE+NW, E+W+NE+SW, E+NW+SW+REST, W+NE+SE+REST]];
  const symmetric_3_plus_rest = [[E+NW+SW+REST, W+NE+SE+REST]]; // "dual-triple + rest" (used in FHP-II)
  const four_particles_plus_rest = [[NE+NW+SE+SW+REST, E+W+SE+NW+REST, E+W+NE+SW+REST]]; // x) "dual-linear + rest"
  const five_particles_including_rest_momentum_one = [ // xi) and xii) "dual-fundamental" and "dual-jay + rest"
      [NE+NW+W+SW+SE, E+W+NW+SW+REST], [E+NE+NW+W+SW, NW+SE+NE+W+REST],
      [SE+E+NE+NW+W, SW+NE+E+NW+REST], [SW+SE+E+NE+NW, W+E+NE+SE+REST],
      [W+SW+SE+E+NE, NW+SE+E+SW+REST], [NW+W+SW+SE+E, NE+SW+W+SE+REST]];
  const two_plus_spectator_plus_rest = [ // xiii) and xiv) "dual-lambda + rest" and "dual-jay"
      [E+SW+NE+REST, E+SE+NW+REST, NE+SE+E+W], [SE+E+W+REST, SE+NE+SW+REST, E+SW+SE+NW],
      [SW+E+W+REST, SW+NW+SE+REST, W+SE+SW+NE], [W+NW+SE+REST, W+NE+SW+REST, NW+SW+W+E],
      [NW+E+W+REST, NW+NE+SW+REST, NE+W+NW+SE], [NE+E+W+REST, NE+NW+SE+REST, NW+E+NE+SW]];
  // now select which of these collision classes we're going to use:
  collisionRules = [];
  switch(type)
    {
        case GasType.FHPI:
            collisionRules.push(pair_head_on);
            collisionRules.push(symmetric_3);
            break;
        case GasType.FHPII:
            collisionRules.push(pair_head_on);
            collisionRules.push(symmetric_3);
            collisionRules.push(pair_head_on_plus_rest_no_triple);
            collisionRules.push(symmetric_3_plus_rest);
            collisionRules.push(one_plus_rest);
            break;
        case GasType.FHPIII: // FHP7, collision-saturated
            collisionRules.push(pair_head_on);
            collisionRules.push(pair_head_on_plus_rest);
            collisionRules.push(one_plus_rest);
            collisionRules.push(two_plus_spectator_including_rest);
            collisionRules.push(four_particles_including_rest_no_momentum);
            collisionRules.push(four_particles_plus_rest);
            collisionRules.push(five_particles_including_rest_momentum_one);
            collisionRules.push(two_plus_spectator_plus_rest);
            break;
        case GasType.FHP6: // FHP6, collision-saturated
            collisionRules.push(pair_head_on);
            collisionRules.push(symmetric_3);
            collisionRules.push(two_plus_spectator);
            collisionRules.push(four_particles);
            break;
    }
    collisionRules = collisionRules.flat();
}

function shuffleArray(array) {
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
}

function colissionMap() {
  var result = new Int8Array(129);
  for (var i = 0; i < 128; i++) {
    result[i] = i;
  }
  collisionRules.forEach((item, i) => {
    shuffleArray(item);
    for (var i = 0; i < item.length; i++) {
      result[item[i]] = (i == item.length - 1) ? item[0] : item[i + 1];
    }
  });
  return result;
}

function setRandom() {
    const prob = 0.1;
    var result = new Array(statesize[0]);

    for (var i = 0; i < statesize[0]; i++)
    {
        result[i] = [];
        for (var j = 0; j < statesize[1]; j++)
        {
          result[i][j] = new Int8Array(4);
            if (i < 2 || i > statesize[0] - 4 ||
                j < 2 || j > statesize[1] - 4 ||
                (j == statesize[1] / 4 && i > statesize[0] / 10 && i < (statesize[0] - statesize[0]/10))) {
                  result[i][j][0] = 128;
            } else {
              for (var d = 0; d < 4; d++)
              {
                var aux_bit = 0; //Init
                //Get a random number with a p% of ones
                for (var b = 0; b < 8; b++)
                {
                    aux_bit = (Math.random() <= prob ? 1 : 0) ^ (aux_bit << 1); //Add the one or zero
                }
                if (aux_bit < 128 && (aux_bit == 1 || aux_bit == 2 || aux_bit == 8 || aux_bit == 32)) {
                  result[i][j][d] = aux_bit; //Add to the cell
                }

              }
            }
        }
    }
    set(result);
}

function swap() {
    var tmp = textures.front;
    textures.front = textures.back;
    textures.back = tmp;
}

function stepResize() {
  stepProgram(programs.col, programVars.col, OperationType.resize);
}

function stepRandom() {
    stepProgram(programs.col, programVars.col, OperationType.initializeWind);
}

function step() {
    stepProgram(programs.col, programVars.col, OperationType.collision);
}

function stepProgram(program, vars, operation) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers.step);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
                          gl.TEXTURE_2D, textures.back, 0);

  gl.activeTexture(gl.TEXTURE0 + 0);
  gl.bindTexture(gl.TEXTURE_2D, textures.front);

  gl.viewport(0, 0, statesize[0], statesize[1]);

  gl.useProgram(program);

  drawScene(vars.quad);

  gl.uniform1i(vars.state, 0);
  gl.uniform1i(vars.operation, operation);
  gl.uniform2f(vars.scale, statesize[0], statesize[1]);
  gl.uniform1iv(vars.colissionMap, colissionMap());
  if (toolPosition) {
    gl.uniform3f(vars.tool, toolPosition.x, toolPosition.y, toolRadius);
  }

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  swap();
}

function drawy() {
  // createImageFromTexture(textures.front, statesize[0], statesize[1] * 8);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const program = programs.copy;



    gl.activeTexture(gl.TEXTURE0 + 0);
    gl.bindTexture(gl.TEXTURE_2D, textures.front);

    gl.viewport(0, 0, viewsize[0], viewsize[1]);

    gl.useProgram(program);

    gl.uniform1i(programVars.copy.state, 0);
    gl.uniform2f(programVars.copy.camera, camera[0], camera[1]);
    gl.uniform1f(programVars.copy.zoom, zoom);

    drawScene(programVars.copy.quad);
    gl.uniform2f(programVars.copy.scale, viewsize[0], viewsize[1]);
    gl.uniform2f(programVars.copy.size, statesize[0], statesize[1]);
    gl.uniform2f(programVars.copy.resolution, resolution[0], resolution[1]);


    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

var count = 0;
var timer;

function start() {
  paused = false;
    if (timer == null) {
        timer = setInterval(function(){
          // if (count < 8) {
          //   count++;
            step();
            drawy();
          // }

        }, speed);
    }
}

function pause() {
  paused = true;
  if (timer != null) {
    clearInterval(timer);
    timer = null;
  }
}

//
// initBuffers
//
// Initialize the buffers we'll need. For this demo, we just
// have one object -- a simple two-dimensional square.
//
function initBuffers(gl) {

  // Create a buffer for the square's positions.

  const positionBuffer = gl.createBuffer();

  // Select the positionBuffer as the one to apply buffer
  // operations to from here out.

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

  // Now create an array of positions for the square.

  // const positions = [
  //    1.0,  1.0,
  //   -1.0,  1.0,
  //    1.0, -1.0,
  //   -1.0, -1.0,
  // ];

  const positions = [
     -1.0,  -1.0,
    1.0,  -1.0,
     -1.0, 1.0,
    1.0, 1.0,
  ];

  // Now pass the list of positions into WebGL to build the
  // shape. We do this by creating a Float32Array from the
  // JavaScript array, then use it to fill the current buffer.

  gl.bufferData(gl.ARRAY_BUFFER,
                new Float32Array(positions),
                gl.STATIC_DRAW);

  return {
    position: positionBuffer,
  };
}

//
// Draw the scene.
//
function drawScene(pprogramVar) {
  const buffers = initBuffers(gl);

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  {
    const numComponents = 2;
    const type = gl.FLOAT;
    const normalize = false;
    const stride = 0;
    const offset = 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
    gl.vertexAttribPointer(
        pprogramVar,
        numComponents,
        type,
        normalize,
        stride,
        offset);
    gl.enableVertexAttribArray(
        pprogramVar);
  }
}

//
// Initialize a shader program, so WebGL knows how to draw our data
//
function initShaderProgram(gl, vsSource, fsSource) {
  const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

  // Create the shader program

  const shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  // If creating the shader program failed, alert

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
    return null;
  }

  return shaderProgram;
}

//
// creates a shader of the given type, uploads the source and
// compiles it.
//
function loadShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

function subset(texture, source, xoff, yoff, width, height) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, xoff, yoff,
                         width, height,
                         gl.RGBA_INTEGER, gl.BYTE, source);
};

function applyTool(point, toolType) {
  var result = new Int8Array(toolRadius * toolRadius * 4 * 4);
  switch (toolType) {
    case ToolType.wall:
    case ToolType.clear:
      for (var x = 0; x < toolRadius * toolRadius * 4 * 4; x++) {
          result[x] = toolType == ToolType.wall ? 128 : 0;
      }
      break;
    case ToolType.fan:

      const prob = 0.2;
      if (curDrag == null) {
        for (var x = 0; x < toolRadius * toolRadius * 4 * 4; x++) {
          var aux_bit = 0; //Init
          //Get a random number with a p% of ones
          for (var b = 0; b < 8; b++)
          {
              aux_bit = (Math.random() <= prob ? 1 : 0) ^ (aux_bit << 1); //Add the one or zero
          }
          result[x] = aux_bit;
        }
      } else {
        const strength = dragDistance() / Math.min(resolution[0], resolution[1]);
        const direction = Math.PI * 2 - (dragDirection() + Math.PI);

        for (var x = 0; x < toolRadius * toolRadius * 4 * 4; x++) {
          for (var attempt = 0; attempt < 4; attempt++) {
            if (Math.random() > strength) {
              const i = (direction + (Math.random() - 0.5)) | 0;
              if (i >= 0 && i < 6) {
                result[x] |= directionCircle[i];
              }
            }
          }
        }
      }
      break;

  }

  const startX = Math.round(point.y - toolRadius);
  const startY = Math.round(point.x - toolRadius);
  const endX = Math.round(statesize[0] - (point.y + toolRadius));
  const endY = Math.round(statesize[1] - (point.x + toolRadius));

  const width = toolRadius * 2 + (startX >= 0 ? 0 : startX) + (endX >= 0 ? 0 : endX);
  const height = toolRadius * 2 + (startY >= 0 ? 0 : startY) + (endY >= 0 ? 0 : endY);

  subset(textures.front, result, startX >= 0 ? startX : 0, startY >= 0 ? startY : 0, width, height);
  drawy();
}

function setupEventHandlers() {

  var px, py;
  var leftPressed = false;
  var rightPressed = false;
  var dragging = false;
  var juliaDrag = false;
  var takeScreenshot = false;
  var showHelpMenu = false;
  // var gestureStartRotation;
  var gestureStartZoom;
  var gesturing = false;

  window.addEventListener("gesturestart", function (e) {
    e.preventDefault();

    gesturing = true;
    prevDrag = [e.pageX, e.pageY];
    gestureStartZoom = zoom;
  });

  window.addEventListener("gesturechange", function (e) {
    e.preventDefault();

    // rotation = gestureStartRotation + e.rotation;

    setZoom(programInfo, e.scale * gestureStartZoom);

    curDrag = [e.pageX, e.pageY];
    applyDrag();
  })

  window.addEventListener("gestureend", function (e) {
    e.preventDefault();
    gesturing = false;
  });

  document.addEventListener('keyup', event => {
    if (event.code === 'Space') {
      if (paused) {
        start();
      } else {
        pause();
      }
    }
  })

  window.addEventListener("wheel", e => {
    e.preventDefault();

    const delta = -Math.sign(e.deltaY)
    cameraFp = [e.offsetX, e.offsetY];

    applyZoom(delta);
  }, { passive: false });

  window.addEventListener("pointerdown", e => {
    if (gesturing) {
      return;
    }
    prevDrag = [e.offsetX, e.offsetY];
      dragging = (e.button == 1 || (e.altKey && e.button == 0));
      if (e.button == 2) {
        rightPressed = true;
        paused = true;
        var coord = ScreenToState(e.offsetX, e.offsetY);
        applyTool(coord, ToolType.clear);
      }
      if (!dragging && e.button == 0) {
        leftPressed = true;

        var coord = ScreenToState(e.offsetX, e.offsetY);
        applyTool(coord, tool);
      }
  });

  // Disable context menu for right click.
  if (document.addEventListener) {
      document.addEventListener('contextmenu', function (e) {
          e.preventDefault();
      }, false);
  } else {
      document.attachEvent('oncontextmenu', function () {
          window.event.returnValue = false;
      });
  }

  window.addEventListener('pointermove', e => {
    if (gesturing) {
      return;
    }
    toolPosition = ScreenToState(e.offsetX, e.offsetY);
    curDrag = [e.offsetX, e.offsetY];
    if (dragging) {
      applyDrag();
    }
    if (leftPressed || rightPressed) {
      var coord = ScreenToState(e.offsetX, e.offsetY);
      applyTool(coord, leftPressed ? tool : ToolType.clear);
    }
  });

  window.addEventListener('pointerup', e => {
    dragging = false;
    leftPressed = false;
    rightPressed = false;
    curDrag = null;
    prevDrag = null;
  });

  var speedLabel = document.querySelector('#speed');
  speedLabel.addEventListener('input', function() {
    document.getElementById("speedLabel").innerHTML = "Speed: " + this.value + "step";
    speed = 1000.0 / this.value;
    pause();
    start();
  });
  speedLabel.value = 1000.0 / speed;
  document.getElementById("speedLabel").innerHTML = "Speed: " + 1000.0 / speed + "step";

  var toolSizeLabel = document.querySelector('#toolSize');
  toolSizeLabel.addEventListener('input', function() {
    document.getElementById("toolSizeLabel").innerHTML = "Brush size: " + this.value;
    toolRadius = this.value / 2;
  });
  toolSizeLabel.value = toolRadius * 2;
  document.getElementById("toolSizeLabel").innerHTML = "Brush size: " + toolRadius * 2;

  var resolutionLabel = document.querySelector('#resolution');
  resolutionLabel.addEventListener('input', function() {
    document.getElementById("resolutionLabel").innerHTML = "Resolution: " + this.value + "x";
    sizeMultiply = this.value;
    resize();
  });
  resolutionLabel.value = sizeMultiply;
  document.getElementById("resolutionLabel").innerHTML = "Resolution: " + sizeMultiply + "x";

  window.addEventListener('resize', function() {
    resize();
  });

  var fpsContainer = document.querySelector('#fpsContainer');
  fpsContainer.addEventListener("pointerdown", function(e){
      e.stopPropagation();
  });
  var toolsContainer = document.querySelector('#toolsContainer');
  toolsContainer.addEventListener("pointerdown", function(e){
      e.stopPropagation();
  });
}

var g_setSettingsElements;
var g_selectToolElements;
function setSetting(elem, id) {
  for (var i = 0; i < g_setSettingsElements.length; ++i) {
    g_setSettingsElements[i].style.color = i == id ? "red" : "gray"
  }
  type = id;
  initCollisionRules();
}
function selectTool(elem, id) {
  for (var i = 0; i < g_selectToolElements.length; ++i) {
    g_selectToolElements[i].className = i == id ? "tabrow-tab tabrow-tab-opened-accented" : "tabrow-tab"
  }
  tool = id;
}

function setupButtons() {
  g_setSettingsElements = [];
  for (var ii = 0; ii < 100; ++ii) {
    var elem = document.getElementById("setSetting" + ii);
    if (!elem) {
      break;
    }
    g_setSettingsElements.push(elem);
    elem.onclick = function(elem, id) {
      return function () {
        setSetting(elem, id);
      }}(elem, ii);
  }

  g_selectToolElements = [];
  for (var ii = 0; ii < 100; ++ii) {
    var elem = document.getElementById("selectTool" + ii);
    if (!elem) {
      break;
    }
    g_selectToolElements.push(elem);
    elem.onclick = function(elem, id) {
      return function () {
        selectTool(elem, id);
      }}(elem, ii);
  }
}

// Utils

function baseLog(x, y) {
  return (Math.log(y) / Math.log(x)) | 0;
}

function dragDistance() {
  return Math.sqrt(Math.pow(curDrag[0] - prevDrag[0], 2) + Math.pow(curDrag[1] - prevDrag[1], 2));
}

function dragDirection() {
  return Math.atan2(curDrag[1] - prevDrag[1], curDrag[0] - prevDrag[0]);
}

function ScreenToState(x, y) {
  var px = (((x - resolution[0] / 2) - camera[0] * zoom) / resolution[0]);
  var py = (((resolution[1] - (y - camera[1] * zoom) - resolution[1] / 2)) / resolution[1]);

  px *= statesize[0] * (resolution[0] / (viewsize[0] * zoom));
  py *= statesize[1] * (resolution[1] / (viewsize[1] * zoom));

  return {x: px * 1.17 + 0.295 * statesize[0], y: py * 0.985 + 0.26 * statesize[1]};
}
function ScreenToPt(x, y) {
  const px = (x - resolution[0] / 2) / zoom - camera[0];
  const py = (y - resolution[1] / 2) / zoom - camera[1];

  return [px, py];
}
function PtToScreen(px, py) {
  x = (zoom * (px + camera[0])) + resolution[0] / 2;
  y = (zoom * (py + camera[1])) + resolution[1] / 2;

  return [x, y];
}

function applyDrag() {
  camera[0] += (curDrag[0] - prevDrag[0]) / zoom;
  camera[1] += (curDrag[1] - prevDrag[1]) / zoom;
  prevDrag = curDrag;

  drawy();
}

function applyZoom(amount) {
  zoom += amount * (zoom / 20.0);

  drawy();
}

function setZoom(newZoom) {
  zoom = newZoom;

  drawy();
}
