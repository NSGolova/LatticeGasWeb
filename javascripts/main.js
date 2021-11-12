// Canvas size
var resolution;
// Drawing texture size
var viewsize;
// State texture size
var statesize;
// Computation texture resolution.
var gridSize = 1000.0;
// Copy texture resolution multiplicator.
const viewMultiplicator = 16.0;

var zoom = 0.1;
var camera = [0., 0.];

const OperationType = {
  collision: 0,
  initializeRandom: 1,
  initializeWind: 2,
  resize: 3,
  clear: 4,
  applyImage: 5,
  nothing: 128
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
  brush: 0,
  nothing: 1,
  applyImage: 2,
  clear: 128
};

const BrushType = {
  fan: 0,
  wall: 1,
  generator: 2,
  sink: 3
};

// Tool for the left mouse button.
var tool = ToolType.brush;
var brush = BrushType.fan;
var brushStrength = 128;
var brushDirections = E+SE+SW+W+NW+NE+REST;
// Tool for the right mouse button.
var secondaryTool = ToolType.clear;

var toolRadius = 25; // 0.5 of shown
var toolPosition;
var imageToolTreshold = 520;

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
var animationTimer;
var paused = false;

var rulebookController;
var selectedBook;

var showVelocity = false;
var velocityScale = 25;

const VelocityColorType = {
  HSV: 0,
  Black: 1,
  Custom: 2
};
var velocityColorType = VelocityColorType.HSV;
var velocityColor = [1.0, 0.0, 0.0, 1.0];

var denoise = false;

var gl, gl2Available = false;
var buffers, programs, framebuffers, textures;
var curDrag, prevDrag;
var cameraDest = [0., 0.];

var fps;
var fpsLabel;

var recording = false;
var gif;

var toolTabs, brushTabs, directionTabs;
var speedSlider, resolutionSlider;
var tresholdSlider, toolSizeSlider, brushStrengthSlider;
var showVelocityToggle, velocitySlider, velocityTabs;
var denoiseToggle;

main();

function main() {
  setupWebGL();
  setupShaderStructs();

  setupFps();

  setupDefault();
  start();

  setupButtons();
  setupRulebookUI();
  setupEventHandlers();
}

function setupWebGL() {
  const canvas = document.querySelector('#glcanvas');
  gl = canvas.getContext('webgl2', {
    premultipliedAlpha: false  // Ask for non-premultiplied alpha
  });

  if (gl) {
    gl2Available = true;
  }
  // else {
  //   gl = canvas.getContext('webgl');
  // }

  if (!gl) {
    const text = `
    Unable to initialize WebGL. Your browser or machine may not support it.
    Use Google Chrome for the best experience.
    Check out https://discussions.apple.com/thread/8655829 for Safari.
    `;
    alert(text);
    return;
  }

  gl.getExtension('EXT_color_buffer_float');
}

