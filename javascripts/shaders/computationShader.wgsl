[[block]] struct ComputeParams {
  scale: vec2<f32>;
  operation: f32;
};

[[block]] struct CollisionBuffer {
  map: array<u32>;
};

[[binding(0), group(0)]] var<uniform> compute_params: ComputeParams;
[[binding(1), group(0)]] var<storage> colission: CollisionBuffer;
[[binding(2), group(0)]] var state : texture_2d<u32>;

struct VertexOutput {
  [[builtin(position)]] quad_pos: vec4<f32>;
};

let Nothing: u32=0u; let E: u32=1u; let SE: u32=2u; let SW: u32=4u; let W: u32=8u; let NW: u32=16u; let NE: u32=32u; let REST: u32=64u; let BOUNDARY: u32=128u;
let collision = 0; let initializeRandom = 1; let initializeWind = 2; let resize = 3; let clear = 4; let applyImage = 5;

// square root of 3 over 2
let hex_factor: f32 = 0.8660254037844386;

fn periodicCoordinatePart(k: i32, maxk: i32) -> i32 {
    if (k < 0) {
        return k + maxk;
    } else {
      if (k == maxk) {
        return 0;
      }
    }
    return k;
}

fn periodicCoordinate(k: vec2<i32>, maxK: vec2<i32>) -> vec2<i32> {
  return vec2<i32>(periodicCoordinatePart(k.x, maxK.x), periodicCoordinatePart(k.y, maxK.y));
}

//   |2|1|
// |3|*|0|
//   |4|5|
var<private> oddNbors: array<vec2<i32>, 6> = array<vec2<i32>, 6>(vec2<i32>(1, 0), vec2<i32>(1, 1), vec2<i32>(0, 1), vec2<i32>(-1, 0), vec2<i32>(0, -1), vec2<i32>(1, -1));
// |2|1|
// |3|*|0|
// |4|5|
var<private> evenNbors: array<vec2<i32>, 6> = array<vec2<i32>, 6>(vec2<i32>(1, 0), vec2<i32>(0, 1), vec2<i32>(-1, 1), vec2<i32>(-1, 0), vec2<i32>(-1, -1), vec2<i32>(0, -1));

fn calcCollision(data: vec4<u32>, position: vec2<i32>, state: texture_2d<u32>) -> u32 {
  let prtcl: u32 = data.x;

  if (prtcl == BOUNDARY) { return prtcl; }

  var result = prtcl & REST;
  var nbors = oddNbors;
  if (position.y % 2 == 0) {
    nbors = evenNbors;
  }

  let iScale = vec2<i32>(compute_params.scale);
  var nborPosition: vec2<i32>;
  var nbor: u32;
  var odir = 3u;
  for (var dir = 0u; dir < 6u; dir = dir+1u) {
    nborPosition = periodicCoordinate(position + nbors[odir], iScale);
    nbor = textureLoad(state, nborPosition, 0).x;
    if (nbor != BOUNDARY) {
      // accept an inbound particle travelling in this direction, if there is one
      result = result | (nbor & (1u << dir));
    } else {
      if ((prtcl & (1u << odir)) != 0u) {
        // or if the neighbor is a boundary then reverse one of our own particles
        result = result | (1u << dir);
      }
    }

    odir = (odir + 1u) % 6u;
  }
  return colission.map[result];
}

fn generateWind(data: vec4<u32>, position: vec2<i32>) -> u32 {
  let pos = vec2<f32>(position);
  let scale = compute_params.scale;
  if (pos.x < scale.x * 0.02 || pos.x > scale.x * 0.98 ||
      (pos.y < scale.y * 0.82 && pos.y > scale.y * 0.8 && pos.x < scale.x * 0.6 && pos.x > scale.x * 0.4)) {
      return BOUNDARY;
  } else {
    if (pos.y > scale.y * 0.01) {
      return NE+NW;
    }
  }
  return data.x;
}

[[stage(vertex)]]
fn vs_main([[builtin(vertex_index)]] VertexIndex : u32)
     -> [[builtin(position)]] vec4<f32> {
  var pos = array<vec2<f32>, 6>(
      vec2<f32>( 1.0,  1.0),
      vec2<f32>( 1.0, -1.0),
      vec2<f32>(-1.0, -1.0),
      vec2<f32>( 1.0,  1.0),
      vec2<f32>(-1.0, -1.0),
      vec2<f32>(-1.0,  1.0));

  return vec4<f32>(pos[VertexIndex], 0.0, 1.0);
}

[[stage(fragment)]]
fn fs_main(in : VertexOutput) -> [[location(0)]] vec4<u32> {
  let pos: vec2<f32> = in.quad_pos.xy;
  let position: vec2<i32> = vec2<i32>(pos);
  var data: vec4<u32> = textureLoad(state, position, 0);

  if (i32(compute_params.operation) == collision) {
    data.x = calcCollision(data, position, state);
    return data;
  }

  data.x = generateWind(data, position);
  return data;
}
