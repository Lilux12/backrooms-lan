// Постобработка без внешних модулей: сцена рисуется в текстуру, затем один проход-«композит»:
// bloom (яркие места → размытие в четверть разрешения), цветокоррекция уровня, виньетка,
// хроматическая аберрация, плёночное зерно, VHS. Каждый эффект включается в настройках.
import * as THREE from 'three';
import { renderer, scene, camera } from './scene.js';
import { settings } from '../core/settings.js';

const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quadScene = new THREE.Scene();
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
quad.frustumCulled = false;
quadScene.add(quad);

const VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

// Яркие участки (лампы, фонарь, свечение) для bloom
const brightMat = new THREE.ShaderMaterial({
  uniforms: { tex: { value: null }, threshold: { value: 1.05 } },
  vertexShader: VERT,
  fragmentShader: `uniform sampler2D tex; uniform float threshold; varying vec2 vUv;
    void main() { vec3 c = min(texture2D(tex, vUv).rgb, vec3(3.0)); float l = max(c.r, max(c.g, c.b));
      gl_FragColor = vec4((c - threshold * 0.8) * smoothstep(threshold, threshold + 0.6, l), 1.0); }`,
  depthTest: false, depthWrite: false,
});
// Размытие по Гауссу (9 отсчётов), направление — dir
const blurMat = new THREE.ShaderMaterial({
  uniforms: { tex: { value: null }, dir: { value: new THREE.Vector2(1, 0) } },
  vertexShader: VERT,
  fragmentShader: `uniform sampler2D tex; uniform vec2 dir; varying vec2 vUv;
    void main() { vec3 c = texture2D(tex, vUv).rgb * 0.227;
      c += texture2D(tex, vUv + dir * 1.385).rgb * 0.316; c += texture2D(tex, vUv - dir * 1.385).rgb * 0.316;
      c += texture2D(tex, vUv + dir * 3.231).rgb * 0.070; c += texture2D(tex, vUv - dir * 3.231).rgb * 0.070;
      gl_FragColor = vec4(c, 1.0); }`,
  depthTest: false, depthWrite: false,
});
// Итоговый проход
const compMat = new THREE.ShaderMaterial({
  uniforms: {
    tex: { value: null }, bloom: { value: null }, time: { value: 0 }, res: { value: new THREE.Vector2(1, 1) },
    bloomK: { value: 0 }, vign: { value: 0 }, ca: { value: 0 }, grain: { value: 0 }, vhs: { value: 0 },
    tint: { value: new THREE.Vector3(1, 1, 1) }, sat: { value: 1 }, contrast: { value: 1 }, danger: { value: 0 },
  },
  vertexShader: VERT,
  fragmentShader: `uniform sampler2D tex; uniform sampler2D bloom; uniform float time; uniform vec2 res;
    uniform float bloomK, vign, ca, grain, vhs, sat, contrast, danger; uniform vec3 tint; varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      if (vhs > 0.0) { // VHS: дрожание строк и полосы помех
        float line = floor(uv.y * res.y / 3.0);
        uv.x += (hash(vec2(line, floor(time * 24.0))) - 0.5) * 0.0025 * vhs;
        uv.x += step(0.995, hash(vec2(floor(time * 6.0), line * 0.1))) * 0.01 * vhs;
      }
      vec2 d = uv - 0.5;
      float r2 = dot(d, d);
      vec3 c;
      if (ca > 0.0) { // хроматическая аберрация: сильнее к краям экрана (и от страха)
        vec2 off = d * (0.004 * ca + 0.006 * danger) * (0.4 + r2 * 3.0);
        c = vec3(texture2D(tex, uv + off).r, texture2D(tex, uv).g, texture2D(tex, uv - off).b);
      } else c = texture2D(tex, uv).rgb;
      if (bloomK > 0.0) c += texture2D(bloom, uv).rgb * bloomK;
      // цветокоррекция уровня
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, sat);
      c = (c - 0.5) * contrast + 0.5;
      c *= tint;
      if (vign > 0.0) c *= 1.0 - smoothstep(0.2, 0.85, r2 * 2.2) * vign;
      if (grain > 0.0) c += (hash(uv * res + fract(time * 13.7) * 100.0) - 0.5) * 0.09 * grain;
      if (vhs > 0.0) c *= 0.92 + 0.08 * sin(uv.y * res.y * 1.6 + time * 8.0);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
      #include <colorspace_fragment>
    }`,
  depthTest: false, depthWrite: false,
});

let rt = null, bA = null, bB = null;
function makeTargets() {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const w = Math.max(2, size.x), h = Math.max(2, size.y);
  const opt = { type: THREE.HalfFloatType }; // линейный цвет; в sRGB переводит итоговый проход
  if (!rt) { rt = new THREE.WebGLRenderTarget(w, h, Object.assign({ samples: 0 }, opt)); bA = new THREE.WebGLRenderTarget(w >> 2, h >> 2, opt); bB = bA.clone(); }
  else { rt.setSize(w, h); bA.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2)); bB.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2)); }
  compMat.uniforms.res.value.set(w, h);
}

// Цветокоррекция уровня: grade = { tint: [r, g, b], sat, contrast }
export function setGrade(g) {
  const gr = g || {};
  compMat.uniforms.tint.value.set(...(gr.tint || [1, 1, 1]));
  compMat.uniforms.sat.value = gr.sat == null ? 1 : gr.sat;
  compMat.uniforms.contrast.value = gr.contrast == null ? 1.04 : gr.contrast;
}

export const postOn = () => !!settings.post;
let lastW = 0, lastH = 0, time = 0;

// Нарисовать кадр (с постобработкой или напрямую). danger 0..1 — близость существа
export function renderFrame(dt, danger = 0, vhsForced = false) {
  if (!settings.post) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  if (!rt || size.x !== lastW || size.y !== lastH) { lastW = size.x; lastH = size.y; makeTargets(); }
  time += dt;
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  const U = compMat.uniforms;
  U.bloomK.value = settings.bloom ? 0.4 : 0;
  if (settings.bloom) {
    quad.material = brightMat; brightMat.uniforms.tex.value = rt.texture;
    renderer.setRenderTarget(bA); renderer.render(quadScene, quadCam);
    for (let k = 0; k < 2; k++) {
      quad.material = blurMat; blurMat.uniforms.tex.value = bA.texture; blurMat.uniforms.dir.value.set(1 / bA.width, 0);
      renderer.setRenderTarget(bB); renderer.render(quadScene, quadCam);
      blurMat.uniforms.tex.value = bB.texture; blurMat.uniforms.dir.value.set(0, 1 / bA.height);
      renderer.setRenderTarget(bA); renderer.render(quadScene, quadCam);
    }
  }
  U.tex.value = rt.texture; U.bloom.value = bA.texture; U.time.value = time;
  U.vign.value = settings.vign ? 0.75 : 0; U.ca.value = settings.ca ? 1 : 0; U.grain.value = settings.grain ? 1 : 0;
  U.vhs.value = settings.vhs || vhsForced ? 1 : 0; U.danger.value = settings.ca ? danger : 0;
  quad.material = compMat;
  renderer.setRenderTarget(null);
  renderer.render(quadScene, quadCam);
}
