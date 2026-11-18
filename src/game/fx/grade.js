// Étalonnage final (après la tonalité ACES, en sRGB) :
//  - courbe filmique douce, virage couleur (ombres froides / hautes lumières
//    chaudes), saturation contrôlée ;
//  - netteté adaptative (CAS simplifié) pour compenser l'anticrénelage ;
//  - aberration chromatique d'objectif sur les bords, vignettage optique ;
//  - grain argentique animé (plus marqué dans les ombres) et tramage
//    anti-bandes ;
//  - états de jeu : voile rouge et aberration pulsés quand Noa est touché ou
//    à bout de forces, teinte abyssale en Forme Abysse.
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVig: { value: 0.28 },
    uSat: { value: 1.04 },
    uCon: { value: 1.05 },
    uHurt: { value: 0 },
    uLow: { value: 0 },
    uUmbra: { value: 0 },
    uAspect: { value: 16 / 9 },
    uTime: { value: 0 },
    uGrain: { value: 0.035 },
    uSharpen: { value: 0.35 },
    uCA: { value: 0.0015 },
    uRes: { value: [1280, 720] },
    uNight: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uVig, uSat, uCon, uHurt, uLow, uUmbra, uAspect, uTime, uGrain, uSharpen, uCA, uNight;
    uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
    void main(){
      vec2 c = vUv - 0.5;
      float r = length(c * vec2(uAspect, 1.0)) / uAspect * 1.6;
      vec2 px = 1.0 / uRes;
      // Aberration chromatique : légère sur les bords, forte à l'impact.
      float ab = (uCA * r * r + uHurt * 0.012 * r);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + c * ab).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - c * ab).b;
      // Netteté adaptative (contraste local)
      vec3 n = texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb;
      vec3 s = texture2D(tDiffuse, vUv - vec2(0.0, px.y)).rgb;
      vec3 e = texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb;
      vec3 w = texture2D(tDiffuse, vUv - vec2(px.x, 0.0)).rgb;
      vec3 mn = min(col, min(min(n, s), min(e, w)));
      vec3 mx = max(col, max(max(n, s), max(e, w)));
      vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, 1e-3), 0.0, 1.0));
      vec3 wgt = -amp * uSharpen * 0.2;
      col = clamp((col + (n + s + e + w) * wgt) / (1.0 + 4.0 * wgt), 0.0, 1.0);
      // Courbe en S douce autour du gris moyen
      col = mix(col, col * col * (3.0 - 2.0 * col), (uCon - 1.0) * 2.0);
      // Virage couleur : ombres bleu-vert, hautes lumières ambrées
      float l = luma(col);
      vec3 shadowTint = mix(vec3(0.94, 1.0, 1.06), vec3(0.9, 0.97, 1.12), uNight);
      vec3 highTint = vec3(1.05, 1.0, 0.93);
      col *= mix(shadowTint, highTint, smoothstep(0.1, 0.8, l));
      // Saturation (réduite quand Noa est à bout de forces)
      l = luma(col);
      col = mix(vec3(l), col, uSat * (1.0 - uLow * 0.55));
      // Forme Abysse : teinte froide violacée
      col = mix(col, col * vec3(0.78, 0.68, 1.2), uUmbra * 0.3);
      // Vignettage optique (rouge pulsé en danger)
      float v = smoothstep(0.3, 1.1, r);
      vec3 vc = mix(vec3(0.0), vec3(0.45, 0.0, 0.04), clamp(uHurt + uLow, 0.0, 1.0));
      col = mix(col, vc, v * (uVig + uHurt * 0.35 + uLow * 0.25));
      // Grain argentique (plus visible dans les ombres) + tramage
      float g = hash(gl_FragCoord.xy + fract(uTime * 13.7) * 311.0) - 0.5;
      col += g * uGrain * (1.0 - l * 0.7);
      col += (hash(gl_FragCoord.xy * 1.37 + 17.0) - 0.5) / 255.0;
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

  setSize(w, h) {
    this.uniforms.uRes.value = [w, h];
  }

  tick(dt, { lowHp = 0, umbra = false, aspect = 16 / 9, time = 0, night = 0 }) {
    this.hurt = Math.max(0, this.hurt - dt * 2.5);
    const u = this.uniforms;
    u.uHurt.value = this.hurt;
    u.uLow.value = lowHp * (0.6 + 0.4 * Math.sin(time * 5));
    u.uUmbra.value += ((umbra ? 1 : 0) - u.uUmbra.value) * Math.min(1, dt * 4);
    u.uAspect.value = aspect;
    u.uTime.value = time;
    u.uNight.value = night;
  }
}