function setupShaderStructs() {
  programs = {
    copy: initShaderProgram(gl, quadShader, drawingShader),
    col: initShaderProgram(gl, quadShader, computationShader),
    velocity: initShaderProgram(gl, quadShader, velocityShader),
    denoise: initShaderProgram(gl, quadShader, denoiseShader),
  };

  programVars = {
    copy: {
      quad: gl.getAttribLocation(programs.copy, 'quad'),
      state: gl.getUniformLocation(programs.copy, 'state'),
      velocityMap: gl.getUniformLocation(programs.copy, 'velocityMap'),
      size: gl.getUniformLocation(programs.copy, 'size'),
      scale: gl.getUniformLocation(programs.copy, 'scale'),
      velocityScale: gl.getUniformLocation(programs.copy, 'velocityScale'),
      camera: gl.getUniformLocation(programs.copy, 'camera'),
      zoom: gl.getUniformLocation(programs.copy, 'zoom'),
      resolution: gl.getUniformLocation(programs.copy, 'resolution'),
      showVelocity: gl.getUniformLocation(programs.copy, 'showVelocity'),
      velocityColorType: gl.getUniformLocation(programs.copy, 'velocityColorType'),
      velocityColor: gl.getUniformLocation(programs.copy, 'velocityColor')
    },
    col: {
      quad: gl.getAttribLocation(programs.col, 'quad'),
      state: gl.getUniformLocation(programs.col, 'state'),
      scale: gl.getUniformLocation(programs.col, 'scale'),
      oldSize: gl.getUniformLocation(programs.col, 'oldSize'),
      colissionMap: gl.getUniformLocation(programs.col, 'colissionMap'),
      tool: gl.getUniformLocation(programs.col, 'tool'),
      shape: gl.getUniformLocation(programs.col, 'shape'),
      toolInUse: gl.getUniformLocation(programs.col, 'toolInUse'),
      operation: gl.getUniformLocation(programs.col, 'operation'),
      imageToApply: gl.getUniformLocation(programs.col, 'imageToApply'),
      selectedTool: gl.getUniformLocation(programs.col, 'selectedTool'),
      applyImageTreshold: gl.getUniformLocation(programs.col, 'applyImageTreshold')
    },
    velocity: {
      quad: gl.getAttribLocation(programs.velocity, 'quad'),
      state: gl.getUniformLocation(programs.velocity, 'state'),
      scale: gl.getUniformLocation(programs.velocity, 'scale')
    },
    denoise: {
      quad: gl.getAttribLocation(programs.denoise, 'quad'),
      state: gl.getUniformLocation(programs.denoise, 'state'),
      scale: gl.getUniformLocation(programs.denoise, 'scale')
    }
  }

  buffers = {
      quad: createArray(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]))
  };

  framebuffers = {
      step: gl.createFramebuffer(),
      velocity: gl.createFramebuffer(),
      denoise: gl.createFramebuffer()
  };
}

function setupDefault() {
  rulebookController = new RulesController(function () {
    selectedBook = rulebookController.selectedBook;
  });

  recalculateTextures();
  selectedBook = rulebookController.selectedBook;

  zoom = 70 / statesize[0];
  camera = [-viewsize[0] / 4.0, viewsize[0] / 4.0];

  updatePreset();
  animationTimer = new Timer(redrawFrame, 0);
}

function colissionMap() {
  return selectedBook.colissionMap();
}

function setupRulebookUI() {
  rulebookController.setupUI();
}

function resize() {
  pause();
  var oldFront = textures.front;
  var oldStatesize = statesize;
  recalculateTextures();

  textures.front = oldFront;
  stepResize(oldStatesize);
  textures.back = createTexture(gl.REPEAT, gl.NEAREST);
  step();
  redraw();
  start();
}

function resizeView() {
  const canvas = document.querySelector('#glcanvas');
  const placeholder = document.querySelector('#placeholder');

  resolution = [placeholder.getBoundingClientRect().width, placeholder.getBoundingClientRect().height];

  canvas.width = resolution[0];
  canvas.height = resolution[1];

  viewsize = new Float32Array([(statesize[0] * viewMultiplicator) | 0, (statesize[1] * viewMultiplicator) | 0]);
}

function recalculateTextures() {
  const canvas = document.querySelector('#glcanvas');
  const placeholder = document.querySelector('#placeholder');

  resolution = [placeholder.getBoundingClientRect().width, placeholder.getBoundingClientRect().height];

  canvas.width = resolution[0];
  canvas.height = resolution[1];


  statesize = new Float32Array([(gridSize) | 0, (gridSize) | 0]);
  viewsize = new Float32Array([(statesize[0] * viewMultiplicator) | 0, (statesize[1] * viewMultiplicator) | 0]);

  textures = {
      front: createTexture(gl.REPEAT, gl.NEAREST),
      back: createTexture(gl.REPEAT, gl.NEAREST)
  };

  recalculateVelocityTexture();
  recalculateDenoiseTexture();
}

function recalculateVelocityTexture() {
  if (showVelocity) {
    textures.velocityMap = createTexture(gl.REPEAT, gl.NEAREST, [statesize[0] / velocityScale, statesize[1] / velocityScale], true);
  } else {
    textures.velocityMap = null;
  }
}

function updateShowVelocity(value) {

}

