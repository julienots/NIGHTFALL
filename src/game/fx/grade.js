// Étalonnage final : vignette colorée, contraste/saturation « cartoon »,
// aberration chromatique et voile rouge pulsés quand Noa est touché, teinte
// violette en Forme Abysse. Une seule passe plein écran, peu coûteuse.
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVig: { value: 0.32 },
    uSat: { value: 1.12 },
    uCon: { value: 1.06 },
    uHurt: { value: 0 },
    uLow: { value: 0 },
    uUmbra: { value: 0 },
    uAspect: { value: 16 / 9 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uVig, uSat, uCon, uHurt, uLow, uUmbra, uAspect; varying vec2 vUv;
    void main(){
      vec2 c = vUv - 0.5;
      float r = length(c * vec2(uAspect, 1.0)) / uAspect * 1.6;
      // Aberration chromatique radiale (impact)
      float ab = uHurt * 0.012 * r;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + c * ab).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - c * ab).b;
      // Contraste + saturation
      col = (col - 0.5) * uCon + 0.5;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, uSat * (1.0 - uLow * 0.55));
      // Teintes d'état
      col = mix(col, col * vec3(0.75, 0.6, 1.25), uUmbra * 0.35);
      // Vignette (violette, rouge en danger)
      float v = smoothstep(0.35, 1.05, r);
      vec3 vc = mix(vec3(0.07, 0.02, 0.16), vec3(0.45, 0.0, 0.06), clamp(uHurt + uLow, 0.0, 1.0));
      col = mix(col, vc, v * (uVig + uHurt * 0.35 + uLow * 0.25));
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export class GradePass extends ShaderPass {
  constructor() {
    super(GradeShader);
    this.hurt = 0;
  }

  pulse(k = 0.6) {
    this.hurt = Math.min(1, this.hurt + k);
  }

  tick(dt, { lowHp = 0, umbra = false, aspect = 16 / 9, time = 0 }) {
    this.hurt = Math.max(0, this.hurt - dt * 2.5);
    const u = this.uniforms;
    u.uHurt.value = this.hurt;
    u.uLow.value = lowHp * (0.6 + 0.4 * Math.sin(time * 5));
    u.uUmbra.value += ((umbra ? 1 : 0) - u.uUmbra.value) * Math.min(1, dt * 4);
    u.uAspect.value = aspect;
  }
}

