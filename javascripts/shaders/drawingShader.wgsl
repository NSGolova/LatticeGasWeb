let Nothing: u32=0u; let E: u32=1u; let SE: u32=2u; let SW: u32=4u; let W: u32=8u; let NW: u32=16u; let NE: u32=32u; let REST: u32=64u; let BOUNDARY: u32=128u;

// square root of 3 over 2
let hex_factor: f32 = 0.8660254037844386;

var<private> ci: array<vec2<f32>, 6> = array<vec2<f32>, 6>(
  vec2<f32>(1., 0.),
  vec2<f32>(0.5, 0.866025),
  vec2<f32>(-0.5, 0.866025),
  vec2<f32>(-1., 0.),
  vec2<f32>(-0.5, -0.866025),
  vec2<f32>(0.5, -0.866025));

//////////////////////////////////////////////////////////////////////
// Given a 2D position, find integer coordinates of center of nearest
// hexagon in plane.

fn nearestHexCell(pos: vec2<f32>) -> vec2<f32> {

    // integer coords in hex center grid -- will need to be adjusted
    let gpos = vec2<f32>(pos.x / hex_factor, pos.y);
    var hex_int = floor(gpos);

    // adjust integer coords
    let sy = step(2.0, ((hex_int.x+1.0) % 4.0));
    hex_int = hex_int + (vec2<f32>(hex_int.x % 2.0, (hex_int.y + sy) % 2.0));

    // difference vector
    let gdiff = gpos - hex_int;

    // figure out which side of line we are on and modify
    // hex center if necessary
    if (dot(abs(gdiff), vec2<f32>(hex_factor*hex_factor, 0.5)) > 1.0) {
        hex_int = hex_int + sign(gdiff) * vec2<f32>(2.0, 1.0);
    }

    return vec2<f32>(hex_int.y, hex_int.x);
}

fn hsv2rgb(c: vec3<f32>) -> vec3<f32> {
    let K = vec4<f32>(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    let p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, vec3<f32>(0.0, 0.0, 0.0), vec3<f32>(1.0, 1.0, 1.0)), c.y);
}

fn vectorAngleColor(v: vec2<f32>) -> vec4<f32> {
    let angle = 0.5 + atan2(v.y, v.x);
    return vec4<f32>(hsv2rgb(vec3<f32>(angle, 1.0, 1.0)), 1.0);
}

fn velocityFromParticle(prtc: u32) -> vec2<f32> {
  var velocity = vec2<f32>(0.0, 0.0);
  for (var i: u32 = 0u; i < 6u; i = i+1u) {
    if ((prtc & (1u << i)) != 0u) {
      velocity = velocity + ci[i];
    }
  }
  return velocity;
}

fn colorAt(pos: vec2<i32>, state: texture_2d<u32>) -> vec4<f32> {
  var angleColor: vec4<f32>;

  let data: vec4<u32> = textureLoad(state, pos, 0);
  if (data.y == 1u) {
    angleColor = vec4<f32>(1.0, 1.0, 1.0, 1.0);
  } else {
    let prtcl: u32 = data.x;

    switch (prtcl) {
      case 0u: {
        angleColor = vec4<f32>(0.0, 0.0, 0.0, 1.0);
        break;
      }
      case 128u: {
        angleColor = vec4<f32>(0.9, 0.9, 0.9, 1.0);
        break;
      }
      case 64u: {
        angleColor = vec4<f32>(0.6, 0.6, 0.6, 1.0);
        break;
      }
      default: {
        angleColor = vectorAngleColor(velocityFromParticle(prtcl));
      }
    }
  }

  return angleColor;
}

struct VertexOutput {
  [[builtin(position)]] quad_pos : vec4<f32>;
};

[[block]] struct RenderParams {
  scale: vec2<f32>;
  size: vec2<f32>;
  camera: vec2<f32>;
  resolution: vec2<f32>;
  zoom: f32;
};

[[binding(0), group(0)]] var<uniform> render_params : RenderParams;
[[binding(1), group(0)]] var state : texture_2d<u32>;

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
fn fs_main(in : VertexOutput) -> [[location(0)]] vec4<f32> {
  var size = render_params.size;
  var npos = (((in.quad_pos.xy - render_params.resolution * 0.5) / render_params.scale) / render_params.zoom - render_params.camera / render_params.scale * vec2<f32>(1.0, 1.0)) * size * 2.0;
  npos = npos + render_params.size * 0.5;

  var sqrPos = vec2<f32>(npos / 2.0).yx;
  sqrPos.y = sqrPos.y / hex_factor;

  if ((sqrPos.x < 0.0 || sqrPos.y < 0.0)
  || (sqrPos.x > size.x || sqrPos.y > size.y)) {
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
  }

  var pos: vec2<i32>;
  if (render_params.zoom < 0.3) {
    pos = vec2<i32>(sqrPos);
  } else {
    let hexPos = nearestHexCell(npos) / 2.0;
    pos = vec2<i32>(hexPos);
  }

  return colorAt(pos, state);
}