function recalculateDenoiseTexture() {
  if (denoise) {
    textures.denoise = createTexture(gl.REPEAT, gl.NEAREST, [viewsize[0], viewsize[1]], true);
  } else {
    textures.denoise = null;
  }
}

function createTexture(wrap, filter, size, isFloat) {
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    wrap = wrap == null ? gl.CLAMP_TO_EDGE : wrap;
    filter = filter == null ? gl.LINEAR : filter;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);

    gl.bindTexture(gl.TEXTURE_2D, texture);

    if (isFloat) {
      if (size) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, size[0], size[1],
                          0, gl.RGBA, gl.HALF_FLOAT, null);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, statesize[0], statesize[1],
                          0, gl.RGBA, gl.HALF_FLOAT, null);
      }
    } else {
      if (size) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8UI, size[0], size[1],
                          0, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, null);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8UI, statesize[0], statesize[1],
                          0, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, null);
      }
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
                     gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, rgba);
}

function get() {
    var w = statesize[0], h = statesize[1];
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers.step);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
                            gl.TEXTURE_2D, textures.front, 0);
    var rgba = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, rgba);
    var state = new Array(w);

    for (var i = 0; i < statesize[0]; i++) {
      state[i] = [];
      for (var j = 0; j < statesize[1]; j++) {
        var ii = i * statesize[0] + j;
        state[i][j] = new Uint8Array(4);
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
        result[i][j] = new Uint8Array(4);
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

function dataFromTexture(texture, width, height) {
    // Create a framebuffer backed by the texture
    var framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    // Read the contents of the framebuffer
    var data = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, data);

    gl.deleteFramebuffer(framebuffer);

    return data; // canvas.toDataURL("image/png", 1.0); //.replace(/^data:image\/[^;]/, 'data:application/octet-stream');
}

function save() {
  let toSave = {
    size: statesize,
    rulebook: rulebookController.selectedBook,
    state: dataFromTexture(textures.front, statesize[0], statesize[1]).toBase64String()
  };

  saveJSONAsFile(JSON.stringify(toSave), "gasomaton.json");
}

function load() {
  loadFile(function (file) {
    if (file.state && file.size) {
      statesize = file.size;
      textures = {
          front: createTexture(gl.REPEAT, gl.NEAREST),
          back: createTexture(gl.REPEAT, gl.NEAREST)
      };

      recalculateVelocityTexture();

      gl.bindTexture(gl.TEXTURE_2D, textures.front);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8UI, statesize[0], statesize[1],
                          0, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, file.state.base64ToArray());
    }

    if (file.rulebook) {
      rulebookController.loadBook(file.rulebook);
    }
  });
}

function loadImageToApply() {
  loadImage(function (image) {
    const texture = createTexture(gl.REPEAT, gl.NEAREST, [image.width, image.height]);
    textures.apply = texture;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8UI, image.width, image.height,
                        0, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, image);
  })
}

function swap() {
    var tmp = textures.front;
    textures.front = textures.back;
    textures.back = tmp;
}

function updatePreset() {
  stepProgram(programs.col, programVars.col, preset);
  redraw();
}

function stepResize(oldSize) {
  stepProgram(programs.col, programVars.col, OperationType.resize, oldSize);
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

function stepNothing() {
  stepProgram(programs.col, programVars.col, OperationType.nothing);
}

function step() {
  stepProgram(programs.col, programVars.col, OperationType.collision);
}

function stepProgram(program, vars, operation, oldSize) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers.step);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
                          gl.TEXTURE_2D, textures.back, 0);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, textures.front);

  if (textures.apply) {
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textures.apply);
  }

  gl.viewport(0, 0, statesize[0], statesize[1]);

  gl.useProgram(program);

  drawScene(vars.quad);

  if (textures.apply) {
    gl.uniform1i(vars.imageToApply, 1);
    gl.uniform1ui(vars.applyImageTreshold, imageToolTreshold);
  }

  gl.uniform1i(vars.state, 0);
  gl.uniform1i(vars.operation, operation);
  gl.uniform2f(vars.scale, statesize[0], statesize[1]);
  gl.uniform1uiv(vars.colissionMap, colissionMap());
  if (toolPosition) {
    gl.uniform3f(vars.tool, toolPosition.x, toolPosition.y, toolRadius);
    gl.uniform1i(vars.shape, shape);
    gl.uniform1i(vars.selectedTool, tool);
    switch (toolInUse) {
      case ToolMode.none:
        gl.uniform4i(vars.toolInUse, ToolType.nothing, 0, 0, 0);
        break;
      case ToolMode.main:
        gl.uniform4i(vars.toolInUse, tool, brush, brushStrength, brushDirections);
        break;
      case ToolMode.secondary:
        gl.uniform4i(vars.toolInUse, secondaryTool, brush, brushStrength, brushDirections);
        break;
    }
  }
  if (oldSize) {
    gl.uniform2f(vars.oldSize, oldSize[0], oldSize[1]);
  }

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  swap();
}

