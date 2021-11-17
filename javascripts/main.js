// Canvas size
var resolution;
// Drawing texture size
var viewsize;
// State texture size
var statesize;
// Computation texture resolution.
var gridSize = 1000.0; // max 8192
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

// How fast simulation is calculated.
var speed = 25;
var timers = [];
var animationTimer;
var paused = false;

var rulebookController;
var selectedBook;

// WebGPU stuff
var entry, adapter, device, context;
var pipelines, bindgroups, pathDescriptors, textures, programVars;

var curDrag, prevDrag;
var cameraDest = [0., 0.];

var fps;
var fpsLabel;

var speedSlider, resolutionSlider;

main();

async function main() {
  await setupWebGPU();
  recalculateTextures();
  await setupShaderStructs();

  setupFps();

  setupDefault();
  start();

  setupRulebookUI();
  setupEventHandlers();
}

async function setupWebGPU() {
  try {
    entry = navigator.gpu;
    adapter = await navigator.gpu.requestAdapter();
    device = await adapter.requestDevice();

    const canvas = document.querySelector('#glcanvas');
    context = canvas.getContext('webgpu');
  } catch (e) {
    const text = `
    Unable to initialize WebGPU. I'm working only in
    Google Chrome Canary with 'Unsafe WebGPU' in chrome://flags/

    Or check out the main Gasomaton version.
    `;
    alert(text);
  }
}

function makeRequest(method, url) {
    return new Promise(function (resolve, reject) {
        let xhr = new XMLHttpRequest();
        xhr.open(method, url);
        xhr.onload = function () {
            if (this.status >= 200 && this.status < 300) {
                resolve(xhr.response);
            } else {
                reject({
                    status: this.status,
                    statusText: xhr.statusText
                });
            }
        };
        xhr.onerror = function () {
            reject({
                status: this.status,
                statusText: xhr.statusText
            });
        };
        xhr.send();
    });
}

async function loadFil(file) {
  return await makeRequest('GET', file);
}

async function setupShaderStructs() {
  pipelines = {};
  pathDescriptors = {};
  programVars = {};
  bindgroups = {};

  await setupDrawingShader();
  await setupComputationShader();
}

async function setupDrawingShader() {
  const uniformBufferSize =
    2 * 4 + // scale: vec2<f32>;
    4 + // padding
    2 * 4 + // size: vec2<f32>;
    4 + // padding
    2 * 4 + // camera: vec2<f32>;
    4 + // padding
    2 * 4 + // resolution: vec2<f32>;
    4; // zoom: f32;

  const uniformBuffer = device.createBuffer({
    size: uniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  var bindGroupLayout = device.createBindGroupLayout({
    entries: [{
          binding: 0,

          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" }
        }, {
          binding: 1,

          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "uint", viewDimension: "2d", multisampled: false }
      }
    ]
  });

  const uniformBindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [{
        binding: 0,
        resource: {
          buffer: uniformBuffer,
        },
      }, {
        binding: 1,
        resource: textures.front.createView(),
      },
    ],
  });

  pipelines.copy = initPipeline(await loadFil('./javascripts/shaders/drawingShader.wgsl'), bindGroupLayout);
  pathDescriptors.copy = {
    colorAttachments: [
      {
        view: undefined, // Assigned later
        loadValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
        storeOp: 'store',
      },
    ],
  };
  programVars.copy = uniformBuffer;
  bindgroups.copy = uniformBindGroup;
}

