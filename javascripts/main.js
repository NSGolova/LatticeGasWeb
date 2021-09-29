
// Canvas size
var resolution;
// Copy texture size
var viewsize;
// State texture size
var statesize;
// Copy texture resolution multiplicator.
var sizeMultiply = 10.0;

var zoom = 0.1;
var camera = [0., 0.];
var fps;

const OperationType = {
  collision: 0,
  initializeRandom: 1,
  initializeWind: 2,
  resize: 3,
  clear: 4
};
var preset = OperationType.initializeWind;

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
  nothing: 2,
  clear: 128
};

// Tool for the left mouse button.
var tool = ToolType.fan;
// Tool for the right mouse button.
var secondaryTool = ToolType.clear;
var toolRadius = 10;
var toolPosition;

const ToolMode = {
  main: 0,
  secondary: 1,
  none: 128
};
var toolInUse = ToolMode.none;

const ToolShape = {
  circle: 0,
  square: 1,
  none: 128
};
var shape = ToolShape.circle;

// How fast simulation is calculated.
var speed = 25;
var timers = [];

const E=1, SE=2, SW=4, W=8, NW=16, NE=32, REST=64, BOUNDARY=128;
const directionCircle = [NW, SW, W, SE, NE, E];
var collisionRules;

var gl, gl2Available = false;
var buffers, programs, framebuffers, textures;
var curDrag, prevDrag;
var cameraDest = [0., 0.];

main();

function main() {
  setupWebGL();
  setupShaderStructs();

  setupDefault();
  start();

  setupButtons();
  setupEventHandlers();
  setupFps();
}

function setupWebGL() {
  const canvas = document.querySelector('#glcanvas');
  gl = canvas.getContext('webgl2');

  if (gl) {
    gl2Available = true;
  } else {
    gl = canvas.getContext('webgl');
  }

  if (!gl) {
    const text = `
    Unable to initialize WebGL. Your browser or machine may not support it.
    Use Google Chrome for the best experience.
    Check out https://discussions.apple.com/thread/8655829 for Safari.
    `;
    alert(text);
    return;
  }
}

function setupShaderStructs() {
  programs = {
    copy: initShaderProgram(gl, quadShader, copyShader),
    col: initShaderProgram(gl, quadShader, collisionShader)
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
      shape: gl.getUniformLocation(programs.col, 'shape'),
      toolInUse: gl.getUniformLocation(programs.col, 'toolInUse'),
      operation: gl.getUniformLocation(programs.col, 'operation')
    }
  }

  buffers = {
      quad: createArray(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]))
  };

  framebuffers = {
      step: gl.createFramebuffer()
  };
}

function setupDefault() {
  recalculateTextures();
  initCollisionRules();

  zoom = 100 / statesize[0];
  camera = [-resolution[0] * 2.5, resolution[1] * (3 * resolution[0] / resolution[1])];

  updatePreset();
}

function resize() {
  pause();
  var oldFront = textures.front;
  recalculateTextures();

  textures.front = oldFront;
  step();
  textures.back = createTexture(gl.REPEAT, gl.NEAREST);
  step();
  redraw();
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
  redraw();
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

function updatePreset() {
  stepProgram(programs.col, programVars.col, preset);
}

function stepResize() {
  stepProgram(programs.col, programVars.col, OperationType.resize);
}

function stepRandom() {
  stepProgram(programs.col, programVars.col, OperationType.initializeRandom);
}

function stepWind() {
  stepProgram(programs.col, programVars.col, OperationType.initializeWind);
}

function stepClear() {
  stepProgram(programs.col, programVars.col, OperationType.clear);
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
    gl.uniform1i(vars.shape, shape);
    switch (toolInUse) {
      case ToolMode.none:
        gl.uniform1i(vars.toolInUse, ToolType.nothing);
        break;
      case ToolMode.main:
        gl.uniform1i(vars.toolInUse, tool);
        break;
      case ToolMode.secondary:
        gl.uniform1i(vars.toolInUse, secondaryTool);
        break;
    }
  }

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  swap();
}

function redraw() {
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

  document.getElementById("fpsLabel").innerHTML = "fps: " + fps;
}

function start() {
  paused = false;
  timers.forEach((item, i) => {
    item.stop();
  });
  timers = [];

  const timersCount = speed > 20 ? speed - 20 : 1;
  const throttle = speed > 20 ? 0 : 20 - speed;

  for (var i = 0; i < timersCount; i++) {
    timers.push(new Timer(animationFrame, throttle));
  }
}

function pause() {
  paused = true;
  timers.forEach((item, i) => {
    item.stop();
  });
}