function redraw() {
  if (showVelocity) {
    calculateVelocities();
  }
  if (denoise) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers.denoise);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
                            gl.TEXTURE_2D, textures.denoise, 0);
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  const program = programs.copy;

  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, textures.front);

  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, textures.velocityMap);

  gl.viewport(0, 0, viewsize[0], viewsize[1]);

  gl.useProgram(program);

  gl.uniform1i(programVars.copy.state, 2);
  gl.uniform1i(programVars.copy.velocityMap, 3);

  gl.uniform2f(programVars.copy.camera, camera[0], camera[1]);
  gl.uniform1f(programVars.copy.zoom, zoom);
  gl.uniform1i(programVars.copy.showVelocity, showVelocity ? 1 : 0);

  if (showVelocity) {
    gl.uniform1f(programVars.copy.velocityScale, velocityScale);
    gl.uniform1i(programVars.copy.velocityColorType, velocityColorType);
    if (velocityColor) {
      gl.uniform4f(programVars.copy.velocityColor, velocityColor[0], velocityColor[1], velocityColor[2], velocityColor[3]);
    }
  }

  drawScene(programVars.copy.quad);
  gl.uniform2f(programVars.copy.scale, viewsize[0], viewsize[1]);
  gl.uniform2f(programVars.copy.size, statesize[0], statesize[1]);
  gl.uniform2f(programVars.copy.resolution, resolution[0], resolution[1]);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  if (denoise) {
    drawDenoise();
  }

  fpsLabel.innerHTML = "fps: " + fps;
}

function calculateVelocities() {
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers.velocity);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
                          gl.TEXTURE_2D, textures.velocityMap, 0);

  const program = programs.velocity;
  const vars = programVars.velocity;

  gl.activeTexture(gl.TEXTURE4);
  gl.bindTexture(gl.TEXTURE_2D, textures.front);

  gl.viewport(0, 0, statesize[0] / velocityScale, statesize[1] / velocityScale);

  gl.useProgram(program);

  drawScene(vars.quad);

  gl.uniform1i(vars.state, 4);
  gl.uniform1f(vars.scale, velocityScale);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function drawDenoise() {

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const program = programs.denoise;
  const vars = programVars.denoise;

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, textures.denoise);

  gl.viewport(0, 0, viewsize[0], viewsize[1]);

  gl.useProgram(program);

  gl.uniform1i(vars.state, 0);

  drawScene(vars.quad);
  gl.uniform2f(vars.scale, viewsize[0], viewsize[1]);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
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
    timers.push(new Timer(computationFrame, throttle));
  }
}

function pause() {
  paused = true;
  timers.forEach((item, i) => {
    item.stop();
  });
}

function computationFrame() {
    step();
}