async function setupComputationShader() {
  var bindGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0,

      visibility: GPUShaderStage.FRAGMENT,
      buffer: { type: "uniform" }
    }, {
      binding: 1,

      visibility: GPUShaderStage.FRAGMENT,
      buffer: { type: "storage" }
    }, {
      binding: 2,

      visibility: GPUShaderStage.FRAGMENT,
      texture: { sampleType: "uint", viewDimension: "2d", multisampled: false }
    }]
  });

  const uniformBufferSize =
    2 * 4 + // scale: vec2<f32>;
    4 + // padding
    4; // operation: i32;

  const uniformBuffer = device.createBuffer({
    size: uniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const storageBufferSize =
    129 * 4; // map: array<u32>;

  const storageBuffer = device.createBuffer({
    size: storageBufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const groupDescription = {
    layout: bindGroupLayout,
    entries: [{
        binding: 0,
        resource: {
          buffer: uniformBuffer,
        },
      }, {
        binding: 1,
        resource: {
          buffer: storageBuffer,
        },
      }, {
        binding: 2,
        resource: textures.back.createView(),
      },
    ],
  };

  const uniformBindGroup = device.createBindGroup(groupDescription);

  pipelines.col = initPipeline(await loadFil('./javascripts/shaders/computationShader.wgsl'), bindGroupLayout, 'rgba8uint');
  pathDescriptors.col = {
    colorAttachments: [
      {
        view: undefined, // Assigned later
        loadValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
        storeOp: 'store',
      },
    ],
  };
  programVars.colDescription = groupDescription;
  programVars.colUniform = uniformBuffer;
  programVars.colStorage = storageBuffer;
  bindgroups.col = uniformBindGroup;
}

function setupDefault() {
  rulebookController = new RulesController(function () {
    selectedBook = rulebookController.selectedBook;
  });

  selectedBook = rulebookController.selectedBook;

  zoom = 70 / statesize[0];
  camera = [-viewsize[0] / 4.0, -viewsize[0] / 4.0];

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
  textures.back = createTexture();
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

  const presentationFormat = context.getPreferredFormat(adapter);

  context.configure({
    device: device,
    format: presentationFormat,
    size: resolution,
  });

  textures = {
      front: createTexture(),
      back: createTexture()
  };
  textures.selected = textures.back;
}

function initPipeline(shaderCode, layout, format) {
  let pipelineLayout = device.createPipelineLayout({bindGroupLayouts: [layout]});
  return device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: {
      module: device.createShaderModule({
        code: shaderCode,
      }),
      entryPoint: 'vs_main',
    },
    fragment: {
      module: device.createShaderModule({
        code: shaderCode,
      }),
      entryPoint: 'fs_main',
      // buffers: [
      //   {
      //     // instanced particles buffer
      //     arrayStride: 4 * 4,
      //     stepMode: 'instance',
      //     attributes: [
      //       {
      //         // position
      //         shaderLocation: 0,
      //         offset: 0,
      //         format: 'float32x2',
      //       },
      //       {
      //         // color
      //         shaderLocation: 1,
      //         offset: 2 * 4,
      //         format: 'float32x2',
      //       },
      //     ],
      //   },
      // ],
      targets: [
        {
          format: (format ? format : context.getPreferredFormat(adapter)),
        },
      ],
      // targets: [
      //   {
      //     format: context.getPreferredFormat(adapter),
      //     blend: {
      //       color: {
      //         srcFactor: 'src-alpha',
      //         dstFactor: 'one',
      //         operation: 'add',
      //       },
      //       alpha: {
      //         srcFactor: 'zero',
      //         dstFactor: 'one',
      //         operation: 'add',
      //       },
      //     },
      //   },
      // ],
    },
    primitive: {
      topology: 'triangle-list',
    },

    // depthStencil: {
    //   depthWriteEnabled: false,
    //   depthCompare: 'less',
    //   format: 'depth24plus',
    // },
  });
}

function createTexture(size) {

    return device.createTexture({
      size: size ? [size[0], size[1], 1] : [statesize[0], statesize[1], 1],
      mipLevelCount: 1,
      format: 'rgba8uint',
      usage: 4 | //GPUTextureUsage.TEXTURE_BINDING
        8 | //GPUTextureUsage.STORAGE_BINDING
        2 | //GPUTextureUsage.COPY_DST
        16, //GPUTextureUsage.RENDER_ATTACHMENT
    });
}

function swap() {
  var groupDescription = programVars.colDescription;

  if (textures.selected == textures.back) {
    textures.selected = textures.front;
  } else {
    textures.selected = textures.back;
  }

  groupDescription.entries[2].resource = textures.selected.createView();

  programVars.colDescription = groupDescription;
  bindgroups.col = device.createBindGroup(groupDescription);
}

function updatePreset() {
  stepProgram(preset);
  redraw();
}

function stepResize(oldSize) {
  stepProgram(OperationType.resize, oldSize);
}

function stepWind() {
  stepProgram(OperationType.initializeWind);
}

function stepNothing() {
  stepProgram(OperationType.nothing);
}

function step() {
  stepProgram(OperationType.collision);
}

function stepProgram(operation, oldSize) {

  // if (!pathDescriptors.col.colorAttachments[0].view) {
    device.queue.writeBuffer(
      programVars.colUniform,
      0,
        new Float32Array([
          statesize[0],  statesize[1], // scale
          operation
      ])
    );
    device.queue.writeBuffer(
      programVars.colStorage,
      0,
      new Uint32Array(colissionMap())
    );
  // }
  
  if (textures.back == textures.selected) {
    pathDescriptors.col.colorAttachments[0].view = textures.front.createView();
  } else {
    pathDescriptors.col.colorAttachments[0].view = textures.back.createView();
  }
  

  const commandEncoder = device.createCommandEncoder();
  {
    const passEncoder = commandEncoder.beginRenderPass(pathDescriptors.col);

    // bindgroups.col.entries[2].resource = textures.front.createView();
    passEncoder.setPipeline(pipelines.col);
    passEncoder.setBindGroup(0, bindgroups.col);
    // passEncoder.setVertexBuffer(0, initBuffers(device));
    passEncoder.draw(6, 1, 0, 0);
    passEncoder.endPass();
  }

  device.queue.submit([commandEncoder.finish()]);

  swap();
}

function redraw() {

  // if (!pathDescriptors.copy.colorAttachments[0].view) {
    device.queue.writeBuffer(
      programVars.copy,
      0,
        new Float32Array([
        viewsize[0],  viewsize[1], // scale
        // 0, // padding
        statesize[0], statesize[1], // size
        // 0, // padding
        camera[0], camera[1], // camera
        // 0, // padding
        resolution[0], resolution[1], // resolution
        zoom
      ])
    );
    
    
  // }
  const swapChainTexture = context.getCurrentTexture();
  pathDescriptors.copy.colorAttachments[0].view = swapChainTexture.createView();

    const commandEncoder = device.createCommandEncoder();
    // {
    //   const passEncoder = commandEncoder.beginComputePass();
    //   passEncoder.setPipeline(computePipeline);
    //   passEncoder.setBindGroup(0, computeBindGroup);
    //   passEncoder.dispatch(Math.ceil(numParticles / 64));
    //   passEncoder.endPass();
    // }
    {
      const passEncoder = commandEncoder.beginRenderPass(pathDescriptors.copy);

      // bindgroups.copy.entries[1].resource = textures.front.createView();
      passEncoder.setPipeline(pipelines.copy);
      passEncoder.setBindGroup(0, bindgroups.copy);
      // passEncoder.setVertexBuffer(0, initBuffers(device));
      passEncoder.draw(6, 1, 0, 0);
      passEncoder.endPass();
    }

    device.queue.submit([commandEncoder.finish()]);

  fpsLabel.innerHTML = "fps: " + fps;
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
  })

  canvas.addEventListener("wheel", e => {
    e.preventDefault();

    const zoomAmount = -Math.sign(e.deltaY);
    const cameraFp = ScreenToPt(e.pageX, e.pageY);

    zoom += zoomAmount * (zoom / 20.0);
    const cameraFpNew = ScreenToPt(e.pageX, e.pageY);
    const fpXDelta = cameraFpNew[0] - cameraFp[0];
    const fpYDelta = cameraFpNew[1] - cameraFp[1];

    cameraDest[0] += fpXDelta;
    cameraDest[1] += fpYDelta;

    camera[0] = (camera[0] + fpXDelta) * 0.8 + cameraDest[0] * 0.2;
    camera[1] = (camera[1] + fpYDelta) * 0.8 + cameraDest[1] * 0.2;
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
  });

  canvas.addEventListener('pointermove', e => {
    if (gesturing) {
      return;
    }
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
  });

  window.addEventListener('resize', function() {
    resizeView();
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