function animationFrame() {
    step();
    redraw();
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
  const resultLength = toolRadius * toolRadius * 4 * 4;
  var result = new Int8Array(resultLength);
  switch (toolType) {
    case ToolType.wall:
    case ToolType.clear:
      for (var x = 0; x < resultLength; x++) {
          result[x] = toolType == ToolType.wall ? 128 : 0;
      }
      break;
    case ToolType.fan:

      const prob = 0.2;
      if (curDrag == null) {
        for (var x = 0; x < resultLength; x++) {
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

        for (var x = 0; x < resultLength; x++) {
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
  redraw();
}

function setupEventHandlers() {

  var leftPressed = false;
  var rightPressed = false;
  var dragging = false;
  // The two touches that make up a pinch-to-zoom gesture.
  // Updated every time one of them changes.
  var gestureTouches;
  // How zoomed in the image was when the gesture began.
  var gestureStartZoom;
  // The distance there was between the two touches when the gesture began.
  var gestureStartDist;
  // The points on the complex plane each touch started at.
  // We use this to apply the necessary translations to make the touches
  // stay as close as possible to their original positions on the image.
  var gestureStartPoints;
  // The position the camera was at when the gesture started.
  var gestureStartCamera;
  // Whether a gesture is currently running.
  var gesturing = false;

  function touchDistance(touchA, touchB) {
    return Math.sqrt(
      (touchA.pageX - touchB.pageX) ** 2 + (touchA.pageY - touchB.pageY) ** 2,
    );
  }

  const canvas = document.querySelector("#glcanvas");

  // Define these on the canvas so that we don't override events for the controls.
  canvas.addEventListener("touchstart", function (e) {
    if (e.targetTouches.length === 2 && !gesturing) {
      e.preventDefault();

      const touchA = e.targetTouches[0];
      const touchB = e.targetTouches[1];

      gesturing = true;
      gestureStartZoom = zoom;
      gestureStartDist = touchDistance(touchA, touchB);
      gestureStartPoints = [
        ScreenToPt(touchA.pageX, touchA.pageY),
        ScreenToPt(touchB.pageX, touchB.pageY),
      ];
      gestureStartCamera = camera;
      gestureTouches = [touchA, touchB];
    }
  });

  canvas.addEventListener("touchmove", function (e) {
    if (!gesturing) {
      return;
    }

    let changed = false;
    for (const touch of e.changedTouches) {
      if (touch.identifier === gestureTouches[0].identifier) {
        changed = true;
        gestureTouches[0] = touch;
      }

      if (touch.identifier === gestureTouches[1].identifier) {
        changed = true;
        gestureTouches[1] = touch;
      }
    }

    if (!changed) {
      return;
    }

    e.preventDefault();

    // First, handle zooming.
    // Calculate the ratio of the distance between the new touch points
    // to the distance between them when the gesture started.
    const newDist = touchDistance(...gestureTouches);
    const scale = newDist / gestureStartDist;

    // Multiply that by the zoom we had when the gesture started to get the new zoom.
    zoom = scale * gestureStartZoom;

    // Now handle translating.
    // Figure out the points these touches map to on the fractal.
    const ptA = ScreenToPt(gestureTouches[0].pageX, gestureTouches[0].pageY);
    const ptB = ScreenToPt(gestureTouches[1].pageX, gestureTouches[1].pageY);

    // Figure out how fare the points are from where they should be.
    const xDistA = ptA[0] - gestureStartPoints[0][0];
    const xDistB = ptB[0] - gestureStartPoints[1][0];
    const yDistA = ptA[1] - gestureStartPoints[0][1];
    const yDistB = ptB[1] - gestureStartPoints[1][1];

    // Figure out how far they are from where they should be on average.
    const xDist = (xDistA + xDistB) / 2;
    const yDist = (yDistA + yDistB) / 2;

    // Move the camera.
    camera[0] = gestureStartCamera[0] + xDist;
    camera[1] = gestureStartCamera[1] + yDist;

    redraw();
  });

  function onTouchEnd(e) {
    for (const touch of e.changedTouches) {
      if (
        touch.identifier === gestureTouches[0].identifier ||
        touch.identifier === gestureTouches[1].identifier
      ) {
        e.preventDefault();
        gesturing = false;
        break;
      }
    }
  }

  canvas.addEventListener("touchend", onTouchEnd);
  canvas.addEventListener("touchcancel", onTouchEnd);

  document.addEventListener('keyup', event => {
    if (event.code === 'Space') {
      if (paused) {
        start();
      } else {
        pause();
      }
    }
    if (isFinite(event.key)) {
      selectTool(null, parseInt(event.key) - 1);
    }
  })

  window.addEventListener("wheel", e => {
    e.preventDefault();

    const zoomAmount = -Math.sign(e.deltaY);

    if (e.shiftKey) {
      toolRadius += Math.round(zoomAmount * (toolRadius / 20.0));
      document.getElementById("toolSizeLabel").innerHTML = "Brush size: " + toolRadius * 2;
      toolSizeLabel.value = toolRadius * 2;
    } else {
      const cameraFp = ScreenToPt(e.pageX, e.pageY);

      zoom += zoomAmount * (zoom / 20.0);
      const cameraFpNew = ScreenToPt(e.pageX, e.pageY);
      const fpXDelta = cameraFpNew[0] - cameraFp[0];
      const fpYDelta = cameraFpNew[1] - cameraFp[1];

      cameraDest[0] += fpXDelta;
      cameraDest[1] += fpYDelta;

      camera[0] = (camera[0] + fpXDelta) * 0.8 + cameraDest[0] * 0.2;
      camera[1] = (camera[1] + fpYDelta) * 0.8 + cameraDest[1] * 0.2;
    }

    redraw();
  }, { passive: false });

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

  canvas.addEventListener("pointerdown", e => {
    if (gesturing) {
      return;
    }
    prevDrag = [e.offsetX, e.offsetY];
      dragging = (e.button == 1 || (e.altKey && e.button == 0));
      if (e.button == 2) {
        rightPressed = true;

        toolInUse = ToolMode.secondary;
      }
      if (!dragging && e.button == 0) {
        leftPressed = true;

        toolInUse = ToolMode.main;
      }
  });

  canvas.addEventListener('pointermove', e => {
    if (gesturing) {
      return;
    }
    toolPosition = ScreenToState(e.offsetX, e.offsetY);
    redraw();
    curDrag = [e.offsetX, e.offsetY];
    if (dragging) {
      applyDrag();
    }
  });

  canvas.addEventListener('pointerup', e => {
    dragging = false;
    leftPressed = false;
    rightPressed = false;
    curDrag = null;
    prevDrag = null;
    toolInUse = ToolMode.none;
  });

  var speedLabel = document.querySelector('#speed');
  speedLabel.addEventListener('input', function() {
    document.getElementById("speedLabel").innerHTML = "Speed: " + this.value + "step";
    speed = this.value;
    start();
  });
  speedLabel.value = speed;
  document.getElementById("speedLabel").innerHTML = "Speed: " + speed + "step";

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
var g_setPresetElements;
var g_selectToolElements;
var g_selectShapeElements;
function setSetting(elem, id) {
  for (var i = 0; i < g_setSettingsElements.length; ++i) {
    g_setSettingsElements[i].style.color = i == id ? "red" : "gray"
  }
  type = id;
  initCollisionRules();
}
function setPreset(elem, id) {
  for (var i = 0; i < g_setPresetElements.length; ++i) {
    g_setPresetElements[i].style.color = i == id ? "red" : "gray"
  }
  preset = id;
  updatePreset();
}
function selectTool(elem, id) {
  for (var i = 0; i < g_selectToolElements.length; ++i) {
    g_selectToolElements[i].className = i == id ? "tabrow-tab tabrow-tab-opened-accented" : "tabrow-tab"
  }
  tool = id;
}
function selectShape(elem, id) {
  for (var i = 0; i < g_selectShapeElements.length; ++i) {
    g_selectShapeElements[i].className = i == id ? "tabrow-tab tabrow-tab-opened-accented" : "tabrow-tab"
  }
  shape = id;
  redraw();
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

  g_selectShapeElements = [];
  for (var ii = 0; ii < 100; ++ii) {
    var elem = document.getElementById("selectShape" + ii);
    if (!elem) {
      break;
    }
    g_selectShapeElements.push(elem);
    elem.onclick = function(elem, id) {
      return function () {
        selectShape(elem, id);
      }}(elem, ii);
  }
  g_setPresetElements = [];
  for (var ii = 0; ii < 100; ++ii) {
    var elem = document.getElementById("setPreset" + ii);
    if (!elem) {
      break;
    }
    g_setPresetElements.push(elem);
    elem.onclick = function(elem, id) {
      return function () {
        setPreset(elem, id);
      }}(elem, ii);
  }
}

function setupFps() {
  const times = [];

  function refreshLoop() {
    window.requestAnimationFrame(() => {
      const now = performance.now();
      while (times.length > 0 && times[0] <= now - 1000) {
        times.shift();
      }
      times.push(now);
      fps = times.length;
      refreshLoop();
    });
  }

  refreshLoop();
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

// square root of 3 over 2
const hex_factor = 0.8660254037844386;

function ScreenToState(x, y) {
  // Adjust canvas coords for camera and zoom.
  var p = ScreenToPt(x, y);

  // transform canvas coords to state coords according to view.
  var px = (p[0] * (statesize[0] / viewsize[0]) + statesize[0] / 4) / hex_factor;
  var py = p[1] * (statesize[1] / viewsize[1]) * -1 + statesize[0] / 4;

  return {x: px , y: py};
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
  cameraDest[0] += (curDrag[0] - prevDrag[0]) / zoom;
  cameraDest[1] += (curDrag[1] - prevDrag[1]) / zoom;
  prevDrag = curDrag;

  redraw();
}
