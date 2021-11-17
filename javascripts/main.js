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
  applyImage: 3,
  clear: 128
};
// Tool for the left mouse button.
var tool = ToolType.fan;
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

var entry, adapter, device, context;

var pipelines, bindgroups, pathDescriptors;
var buffers, programs, framebuffers, textures, programVars;
var curDrag, prevDrag;
var cameraDest = [0., 0.];

var fps;
var fpsLabel;

var recording = false;
var gif;

var toolTabs;
var speedSlider, resolutionSlider;
var tresholdSlider, toolSizeSlider;
var showVelocityToggle, velocitySlider, velocityTabs;
var denoiseToggle;

main();

async function main() {
  await setupWebGPU();
  recalculateTextures();
  await setupShaderStructs();

  setupFps();

  setupDefault();
  start();

  setupButtons();
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
    Unable to initialize WebGPU. Your browser or machine may not support it.
    Use Google Chrome Canary for the best experience.
    Check out https://discussions.apple.com/thread/8655829 for Safari.
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


  // recalculateVelocityTexture();
  // recalculateDenoiseTexture();
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

function createTexture(wrap, filter, size, isFloat) {
    // var texture = gl.createTexture();
    // gl.bindTexture(gl.TEXTURE_2D, texture);
    // wrap = wrap == null ? gl.CLAMP_TO_EDGE : wrap;
    // filter = filter == null ? gl.LINEAR : filter;
    // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    //
    // gl.bindTexture(gl.TEXTURE_2D, texture);
    //
    // if (isFloat) {
    //   if (size) {
    //     gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, size[0], size[1],
    //                       0, gl.RGBA, gl.HALF_FLOAT, null);
    //   } else {
    //     gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, statesize[0], statesize[1],
    //                       0, gl.RGBA, gl.HALF_FLOAT, null);
    //   }
    // } else {
    //   if (size) {
    //     gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, size[0], size[1],
    //                       0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, null);
    //   } else {
    //     gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, statesize[0], statesize[1],
    //                       0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, null);
    //   }
    // }

    return device.createTexture({
      size: size ? [size[0], size[1], 1] : [statesize[0], statesize[1], 1],
      mipLevelCount: 1,
      format: 'rgba8uint',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    // return texture;
}

function createArray(data) {
    var buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return buffer;
}

function createImageFromTexture(texture, width, height) {
    // Create a framebuffer backed by the texture
    var framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    // Read the contents of the framebuffer
    var data = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, data);
    for (var i = 0; i < data.length; i++) {
      if (data[i] != 0 && data[i] != 128) {
        data[i] -= 1;
      }
    }

    gl.deleteFramebuffer(framebuffer);

    var canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    var context = canvas.getContext('2d');
    var imageData = context.createImageData(width, height);
    imageData.data.set(data);
    context.putImageData(imageData, 0, 0);

    return canvas.toDataURL("image/png").replace(/^data:image\/[^;]/, 'data:application/octet-stream');
}

function saveBase64AsFile(base64, fileName) {
    var link = document.createElement("a");

    document.body.appendChild(link); // for Firefox

    link.setAttribute("href", base64);
    link.setAttribute("download", fileName);
    link.click();
}

function save() {
  saveBase64AsFile(createImageFromTexture(textures.front, statesize[0], statesize[1]), "gasomaton.png");
}

function rgbaDataWithImage(image) {
  var canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;

  var context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);

  return context.getImageData(0, 0, image.width, image.height).data;
}

function createTextureFromImage(image) {
  statesize = [image.width, image.height];
  textures = {
      front: createTexture(gl.REPEAT, gl.NEAREST),
      back: createTexture(gl.REPEAT, gl.NEAREST)
  };

  recalculateVelocityTexture();

  const uiData = rgbaDataWithImage(image);
  var imgData = new Uint8Array(uiData);
  for (var i = 0; i < imgData.length; i++) {
    if (imgData[i] != 0 && imgData[i] != 128) {
      imgData[i] += 1;
    }
  }

  gl.bindTexture(gl.TEXTURE_2D, textures.front);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, statesize[0], statesize[1],
                      0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, imgData);
}

function load() {
  loadFile(createTextureFromImage);
}

function loadImageToApply() {
  loadFile(function (image) {

    const uiData = rgbaDataWithImage(image);

    const texture = createTexture(gl.REPEAT, gl.NEAREST, [image.width, image.height]);
    textures.apply = texture;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8UI, image.width, image.height,
                        0, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, uiData);
  })
}

