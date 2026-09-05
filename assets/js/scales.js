(function () {
  "use strict";
  function mIdentity() {
    return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  }
  function mMul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] +
                       a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
    }
    return o;
  }
  function mTranslate(x, y, z) {
    const m = mIdentity(); m[12] = x; m[13] = y; m[14] = z; return m;
  }
  function mRotX(a) {
    const c = Math.cos(a), s = Math.sin(a), m = mIdentity();
    m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m;
  }
  function mRotY(a) {
    const c = Math.cos(a), s = Math.sin(a), m = mIdentity();
    m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m;
  }
  function mRotZ(a) {
    const c = Math.cos(a), s = Math.sin(a), m = mIdentity();
    m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m;
  }
  function mPerspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    const m = new Float32Array(16);
    m[0] = f / aspect; m[5] = f; m[10] = (far + near) * nf;
    m[11] = -1; m[14] = 2 * far * near * nf;
    return m;
  }
  function mLookAt(eye, tgt, up) {
    let zx = eye[0] - tgt[0], zy = eye[1] - tgt[1], zz = eye[2] - tgt[2];
    let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([
      xx, yx, zx, 0,
      xy, yy, zy, 0,
      xz, yz, zz, 0,
      -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
      -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
      -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1
    ]);
  }
  function makeMesh() { return { pos: [], nrm: [], idx: [] }; }
  function lathe(profile, seg) {
    const m = makeMesh();
    const n = profile.length;
    const pn = [];
    for (let i = 0; i < n; i++) {
      const p = profile[Math.max(i - 1, 0)];
      const q = profile[Math.min(i + 1, n - 1)];
      let tx = q[0] - p[0], ty = q[1] - p[1];
      const len = Math.hypot(tx, ty) || 1;
      tx /= len; ty /= len;
      pn.push([ty, -tx]);           // поворот касательной на 90°
    }
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      for (let j = 0; j < n; j++) {
        const r = profile[j][0], y = profile[j][1];
        m.pos.push(ca * r, y, sa * r);
        const nr = pn[j][0], ny = pn[j][1];
        const l = Math.hypot(nr, ny) || 1;
        m.nrm.push(ca * nr / l, ny / l, sa * nr / l);
      }
    }
    for (let i = 0; i < seg; i++) {
      for (let j = 0; j < n - 1; j++) {
        const a = i * n + j, b = (i + 1) * n + j;
        m.idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    return m;
  }
  function torus(R, r, segU, segV) {
    const m = makeMesh();
    for (let i = 0; i <= segU; i++) {
      const u = (i / segU) * Math.PI * 2, cu = Math.cos(u), su = Math.sin(u);
      for (let j = 0; j <= segV; j++) {
        const v = (j / segV) * Math.PI * 2, cv = Math.cos(v), sv = Math.sin(v);
        m.pos.push((R + r * cv) * cu, r * sv, (R + r * cv) * su);
        m.nrm.push(cv * cu, sv, cv * su);
      }
    }
    for (let i = 0; i < segU; i++) {
      for (let j = 0; j < segV; j++) {
        const a = i * (segV + 1) + j, b = a + segV + 1;
        m.idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    return m;
  }
  function sphere(r, segU, segV) {
    const m = makeMesh();
    for (let i = 0; i <= segV; i++) {
      const v = (i / segV) * Math.PI, sv = Math.sin(v), cv = Math.cos(v);
      for (let j = 0; j <= segU; j++) {
        const u = (j / segU) * Math.PI * 2;
        const x = sv * Math.cos(u), y = cv, z = sv * Math.sin(u);
        m.pos.push(x * r, y * r, z * r);
        m.nrm.push(x, y, z);
      }
    }
    for (let i = 0; i < segV; i++) {
      for (let j = 0; j < segU; j++) {
        const a = i * (segU + 1) + j, b = a + segU + 1;
        m.idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    return m;
  }
  function merge(dst, src, mat) {
    const off = dst.pos.length / 3;
    const n = src.pos.length / 3;
    for (let i = 0; i < n; i++) {
      const x = src.pos[i * 3], y = src.pos[i * 3 + 1], z = src.pos[i * 3 + 2];
      if (mat) {
        dst.pos.push(
          mat[0] * x + mat[4] * y + mat[8] * z + mat[12],
          mat[1] * x + mat[5] * y + mat[9] * z + mat[13],
          mat[2] * x + mat[6] * y + mat[10] * z + mat[14]
        );
        const nx = src.nrm[i * 3], ny = src.nrm[i * 3 + 1], nz = src.nrm[i * 3 + 2];
        const rx = mat[0] * nx + mat[4] * ny + mat[8] * nz;
        const ry = mat[1] * nx + mat[5] * ny + mat[9] * nz;
        const rz = mat[2] * nx + mat[6] * ny + mat[10] * nz;
        const l = Math.hypot(rx, ry, rz) || 1;
        dst.nrm.push(rx / l, ry / l, rz / l);
      } else {
        dst.pos.push(x, y, z);
        dst.nrm.push(src.nrm[i * 3], src.nrm[i * 3 + 1], src.nrm[i * 3 + 2]);
      }
    }
    for (let i = 0; i < src.idx.length; i++) dst.idx.push(src.idx[i] + off);
    return dst;
  }
  const BEAM_Y = 0.92;
  const BEAM_HALF = 1.02;
  const HANG = 0.60;
  const PAN_R = 0.36;
  function buildStand() {
    const g = makeMesh();
    merge(g, lathe([
      [0.000, -1.300], [0.430, -1.300], [0.452, -1.290], [0.458, -1.270],
      [0.446, -1.250], [0.408, -1.238],
      [0.398, -1.216], [0.412, -1.198], [0.396, -1.180],
      [0.336, -1.166], [0.304, -1.144],
      [0.298, -1.124], [0.312, -1.108], [0.296, -1.092],
      [0.238, -1.074], [0.196, -1.044],
      [0.160, -1.002], [0.134, -0.950], [0.125, -0.900]
    ], 96));
    merge(g, lathe([
      [0.125, -0.90], [0.118, -0.70],
      [0.126, -0.665], [0.134, -0.635], [0.126, -0.605], [0.112, -0.575],
      [0.105, -0.30], [0.098, 0.05],
      [0.106, 0.085], [0.114, 0.115], [0.106, 0.145], [0.094, 0.175],
      [0.088, 0.50], [0.082, 0.72],
      [0.092, 0.75], [0.100, 0.775], [0.092, 0.80], [0.080, 0.825],
      [0.074, 0.86]
    ], 96));
    merge(g, torus(0.1135, 0.0085, 56, 12), mTranslate(0, -0.45, 0));
    merge(g, torus(0.1055, 0.0065, 56, 12), mTranslate(0, -0.16, 0));
    merge(g, torus(0.0975, 0.0080, 56, 12), mTranslate(0, 0.30, 0));
    merge(g, torus(0.0885, 0.0060, 56, 12), mTranslate(0, 0.615, 0));
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      merge(g, sphere(0.0165, 14, 10),
        mTranslate(Math.cos(a) * 0.1205, -0.757, Math.sin(a) * 0.1205));
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + 0.2;
      merge(g, sphere(0.0125, 14, 10),
        mTranslate(Math.cos(a) * 0.0865, 0.437, Math.sin(a) * 0.0865));
    }
    merge(g, torus(0.1105, 0.0055, 56, 12), mTranslate(0, -0.30, 0));
    merge(g, torus(0.1098, 0.0055, 56, 12), mTranslate(0, -0.27, 0));
    merge(g, torus(0.1045, 0.0055, 56, 12), mTranslate(0, 0.00, 0));
    merge(g, torus(0.1038, 0.0055, 56, 12), mTranslate(0, 0.03, 0));
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.4;
      merge(g, sphere(0.0105, 14, 10),
        mTranslate(Math.cos(a) * 0.0855, 0.665, Math.sin(a) * 0.0855));
    }
    merge(g, torus(0.128, 0.0105, 56, 14), mTranslate(0, -0.878, 0));
    merge(g, lathe([
      [0.074, 0.86], [0.105, 0.885], [0.115, 0.905],
      [0.105, 0.925], [0.075, 0.945], [0.045, 0.975],
      [0.030, 1.005], [0.000, 1.030]
    ], 72));
    return g;
  }
  function buildBeam() {
    const g = makeMesh();
    const arm = lathe([
      [0.000, 0.00], [0.052, 0.02], [0.058, 0.06],
      [0.046, 0.30], [0.038, 0.62], [0.033, 0.90],
      [0.040, 0.945], [0.046, 0.975], [0.038, 1.000],
      [0.026, 1.015], [0.000, 1.022]
    ], 56);
    merge(g, arm, mMul(mRotZ(-Math.PI / 2), mIdentity()));
    merge(g, arm, mMul(mRotZ(Math.PI / 2), mIdentity()));
    merge(g, lathe([
      [0.000, -0.10], [0.055, -0.095], [0.075, -0.06],
      [0.082, 0.00], [0.075, 0.06], [0.055, 0.095], [0.000, 0.10]
    ], 64));
    merge(g, torus(0.088, 0.020, 64, 20));
    merge(g, lathe([
      [0.000, -0.34], [0.010, -0.30], [0.018, -0.16], [0.020, -0.06], [0.000, -0.04]
    ], 40));
    for (let sgn = -1; sgn <= 1; sgn += 2) {
      merge(g, torus(0.040, 0.0085, 40, 12),
        mMul(mTranslate(sgn * 0.905, 0, 0), mRotZ(Math.PI / 2)));
      merge(g, torus(0.036, 0.0075, 40, 12),
        mMul(mTranslate(sgn * 0.955, 0, 0), mRotZ(Math.PI / 2)));
      merge(g, sphere(0.030, 24, 16), mTranslate(sgn * 1.012, 0, 0));
    }
    merge(g, torus(0.062, 0.010, 48, 14), mTranslate(0, 0.118, 0));
    return g;
  }
  function buildPanRig() {
    const g = makeMesh();
    merge(g, torus(0.032, 0.011, 40, 14), mTranslate(0, 0.012, 0));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
      const ex = Math.cos(a) * PAN_R * 0.80, ez = Math.sin(a) * PAN_R * 0.80;
      const len = Math.hypot(ex, HANG, ez);
      const tilt = Math.atan2(Math.hypot(ex, ez), HANG);
      const spin = Math.atan2(ez, ex);
      const rod = lathe([
        [0.000, 0], [0.0075, 0.012], [0.0068, len * 0.5], [0.0075, len - 0.012], [0.000, len]
      ], 14);
      merge(g, rod, mMul(mRotY(-spin), mRotZ(Math.PI - tilt)));
      merge(g, sphere(0.014, 16, 12),
        mTranslate(ex, -HANG + 0.004, ez));
    }
    return g;
  }
  function buildPanBowl() {
    const g = makeMesh();
    merge(g, lathe([
      [0.000, -HANG - 0.075],
      [0.10, -HANG - 0.072], [0.20, -HANG - 0.062], [0.28, -HANG - 0.046],
      [0.335, -HANG - 0.026], [PAN_R, -HANG - 0.006],
      [PAN_R + 0.012, -HANG + 0.004], [PAN_R + 0.008, -HANG + 0.016],
      [PAN_R - 0.010, -HANG + 0.018], [PAN_R - 0.022, -HANG + 0.010],
      [0.30, -HANG - 0.014], [0.20, -HANG - 0.034], [0.10, -HANG - 0.046],
      [0.000, -HANG - 0.050]
    ], 80));
    merge(g, torus(0.255, 0.0055, 64, 12), mTranslate(0, -HANG - 0.058, 0));
    return g;
  }
  const VERT_OBJ = `
attribute vec3 aPos;
attribute vec3 aNrm;
uniform mat4 uProj, uView, uModel;
varying vec3 vN, vW;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vW = w.xyz;
  vN = mat3(uModel) * aNrm;
  gl_Position = uProj * uView * w;
}`;
  const ENV_GLSL = `
uniform vec3 uKey;      // направление ключевого света (ходит за курсором)
uniform vec3 uRim;      // контровой
uniform float uTime;
vec3 softbox(vec3 d, vec3 dir, vec3 tint, float tight, float wide, float power) {
  if (dot(d, dir) <= 0.0) return vec3(0.0);
  vec3 across = normalize(cross(dir, vec3(0.0, 1.0, 0.0)));
  vec3 along = cross(across, dir);
  float a = dot(d, across);
  float b = dot(d, along);
  return tint * exp(-a * a * tight) * exp(-b * b * wide) * power;
}
vec3 envColor(vec3 d, float rough) {
  float b = clamp(rough * 2.2, 0.0, 1.0);   // 0 — зеркало, 1 — матовое
  float y = d.y;
  vec3 sky   = mix(vec3(0.24, 0.180, 0.120), vec3(1.06, 0.79, 0.36),
                   smoothstep(-0.02, 0.42, y));
  vec3 floorC = mix(vec3(0.075, 0.052, 0.034), vec3(0.021, 0.014, 0.009),
                   smoothstep(0.0, -0.55, y));
  vec3 c = y > 0.0 ? sky : floorC;
  c += vec3(0.95, 0.62, 0.24) * exp(-abs(y) * mix(18.0, 5.5, b)) * mix(0.52, 0.30, b);
  float k = max(dot(d, uKey), 0.0);
  c += vec3(1.00, 0.94, 0.80) * pow(k, mix(190.0, 26.0, b)) * mix(1.1, 0.35, b);
  c += vec3(1.00, 0.82, 0.52) * pow(k, mix(26.0, 9.0, b))    * mix(0.20, 0.15, b);
  c += vec3(0.90, 0.70, 0.42) * pow(k, 3.0)                  * 0.19;
  c += softbox(d, normalize(vec3(-0.985, 0.26, 0.02)), vec3(1.00, 0.95, 0.84),
               mix(140.0, 26.0, b), mix(2.8, 1.1, b), mix(1.15, 0.55, b));
  c += softbox(d, normalize(vec3( 0.975, 0.17, 0.04)), vec3(1.00, 0.84, 0.58),
               mix(120.0, 22.0, b), mix(4.0, 1.6, b), mix(0.55, 0.30, b));
  float r = max(dot(d, uRim), 0.0);
  c += vec3(0.54, 0.64, 0.86) * pow(r, mix(30.0, 10.0, b)) * mix(0.75, 0.40, b);
  c += vec3(0.26, 0.32, 0.46) * pow(r, 6.0)                * 0.19;
  return c;
}`;
  const FRAG_OBJ = `
precision highp float;
varying vec3 vN, vW;
uniform vec3 uEye;
uniform float uRough;
uniform vec3 uF0;       // отражение материала в упор: у каждой детали своё
${ENV_GLSL}
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(uEye - vW);
  if (!gl_FrontFacing) N = -N;
  vec3 R = reflect(-V, N);
  vec3 F0 = uF0;
  float ndv = max(dot(N, V), 0.0);
  float fres = pow(clamp(1.0 - ndv, 0.0, 1.0), 5.0);
  vec3 F = mix(F0, vec3(0.98, 0.88, 0.70), fres);
  vec3 col = envColor(R, uRough) * F;
  vec3 H = normalize(uKey + V);
  float ndh = max(dot(N, H), 0.0);
  float a = uRough * uRough;
  float a2 = a * a;
  float den = ndh * ndh * (a2 - 1.0) + 1.0;
  float D = a2 / (3.14159 * den * den);
  col += F * D * max(dot(N, uKey), 0.0) * 0.42;
  col *= 0.76 + 0.24 * ndv;
  col *= 0.62 + 0.38 * clamp(dot(N, uKey) * 0.5 + 0.5, 0.0, 1.0);
  col += F0 * 0.013;
  gl_FragColor = vec4(col, 1.0);
}`;
  const VERT_QUAD = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;
  const FRAG_BG = `
precision highp float;
varying vec2 vUv;
uniform vec2 uSize;
float bgHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n00 = bgHash(i);
  float n10 = bgHash(i + vec2(1.0, 0.0));
  float n01 = bgHash(i + vec2(0.0, 1.0));
  float n11 = bgHash(i + vec2(1.0, 1.0));
  return mix(mix(n00, n10, f.x), mix(n01, n11, f.x), f.y);
}
uniform vec2 uShift;   // сдвиг сцены за курсором — фон едет мягче предмета
${ENV_GLSL}
void main() {
  vec2 p = (vUv - 0.5) * vec2(uSize.x / uSize.y, 1.0);
  vec2 q = p - uShift * 0.10;
  vec3 c = vec3(0.014, 0.011, 0.009);
  c += vec3(0.17, 0.112, 0.050) * exp(-dot(q, q) * 3.6) * 0.11;
  c += vec3(0.07, 0.048, 0.028) * exp(-dot(q * vec2(0.7, 1.5), q * vec2(0.7, 1.5)) * 1.3) * 0.5;
  float floorY = -0.30;
  float dy = floorY - q.y;                    // больше нуля — ниже пола
  float below = smoothstep(0.0, 0.05, dy);    // мягкий переход через линию
  c *= mix(1.0, 0.35, clamp(dy * 2.2, 0.0, 1.0));
  float refl = exp(-abs(q.x) * 5.5) * exp(-max(dy, 0.0) * 4.5) * below;
  c += vec3(0.30, 0.19, 0.08) * refl * 0.14;
  float sh = exp(-(q.x * q.x) * 26.0) * exp(-(dy * dy) * 150.0);
  c *= 1.0 - sh * 0.75;
  float f1 = vnoise(q * 1.7 + vec2(uTime * 0.013, uTime * 0.004));
  float f2 = vnoise(q * 3.3 - vec2(uTime * 0.009, uTime * 0.012));
  float fog = clamp(f1 * 0.62 + f2 * 0.38, 0.0, 1.0);
  c += vec3(0.30, 0.21, 0.13) * fog * exp(-dot(q, q) * 2.0) * 0.20;
  c *= 1.0 - smoothstep(0.24, 0.98, length(p)) * 0.92;
  float a = 1.0 - smoothstep(0.0, 0.50, length(p));
  c += (bgHash(mod(gl_FragCoord.xy, 512.0)) - 0.5) * (1.6 / 255.0);
  gl_FragColor = vec4(c, a);
}`;
  const FRAG_BRIGHT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
void main() {
  vec3 c = texture2D(uTex, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = smoothstep(0.74, 1.45, l);
  gl_FragColor = vec4(c * k, 1.0);
}`;
  const FRAG_BLUR = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;      // (1/ширина, 0) или (0, 1/высота)
void main() {
  vec3 s = texture2D(uTex, vUv).rgb * 0.2270270270;
  s += texture2D(uTex, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
  s += texture2D(uTex, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
  s += texture2D(uTex, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
  s += texture2D(uTex, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(s, 1.0);
}`;
  const FRAG_MIX = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2 uTexel;    // размер точки сцены: по нему берём четыре отсчёта
uniform float uTime;
float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
vec4 tap(vec2 uv) {
  vec4 c = texture2D(uScene, uv);
  c.rgb *= c.a;
  return c;
}
void main() {
  vec4 sc = (tap(vUv + vec2(-0.5, -0.5) * uTexel)
           + tap(vUv + vec2( 0.5, -0.5) * uTexel)
           + tap(vUv + vec2(-0.5,  0.5) * uTexel)
           + tap(vUv + vec2( 0.5,  0.5) * uTexel)) * 0.25;
  sc.rgb = sc.a > 0.05 ? sc.rgb / sc.a : sc.rgb;
  vec3 bl = texture2D(uBloom, vUv).rgb;
  vec3 c = sc.rgb + bl * 0.22;
  c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);
  c = clamp(c, 0.0, 1.0);
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float dither = mix(0.009, 0.016, smoothstep(0.0, 0.25, lum));
  c += (hash(vUv * 1024.0) - 0.5) * dither;
  float glow = dot(bl, vec3(0.2126, 0.7152, 0.0722));
  float a = clamp(max(sc.a, glow * 1.4), 0.0, 1.0);
  vec3 outc = pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)) * a;
  gl_FragColor = vec4(outc, a);
}`;
  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn("scales: шейдер —", gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }
  function program(gl, vsrc, fsrc, attribs) {
    const p = gl.createProgram();
    const vs = compile(gl, gl.VERTEX_SHADER, vsrc);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fsrc);
    if (!vs || !fs) return null;
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    attribs.forEach((n, i) => gl.bindAttribLocation(p, i, n));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn("scales: программа не слинковалась");
      return null;
    }
    return p;
  }
  function upload(gl, mesh) {
    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.pos), gl.STATIC_DRAW);
    const nrmBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nrmBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.nrm), gl.STATIC_DRAW);
    const idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    const big = mesh.pos.length / 3 > 65535;
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,
      big ? new Uint32Array(mesh.idx) : new Uint16Array(mesh.idx), gl.STATIC_DRAW);
    return { posBuf, nrmBuf, idxBuf, count: mesh.idx.length, big };
  }
  function makeTarget(gl, w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) {
      gl.deleteTexture(tex); gl.deleteFramebuffer(fbo); gl.deleteRenderbuffer(depth);
      return null;
    }
    return { tex, fbo, depth, w, h };
  }
  window.initScales = function initScales(canvas) {
    const stage = canvas.parentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let gl = null;
    try {
      gl = canvas.getContext("webgl", {
        alpha: true, antialias: true, depth: true,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance", failIfMajorPerformanceCaveat: false
      });
    } catch (e) { gl = null; }
    if (!gl) return false;
    const uintOK = !!gl.getExtension("OES_element_index_uint");
    const pObj    = program(gl, VERT_OBJ,  FRAG_OBJ,    ["aPos", "aNrm"]);
    const pBg     = program(gl, VERT_QUAD, FRAG_BG,     ["aPos"]);
    const pBright = program(gl, VERT_QUAD, FRAG_BRIGHT, ["aPos"]);
    const pBlur   = program(gl, VERT_QUAD, FRAG_BLUR,   ["aPos"]);
    const pMix    = program(gl, VERT_QUAD, FRAG_MIX,    ["aPos"]);
    if (!pObj || !pBg || !pBright || !pBlur || !pMix) return false;
    const U = {
      obj: {
        proj: gl.getUniformLocation(pObj, "uProj"),
        view: gl.getUniformLocation(pObj, "uView"),
        model: gl.getUniformLocation(pObj, "uModel"),
        eye: gl.getUniformLocation(pObj, "uEye"),
        rough: gl.getUniformLocation(pObj, "uRough"),
        f0: gl.getUniformLocation(pObj, "uF0"),
        key: gl.getUniformLocation(pObj, "uKey"),
        rim: gl.getUniformLocation(pObj, "uRim"),
        time: gl.getUniformLocation(pObj, "uTime")
      },
      bg: {
        size: gl.getUniformLocation(pBg, "uSize"),
        shift: gl.getUniformLocation(pBg, "uShift"),
        key: gl.getUniformLocation(pBg, "uKey"),
        rim: gl.getUniformLocation(pBg, "uRim"),
        time: gl.getUniformLocation(pBg, "uTime")
      },
      bright: { tex: gl.getUniformLocation(pBright, "uTex") },
      blur: { tex: gl.getUniformLocation(pBlur, "uTex"), dir: gl.getUniformLocation(pBlur, "uDir") },
      mix: {
        scene: gl.getUniformLocation(pMix, "uScene"),
        bloom: gl.getUniformLocation(pMix, "uBloom"),
        texel: gl.getUniformLocation(pMix, "uTexel"),
        time: gl.getUniformLocation(pMix, "uTime")
      }
    };
    const quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const BRONZE = [0.78, 0.54, 0.25];   // подставка и колонна
    const GOLD   = [1.00, 0.766, 0.336]; // коромысло
    const PALE   = [0.93, 0.86, 0.72];   // чаши
    const STEEL  = [0.56, 0.57, 0.58];   // подвес: кольцо и тяги
    const rig = upload(gl, buildPanRig());
    const bowl = upload(gl, buildPanBowl());
    const parts = [
      { buf: upload(gl, buildStand()), rough: 0.52, f0: BRONZE },
      { buf: upload(gl, buildBeam()),  rough: 0.30, f0: GOLD },
      { buf: rig,  rough: 0.34, f0: STEEL },
      { buf: bowl, rough: 0.38, f0: PALE }
    ];
    if (!uintOK && parts.some(p => p.buf.big)) return false;
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    const EYE = [0.20, 0.06, 6.30];
    const TARGET = [0, -0.02, 0];
    const view = mLookAt(EYE, TARGET, [0, 1, 0]);
    let proj = mPerspective(0.54, 1, 0.1, 40);
    let sceneT = null, bloomA = null, bloomB = null;
    let ssBoost = true, retarget = false;
    let perfAcc = 0, perfN = 0, perfDone = false;
    function resize() {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      const small = window.innerWidth < 900;
      const dpr = Math.min(window.devicePixelRatio || 1, small ? 1.6 : 2);
      const w = Math.max(2, Math.round(rect.width * dpr));
      const h = Math.max(2, Math.round(rect.height * dpr));
      if (sceneT && !retarget &&
          Math.abs(canvas.width - w) < 2 && Math.abs(canvas.height - h) < 2) return false;
      retarget = false;
      canvas.width = w; canvas.height = h;
      proj = mPerspective(0.54, w / h, 0.1, 40);
      [sceneT, bloomA, bloomB].forEach(t => {
        if (!t) return;
        gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); gl.deleteRenderbuffer(t.depth);
      });
      const hwCap = Math.min(
        gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048,
        gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 2048
      );
      const ssCap = Math.min(small ? 1500 : 2600, hwCap);
      let ss = ssBoost ? (small ? 1.3 : 1.8) : 1;
      ss = Math.max(1, Math.min(ss, ssCap / Math.max(w, h)));
      const sw = Math.max(2, Math.round(w * ss)), sh = Math.max(2, Math.round(h * ss));
      sceneT = makeTarget(gl, sw, sh);
      if (!sceneT) { ssBoost = false; sceneT = makeTarget(gl, w, h); }
      if (!sceneT) return false;
      const hw = Math.max(2, w >> 1), hh = Math.max(2, h >> 1);
      bloomA = makeTarget(gl, hw, hh);
      bloomB = makeTarget(gl, hw, hh);
      if (!bloomA || !bloomB) return false;
      return true;
    }
    const MAX_TILT    = 0.27;   // упор наклона, около 15°
    const SPRING      = 24.0;   // жёсткость возврата к равновесию
    const DAMP        = 3.0;    // трение в оси: больше — быстрее успокаивается
    const SCROLL_HIT  = 0.011;  // удар от рывка прокрутки
    const SCROLL_LEAN = 0.0018; // перекос, пока прокрутка идёт
    const LEAN_DECAY  = 2.4;    // как быстро перекос отпускает
    const KICK        = 4.6;    // удар по щелчку и на первом появлении
    let theta = 0;      // угол коромысла
    let omega = 0;      // угловая скорость
    let lean = 0;       // накопленный перекос от прокрутки
    let hit = 0;        // импульсы прокрутки, накопленные между кадрами
    let prevMs = 0;
    let started = false;
    const PAN_SPRING = 30.0, PAN_DAMP = 4.2, PAN_GAIN = 0.055, PAN_MAX = 0.26;
    const pans = [
      { phi: 0, vel: 0, x: 0, vx: 0 },
      { phi: 0, vel: 0, x: 0, vx: 0 }
    ];
    let tLx = 0, tLy = 0, tLoad = 0;
    let lx = 0, ly = 0, load = 0;
    function onPointer(e) {
      const r = canvas.getBoundingClientRect();
      const nx = Math.max(-1, Math.min(1, (e.clientX - r.left) / r.width * 2 - 1));
      const ny = Math.max(-1, Math.min(1, (e.clientY - r.top) / r.height * 2 - 1));
      tLx = nx;
      tLy = -ny;
      tLoad = -nx;
    }
    function onLeave() { tLx = 0; tLy = 0; tLoad = 0; }
    const hoverable = window.matchMedia("(hover: hover)").matches;
    if (!reduced && hoverable) {
      stage.addEventListener("pointermove", onPointer, { passive: true });
      stage.addEventListener("pointerleave", onLeave, { passive: true });
    }
    if (!reduced && !hoverable && window.DeviceOrientationEvent) {
      window.addEventListener("deviceorientation", function (e) {
        if (e.gamma == null) return;
        const nx = Math.max(-1, Math.min(1, e.gamma / 35));
        const ny = Math.max(-1, Math.min(1, ((e.beta || 45) - 45) / 35));
        tLx = nx; tLy = -ny; tLoad = -nx;   // знак тот же, что и у курсора
      }, { passive: true });
    }
    if (!reduced) {
      let lastY = window.scrollY || 0;
      window.addEventListener("scroll", function () {
        const y = window.scrollY || 0;
        const d = Math.max(-70, Math.min(70, y - lastY));
        lastY = y;
        hit += d;
        wake();
      }, { passive: true });
    }
    stage.style.cursor = "pointer";
    stage.setAttribute("role", "img");
    stage.setAttribute("aria-label",
      "Золотые весы правосудия: чаши качаются и приходят в равновесие");
    stage.addEventListener("click", function () {
      if (reduced) return;
      omega += (theta >= 0 ? -1 : 1) * KICK;
      wake();
    });
    function drawPart(part, model) {
      gl.uniformMatrix4fv(U.obj.model, false, model);
      gl.uniform1f(U.obj.rough, part.rough);
      gl.uniform3fv(U.obj.f0, part.f0);
      gl.bindBuffer(gl.ARRAY_BUFFER, part.buf.posBuf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, part.buf.nrmBuf);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, part.buf.idxBuf);
      gl.drawElements(gl.TRIANGLES, part.buf.count,
        part.buf.big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
    }
    function fullscreen(prog) {
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.enableVertexAttribArray(0);
      gl.disableVertexAttribArray(1);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    }
    function draw(nowMs) {
      if (!sceneT || !bloomA || !bloomB) return;
      const t = nowMs / 1000;
      const dt = prevMs ? Math.min(0.05, Math.max(0.001, (nowMs - prevMs) / 1000)) : 0.016;
      prevMs = nowMs;
      if (!perfDone) {
        perfN++;
        if (perfN > 15) perfAcc += dt;
        if (perfN >= 60) {
          perfDone = true;
          if (perfAcc / (perfN - 15) > 0.022) { ssBoost = false; retarget = true; }
        }
      }
      if (reduced) {
        theta = 0; omega = 0;
        pans[0].phi = pans[1].phi = 0;
      } else {
        omega += hit * SCROLL_HIT;
        lean += hit * SCROLL_LEAN;
        hit = 0;
        lean -= lean * Math.min(1, LEAN_DECAY * dt);
        lean = Math.max(-1.2, Math.min(1.2, lean));
        const target = Math.max(-1, Math.min(1, load * 0.8 + lean)) * MAX_TILT;
        omega += (SPRING * (target - theta) - DAMP * omega) * dt;
        theta += omega * dt;
        const lim = MAX_TILT * 1.7;
        if (theta > lim) { theta = lim; omega = Math.min(omega, 0); }
        if (theta < -lim) { theta = -lim; omega = Math.max(omega, 0); }
      }
      lx += (tLx - lx) * 0.10;
      ly += (tLy - ly) * 0.10;
      load += (tLoad - load) * 0.055;
      const world = mRotY(0.10);
      let kx = -0.97 + lx * 0.45, ky = 0.24 + ly * 0.30, kz = 0.0;
      let kl = Math.hypot(kx, ky, kz) || 1;
      const key = [kx / kl, ky / kl, kz / kl];
      const rim = [0.72, 0.16, -0.68];
      const rl = Math.hypot(rim[0], rim[1], rim[2]);
      rim[0] /= rl; rim[1] /= rl; rim[2] /= rl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneT.fbo);
      gl.viewport(0, 0, sceneT.w, sceneT.h);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.disable(gl.DEPTH_TEST);
      fullscreen(pBg);
      gl.uniform2f(U.bg.size, sceneT.w, sceneT.h);
      gl.uniform2f(U.bg.shift, 0, 0);
      gl.uniform3fv(U.bg.key, key);
      gl.uniform3fv(U.bg.rim, rim);
      gl.uniform1f(U.bg.time, t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.enable(gl.DEPTH_TEST);
      gl.useProgram(pObj);
      gl.uniformMatrix4fv(U.obj.proj, false, proj);
      gl.uniformMatrix4fv(U.obj.view, false, view);
      gl.uniform3fv(U.obj.eye, EYE);
      gl.uniform3fv(U.obj.key, key);
      gl.uniform3fv(U.obj.rim, rim);
      gl.uniform1f(U.obj.time, t);
      drawPart(parts[0], world);
      drawPart(parts[1], mMul(world, mMul(mTranslate(0, BEAM_Y, 0), mRotZ(theta))));
      const c = Math.cos(theta), s = Math.sin(theta);
      for (let i = 0; i < 2; i++) {
        const dir = i === 0 ? -1 : 1;
        const px = dir * BEAM_HALF * c;
        const py = BEAM_Y + dir * BEAM_HALF * s;
        const p = pans[i];
        if (!reduced) {
          const vx = (px - p.x) / dt;
          const ax = (vx - p.vx) / dt;
          p.x = px; p.vx = vx;
          const tgt = Math.max(-PAN_MAX, Math.min(PAN_MAX, -ax * PAN_GAIN));
          p.vel += (PAN_SPRING * (tgt - p.phi) - PAN_DAMP * p.vel) * dt;
          p.phi += p.vel * dt;
        }
        const m = mMul(world, mMul(mTranslate(px, py, 0), mRotZ(p.phi)));
        drawPart(parts[2], m);
        drawPart(parts[3], m);
      }
      gl.disable(gl.DEPTH_TEST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.fbo);
      gl.viewport(0, 0, bloomA.w, bloomA.h);
      fullscreen(pBright);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneT.tex);
      gl.uniform1i(U.bright.tex, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomB.fbo);
      fullscreen(pBlur);
      gl.bindTexture(gl.TEXTURE_2D, bloomA.tex);
      gl.uniform1i(U.blur.tex, 0);
      gl.uniform2f(U.blur.dir, 1.6 / bloomA.w, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.fbo);
      fullscreen(pBlur);
      gl.bindTexture(gl.TEXTURE_2D, bloomB.tex);
      gl.uniform1i(U.blur.tex, 0);
      gl.uniform2f(U.blur.dir, 0, 1.6 / bloomA.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      fullscreen(pMix);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneT.tex);
      gl.uniform1i(U.mix.scene, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, bloomA.tex);
      gl.uniform1i(U.mix.bloom, 1);
      gl.uniform2f(U.mix.texel, 1 / sceneT.w, 1 / sceneT.h);
      gl.uniform1f(U.mix.time, t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
      gl.enable(gl.DEPTH_TEST);
    }
    let raf = 0, visible = false;
    let swapped = false;
    function loop(now) {
      raf = 0;
      resize();
      draw(now);
      if (visible && !reduced) raf = requestAnimationFrame(loop);
    }
    function wake() { if (!raf && visible) raf = requestAnimationFrame(loop); }
    const io = new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) {
        if (!started && swapped) { started = true; omega = -KICK * 0.34; }
        wake();
      } else if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }, { threshold: 0.01 });
    io.observe(canvas);
    canvas.addEventListener("webglcontextlost", function (e) {
      e.preventDefault();
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      visible = false;
      stage.classList.remove("is-live");
      stage.classList.add("is-fallback");
    }, false);
    window.addEventListener("pagehide", function () {
      const ext = gl.getExtension("WEBGL_lose_context");
      if (ext) { try { ext.loseContext(); } catch (err) {} }
    }, { passive: true });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden && raf) { cancelAnimationFrame(raf); raf = 0; }
      else wake();
    });
    let resizeTimer = 0;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (resize()) draw(performance.now());
      }, 120);
    }, { passive: true });
    if (!resize()) return false;
    prevMs = 0;
    draw(performance.now());
    let shown = false;
    function reveal() {
      if (shown) return;
      shown = true;
      stage.classList.add("is-live");
      setTimeout(function () {
        swapped = true;
        if (visible && !started) { started = true; omega = -KICK * 0.34; }
        wake();
      }, 240);
    }
    if (reduced) {
      requestAnimationFrame(reveal);
      setTimeout(reveal, 600);
      return true;
    }
    visible = true;
    wake();
    let framesLeft = 5;
    (function tick() {
      if (--framesLeft > 0) { requestAnimationFrame(tick); return; }
      setTimeout(reveal, 260);
    })();
    setTimeout(reveal, 1500);
    return true;
  };
})();