function redrawFrame() {
  if (paused) {
    stepNothing();
  }
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

  // gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
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

  setupSliders();

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
    if (isFinite(event.key) && event.key != ' ' && event.target == document.body) {
      var index = parseInt(event.key) - 1;
      selectBrush(index);
      brushTabs.selected = index;
    }
  })

  canvas.addEventListener("wheel", e => {
    e.preventDefault();

    const zoomAmount = -Math.sign(e.deltaY);

    if (e.shiftKey) {
      toolRadius += zoomAmount * (toolRadius / 20.0);
      toolSizeSlider.setValue(toolRadius * 2);
    } else if (e.altKey) {
      let newStrength = brushStrength + zoomAmount * (brushStrength / 20.0);
      if (newStrength >= 1 && newStrength <= 128) {
        brushStrength = newStrength;
        brushStrengthSlider.setValue(newStrength);
      }
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
  if (canvas.addEventListener) {
      canvas.addEventListener('contextmenu', function (e) {
          e.preventDefault();
      }, false);
  } else {
      canvas.attachEvent('oncontextmenu', function () {
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

  window.addEventListener('resize', function() {
    resizeView();
  });

  var saveButton = document.querySelector('#save');
  saveButton.addEventListener('pointerdown', function() {
    save();
  });

  var loadButton = document.querySelector('#load');
  loadButton.addEventListener('pointerdown', function() {
    load();
  });

  var recordButton = document.querySelector('#recordGif');
  recordButton.addEventListener('pointerdown', function() {
    if (recording) {
      recordButton.value = "Record video ";
      recordButton.style.backgroundColor = "";
      recordButton.style.color = "";
      stopRecordingGif();
    } else {
      recordButton.value = "Stop recording";
      recordButton.style.backgroundColor = "red";
      recordButton.style.color = "white";
      recordGif();
    }
  });

  var uiContainer = document.querySelector('#uiContainer');
  var hideUIButton = document.querySelector('#hideUI');
  function onUIHide() {
    if (uiContainer.style.display == "none") {
      uiContainer.style.display = "block"
      hideUIButton.innerHTML = "Hide UI"
    } else {
      uiContainer.style.display = "none"
      hideUIButton.innerHTML = "Show UI"
    }
  }
  if ('onpointerdown' in window) {
    hideUIButton.addEventListener('pointerdown', onUIHide);
  } else {
    hideUIButton.addEventListener('touchstart', onUIHide);
  }
}

function setupSliders() {
  speedSlider = new SliderInput(
    "settingsContainer",
    "Speed",
    "How fast simulation is calculated.", 1, speed, 200,
    function (slider) {
      speed = slider.value;
      if (!paused) {
        start();
      }
    }, "step");

  resolutionSlider = new SliderInput(
    "settingsContainer",
    "Grid size",
    "Simulation square grid size.", 1, gridSize, 30000,
    function (slider) {
      gridSize = slider.value;
      resize();
    }, "prtc");

    showVelocityToggle = new ToggleInput(
      "settingsContainer",
      "Show velocity",
      "Show velocity arrows grid. Decreases performance!",
      showVelocity,
    function(toggle) {
      showVelocity = toggle.checked;
      velocitySlider.hidden = !showVelocity;
      velocityTabs.hidden = !showVelocity;
      recalculateVelocityTexture();
      redraw();
    });

  velocitySlider = new SliderInput(
    "settingsContainer",
    "Arrow length",
    "Simulation grid size multiplicator.", 1, velocityScale, 1000,
    function (slider) {
      velocityScale = slider.value;
      recalculateVelocityTexture();
      redraw();
    }, null, !showVelocity);

  velocityTabs = new TabInputs("settingsContainer", "arrowColor", [
       {title: "HSV from arrow direcrtion.", image: "hsv-hex", selected: true},
       {title: "Black", image: "black-circle"},
       {title: "I will select myself"}], function (tab) {
         velocityColorType = tab.selected;
       }, !showVelocity);

  var colorPicker = document.createElement('input');
  colorPicker.type = "color";
  colorPicker.value = "#CC0000";
  colorPicker.style.height = "35px";
  colorPicker.addEventListener('input', function () {
    velocityColor = this.value.hexToRgb();
  });


  velocityTabs.elements[2].append(colorPicker);

  denoiseToggle = new ToggleInput(
    "postSettingsContainer",
    "Denoise",
    "Enable denoise postprocessing. Decreases performance!",
    denoise,
  function(toggle) {
    denoise = toggle.checked;
    recalculateDenoiseTexture();
    redraw();
  });

  toolSizeSlider = new SliderInput(
    "toolOptionsContainer",
    "Brush size",
    "Or Shift+Wheel", 1, toolRadius * 2, 1000,
    function (slider) {
      toolRadius = slider.value / 2;
    }, "X");

  tresholdSlider = new SliderInput(
    "toolOptionsContainer",
    "Treshold",
    "How dark pixels should be for a wall.", 1, imageToolTreshold, 1000,
    function (slider) {
      imageToolTreshold = slider.value;
    }, null, true);
}

// TOFO: Move to classes.
var g_setPresetElements;
var g_selectShapeElements;
function setPreset(elem, id) {
  for (var i = 0; i < g_setPresetElements.length; ++i) {
    g_setPresetElements[i].style.color = i == id ? "red" : "gray"
  }
  preset = id;
  updatePreset();
}
function selectTool(toolID) {

  if (toolID instanceof TabInputs) {
    toolID = toolID.selected;
  }

  tool = toolID == ToolType.nothing ? ToolType.clear : toolID;

  var optionsTitle = document.querySelector('#toolOptionsTitle');
  var option0 = document.querySelector('#selectShape0');
  var option1 = document.querySelector('#selectShape1');
  if (tool == ToolType.applyImage && !textures.apply) {
    loadImageToApply();
    optionsTitle.innerHTML = "How to apply"
    option0.style.backgroundImage = "url('./images/normal-image.png')"
    option0.title = "Normal image to walls";

    option1.style.backgroundImage = "url('./images/negative-image.png')"
    option1.style.backgroundColor = "black"
    option1.title = "Negative image to walls";

    tresholdSlider.show();

  } else {
    textures.apply = null;
    optionsTitle.innerHTML = "Shape"
    option0.style.backgroundImage = "url('./images/circle.png')"
    option0.title = "Circle";

    option1.style.backgroundImage = "url('./images/square.png')"
    option1.style.backgroundColor = ""
    option0.title = "Square";

    tresholdSlider.hide();
  }
}
function selectBrush(brushTabs) {
  brush = brushTabs.selected;
}
function selectDirection(directionTabs) {
  brushDirections = 0;
  directionTabs.selected.forEach((item, i) => {
    brushDirections |= 1 << item;
  });
}

function selectShape(elem, id) {
  for (var i = 0; i < g_selectShapeElements.length; ++i) {
    g_selectShapeElements[i].className = i == id ? "tabrow-tab tabrow-tab-opened-accented" : "tabrow-tab"
  }
  shape = id;
}

function setupButtons() {
 toolTabs = new TabInputs("toolTab", "tool", [
    {title: "Brush", image: "brush", selected: true},
    {title: "Clear", image: "erase"},
    {title: "Apply image", image: "apply-image"}], selectTool);
 brushTabs = new TabInputs("toolTab", "brush", [
  {title: "Fan (1)", image: "dryer", selected: true},
  {title: "Inpenetratable wall (2)", image: "wall"},
  {title: "Particle generator (3)", image: "fan"},
  {title: "Particle sink (4)", image: "sink"}], selectBrush);
  directionTabs = new MultiTabInputs("toolTab", "direction", [
   {title: "Up", value: "🡡", selected: true},
   {title: "Up-Right", value: "🡥", selected: true},
   {title: "Down-Right", value: "🡦", selected: true},
   {title: "Down", value: "🡣", selected: true},
   {title: "Down-Left", value: "🡧", selected: true},
   {title: "Up-Left", value: "🡤", selected: true},
   {title: "All", image: "hsv-hex", selected: true}], selectDirection);

  brushStrengthSlider = new SliderInput(
    "toolOptionsContainer",
    "Brush strength",
    "Or Alt+Wheel", 1, brushStrength, 127,
    function (slider) {
      brushStrength = slider.value;
    });

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
  fpsLabel = document.getElementById("fpsLabel");

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

function recordGif() {
  recording = true;

  const canvas = document.querySelector('#glcanvas');
  gif = new CanvasRecorder(canvas);
  gif.start();
}

function stopRecordingGif() {
  recording = false;

  gif.stop();
  gif.save('Gasomaton.webm');
  gif = null;
}