function loadFile(completion) {
  var input = document.createElement('input');
  input.type = 'file';

  input.onchange = e => {

     // getting a hold of the file reference
     var file = e.target.files[0];

     // setting up the reader
     var reader = new FileReader();
     reader.readAsDataURL(file);

     // here we tell the reader what to do when it's done reading...
     reader.onload = readerEvent => {
        var content = readerEvent.target.result;
        const img = new Image();
        img.onload = function() {
          completion(img);
        }
        img.src = content;
     }

  }

  input.click();
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

function stepRandom() {
  stepProgram(OperationType.initializeRandom);
}

function stepWind() {
  stepProgram(OperationType.initializeWind);
}

function stepClear() {
  stepProgram(OperationType.clear);
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
  // {
  //   const passEncoder = commandEncoder.beginComputePass();
  //   passEncoder.setPipeline(computePipeline);
  //   passEncoder.setBindGroup(0, computeBindGroup);
  //   passEncoder.dispatch(Math.ceil(numParticles / 64));
  //   passEncoder.endPass();
  // }
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

  // gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers.step);
  // gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
  //                         gl.TEXTURE_2D, textures.back, 0);

  // gl.activeTexture(gl.TEXTURE0);
  // gl.bindTexture(gl.TEXTURE_2D, textures.front);

  // gl.viewport(0, 0, statesize[0], statesize[1]);

  // gl.useProgram(program);

  // drawScene(vars.quad);

  // gl.uniform1i(vars.state, 0);
  // gl.uniform1i(vars.operation, operation);
  // gl.uniform2f(vars.scale, statesize[0], statesize[1]);
  // gl.uniform1uiv(vars.colissionMap, colissionMap());

  // gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

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


  // const program = programs.copy;
  //
  // gl.activeTexture(gl.TEXTURE2);
  // gl.bindTexture(gl.TEXTURE_2D, textures.front);
  //
  // gl.activeTexture(gl.TEXTURE3);
  // gl.bindTexture(gl.TEXTURE_2D, textures.velocityMap);
  //
  // gl.viewport(0, 0, viewsize[0], viewsize[1]);
  //
  // gl.useProgram(program);
  //
  // gl.uniform1i(programVars.copy.state, 2);
  // gl.uniform1i(programVars.copy.velocityMap, 3);
  //
  // gl.uniform2f(programVars.copy.camera, camera[0], camera[1]);
  // gl.uniform1f(programVars.copy.zoom, zoom);
  // gl.uniform1i(programVars.copy.showVelocity, showVelocity ? 1 : 0);
  //
  // drawScene(programVars.copy.quad);
  // gl.uniform2f(programVars.copy.scale, viewsize[0], viewsize[1]);
  // gl.uniform2f(programVars.copy.size, statesize[0], statesize[1]);
  // gl.uniform2f(programVars.copy.resolution, resolution[0], resolution[1]);
  //
  // gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

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
      selectTool(index);
      toolTabs.selected = index;
    }
  })

  canvas.addEventListener("wheel", e => {
    e.preventDefault();

    const zoomAmount = -Math.sign(e.deltaY);

    if (e.shiftKey) {
      toolRadius += zoomAmount * (toolRadius / 20.0);
      toolSizeSlider.setValue(toolRadius * 2);
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
        if (paused) {
          stepNothing();
          redraw();
        }
      }
      if (!dragging && e.button == 0) {
        leftPressed = true;

        toolInUse = ToolMode.main;
        if (paused) {
          stepNothing();
          redraw();
        }
      }
  });

  canvas.addEventListener('pointermove', e => {
    if (gesturing) {
      return;
    }
    toolPosition = ScreenToState(e.offsetX, e.offsetY);
    if (paused) {
      stepNothing();
      redraw();
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
       {title: "I will select myself"}], function (index) {
         velocityColorType = index;
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
      if (paused) {
        stepNothing();
        redraw();
      }
    }, "X");

  tresholdSlider = new SliderInput(
    "toolOptionsContainer",
    "Treshold",
    "How dark pixels should be for a wall.", 1, imageToolTreshold, 1000,
    function (slider) {
      imageToolTreshold = slider.value;
      if (paused) {
        stepNothing();
        redraw();
      }
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

  tool = toolID == 2 ? 128 : toolID;

  var optionsTitle = document.querySelector('#toolOptionsTitle');
  var option0 = document.querySelector('#selectShape0');
  var option1 = document.querySelector('#selectShape1');
  if (tool == ToolType.applyImage && !textures.apply) {
    loadImageToApply();
    optionsTitle.innerHTML = "How to apply"
    option0.style.backgroundImage = "url('./images/normal-image.png')"
    option0.title = "Normal image";

    option1.style.backgroundImage = "url('./images/negative-image.png')"
    option1.style.backgroundColor = "black"
    option1.title = "Negative image";

    tresholdSlider.show()

  } else {
    textures.apply = null;
    optionsTitle.innerHTML = "Shape"
    option0.style.backgroundImage = "url('./images/circle.png')"
    option0.title = "Circle";

    option1.style.backgroundImage = "url('./images/square.png')"
    option1.style.backgroundColor = ""
    option0.title = "Square";

    tresholdSlider.hide()
  }
}
function selectShape(elem, id) {
  for (var i = 0; i < g_selectShapeElements.length; ++i) {
    g_selectShapeElements[i].className = i == id ? "tabrow-tab tabrow-tab-opened-accented" : "tabrow-tab"
  }
  shape = id;
  if (paused) {
    stepNothing();
    redraw();
  }
}

function setupButtons() {
 toolTabs = new TabInputs("toolTab", "tool", [
    {title: "Particle generator (1)", image: "fan", selected: true},
    {title: "Inpenetratable wall (2)", image: "wall"},
    {title: "Clear (right-click or 3)", image: "erase"},
    {title: "Apply image (4)", image: "apply-image"}], selectTool);

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
