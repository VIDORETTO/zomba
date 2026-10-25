import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import type { MapDef } from '../shared/map/types';

// Acabamento da imagem, aplicado depois da conversão de cor: saturação, contraste, tom das sombras,
// vinheta nas bordas e uma granulação de filme bem leve. fade = 0 escurece tudo (transições).
const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    time: { value: 0 },
    sat: { value: 0.78 },
    contrast: { value: 1.2 },
    shadowTint: { value: new THREE.Vector3(1.02, 1, 0.96) },
    vignette: { value: 0.5 },
    grain: { value: 0.035 },
    fade: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float time; uniform float sat; uniform float contrast;
    uniform vec3 shadowTint; uniform float vignette; uniform float grain; uniform float fade;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, sat);
      c = (c - 0.5) * contrast + 0.5;
      // sombras puxadas para o tom do mapa, luzes intactas
      c *= mix(shadowTint, vec3(1.0), smoothstep(0.0, 0.6, l));
      vec2 d = vUv - 0.5;
      c *= 1.0 - vignette * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
      c += (hash(vUv * 731.0 + fract(time * 13.0)) - 0.5) * grain;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0) * fade, 1.0);
    }`,
};

// A Rota é mais fria e lavada (névoa); a Cidade mais quente e contrastada.
export function gradePass(map: MapDef): ShaderPass {
  const pass = new ShaderPass(GRADE_SHADER);
  const rota = !!map.fogRoadColor;
  pass.uniforms.sat.value = rota ? 0.7 : 0.78;
  pass.uniforms.contrast.value = rota ? 1.14 : 1.2;
  pass.uniforms.shadowTint.value.set(rota ? 0.94 : 0.96, 0.98, 1.06);
  return pass;
}
