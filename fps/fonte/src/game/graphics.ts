/* Gráficos realistas sem assets externos:
   - texturas PBR procedurais (ruído fBm em canvas), mapeadas em triplanar no
     espaço do mundo, então caixas escaladas não esticam a textura;
   - relevo por derivadas (bump sem normal map) e rugosidade variável;
   - iluminação por ambiente (IBL) gerada do próprio céu com PMREM;
   - pós-processamento: AO (SAO), bloom HDR, gradação ACES + vinheta + grão, SMAA.
   Tudo vem do pacote three@0.128 (examples/jsm); nada é baixado em tempo de execução. */
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { SAOPass } from 'three/examples/jsm/postprocessing/SAOPass.js'
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js'
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import hdriSunset from './assets/hdri-sunset'
import hdriSky from './assets/hdri-sky'
import hdriCity from './assets/hdri-city'
import n0000 from './assets/normal-0000'
import n0004 from './assets/normal-0004'
import n0016 from './assets/normal-0016'
import n0018 from './assets/normal-0018'
import n0020 from './assets/normal-0020'
import n0021 from './assets/normal-0021'
import n0025 from './assets/normal-0025'
import n0026 from './assets/normal-0026'
import n0027 from './assets/normal-0027'

/* Normal maps CC0 (@pmndrs/assets), escolhidos por material. */
const NORMALS: Record<string, string> = {
  concrete: n0000, wood: n0004, corrugated: n0016, metal: n0018, asphalt: n0020,
  twill: n0021, tile: n0025, dirt: n0026, burlap: n0027,
}
const normalCache = new Map<string, THREE.Texture>()
function normalTexture(key: string): THREE.Texture {
  const hit = normalCache.get(key); if (hit) return hit
  const t = new THREE.TextureLoader().load(NORMALS[key])
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  normalCache.set(key, t)
  return t
}

export type Quality = 'alta' | 'media' | 'baixa'
type Kind = 'concrete' | 'asphalt' | 'dirt' | 'metal' | 'corrugated' | 'wood' | 'fabric' | 'tile' | 'paint' | 'cracked' | 'ruin' | 'facade'

/* ---------------- ruído ---------------- */
function hash(x: number, y: number, s: number) {
  const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453
  return h - Math.floor(h)
}
function vnoise(x: number, y: number, s: number, per: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
  const w = (a: number, b: number) => hash(((a % per) + per) % per, ((b % per) + per) % per, s)
  return (w(xi, yi) * (1 - u) + w(xi + 1, yi) * u) * (1 - v) + (w(xi, yi + 1) * (1 - u) + w(xi + 1, yi + 1) * u) * v
}
function fbm(x: number, y: number, s: number, oct: number, per: number) {
  let a = 0, amp = 0.5, f = 1, n = 0
  for (let i = 0; i < oct; i++) { a += vnoise(x * f, y * f, s + i, per * f) * amp; n += amp; amp *= 0.5; f *= 2 }
  return a / n
}

/* Ruído celular periódico: distância ao ponto mais próximo (f1) e ao segundo (f2). As rachaduras ficam onde f2 − f1 ≈ 0. */
function cellular(x: number, y: number, s: number, per: number) {
  const xi = Math.floor(x), yi = Math.floor(y)
  let f1 = 9, f2 = 9
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j, wx = ((cx % per) + per) % per, wy = ((cy % per) + per) % per
    const px = cx + hash(wx, wy, s), py = cy + hash(wx, wy, s + 7)
    const d = Math.hypot(px - x, py - y)
    if (d < f1) { f2 = f1; f1 = d } else if (d < f2) f2 = d
  }
  return f2 - f1
}

/* Textura em tons de cinza (tingida pela cor do material). Média ~0,85 para não escurecer a cena. */
const texCache = new Map<Kind, THREE.CanvasTexture>()
function surfaceTexture(kind: Kind): THREE.CanvasTexture {
  const hit = texCache.get(kind); if (hit) return hit
  const N = kind === 'cracked' ? 512 : 256, c = document.createElement('canvas'); c.width = c.height = N
  const ctx = c.getContext('2d')!, img = ctx.createImageData(N, N), d = img.data
  const P = 8                                                          // período do ruído: textura sem emenda
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N * P, v = y / N * P
    let g = 0.85
    switch (kind) {
      case 'concrete': g = 0.76 + fbm(u, v, 1, 5, P) * 0.2 - Math.pow(fbm(u * 0.5, v * 0.5, 9, 3, P / 2), 3) * 0.2; break
      case 'asphalt':  g = 0.74 + fbm(u * 4, v * 4, 5, 3, P * 4) * 0.1 + fbm(u, v, 2, 4, P) * 0.14; break
      case 'dirt':     g = 0.68 + fbm(u, v, 4, 5, P) * 0.32; break
      case 'metal':    g = 0.78 + fbm(u * 2, v * 0.3, 6, 4, P) * 0.2 - Math.pow(fbm(u, v, 12, 4, P), 4) * 0.4; break
      case 'corrugated': {
        const rib = 0.5 + 0.5 * Math.sin(x / N * Math.PI * 2 * 10)                // nervuras do contêiner
        const rust = Math.pow(fbm(u, v * 0.4, 13, 5, P), 2.5)
        g = 0.8 + rib * 0.12 - rust * 0.25; break
      }
      case 'wood': {
        const plank = (y % 64) < 3 ? -0.35 : 0                                     // junta das tábuas
        g = 0.72 + Math.sin(u * 6 + fbm(u, v * 8, 7, 4, P) * 6) * 0.08 + fbm(u * 0.5, v * 6, 2, 4, P) * 0.18 + plank; break
      }
      case 'fabric':   g = 0.75 + ((x + y) % 4 < 2 ? 0.06 : -0.02) + fbm(u, v, 11, 5, P) * 0.2; break
      case 'tile': {
        const line = (x % 64) < 2 || (y % 64) < 2
        g = line ? 0.45 : 0.82 + fbm(u, v, 14, 4, P) * 0.15 + hash(Math.floor(x / 64), Math.floor(y / 64), 2) * 0.08; break
      }
      case 'cracked': {
        // asfalto velho: agregado, remendos de poeira e malha de rachaduras (rede de Voronoi deformada por ruído)
        const w = fbm(u * 2, v * 2, 31, 3, P * 2) * 0.35
        const crack = cellular(u * 0.75 + w, v * 0.75 + w, 33, P * 0.75)
        const fine = cellular(u * 2 + w * 2, v * 2 + w * 2, 35, P * 2)
        g = 0.72 + fbm(u * 4, v * 4, 5, 3, P * 4) * 0.1 + Math.pow(fbm(u * 0.5, v * 0.5, 34, 4, P / 2), 2) * 0.3
        g *= 0.5 + 0.5 * Math.min(1, crack / 0.045)
        g *= 0.8 + 0.2 * Math.min(1, fine / 0.03)
        break
      }
      case 'ruin': {
        // concreto de fachada: manchas, escorrido de fuligem na vertical e lascas claras
        const streak = Math.pow(vnoise(u * 3, 0, 21, P * 3), 4) * fbm(u * 2, v * 0.5, 22, 3, P) * 2
        const chip = fbm(u * 2, v * 2, 23, 4, P * 2)
        g = 0.8 + fbm(u, v, 1, 5, P) * 0.18 - Math.pow(fbm(u * 0.5, v * 0.5, 9, 3, P / 2), 3) * 0.2 - streak * 0.22 + (chip > 0.7 ? 0.08 : 0)
        break
      }
      case 'facade': {
        // prédio distante: grade de janelas (8 × 8 por ladrilho), algumas estouradas (mais escuras)
        const cx = Math.floor(x / (N / 8)), cy = Math.floor(y / (N / 8))
        const fx = (x % (N / 8)) / (N / 8), fy = (y % (N / 8)) / (N / 8)
        const win = fx > 0.22 && fx < 0.78 && fy > 0.3 && fy < 0.8
        const h = hash(cx, cy, 41)
        g = win ? (h < 0.2 ? 0.12 : 0.3 + h * 0.12) : 0.78 + fbm(u, v, 42, 3, P) * 0.15
        break
      }
      case 'paint':    g = 0.82 + fbm(u, v, 15, 4, P) * 0.15 - Math.pow(fbm(u * 2, v * 2, 16, 4, P * 2), 5) * 0.5; break
    }
    const k = Math.round(Math.max(0, Math.min(1, g)) * 255), i = (y * N + x) * 4
    d[i] = d[i + 1] = d[i + 2] = k; d[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  t.encoding = THREE.sRGBEncoding
  texCache.set(kind, t)
  return t
}

/* MeshStandardMaterial com amostragem triplanar, rugosidade pela textura e relevo por derivadas. */
export function surfaceMaterial(color: number, kind: Kind, opts: { scale?: number; rough?: number; metal?: number; bump?: number; local?: boolean; normal?: string; nScale?: number; nStrength?: number } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.95, metalness: opts.metal ?? 0, map: surfaceTexture(kind) })
  m.envMapIntensity = (opts.metal ?? 0) > 0.3 ? 0.7 : 0.35     // superfícies ásperas refletem pouco o céu
  // dFdx/dFdy no WebGL1 (no WebGL2 já é nativo); o tipo da r128 não declara extensions em MeshStandardMaterial
  ;(m as unknown as { extensions: Record<string, boolean> }).extensions = { derivatives: true }
  const scale = opts.scale ?? 0.25, bump = (opts.bump ?? 0.6) * 0.25, local = !!opts.local
  const nTex = opts.normal ? normalTexture(opts.normal) : null
  m.defines = { ...(m.defines || {}), ...(nTex ? { TRI_NORMAL: '' } : {}), ...(local ? { TRI_LOCAL: '' } : {}) }
  m.onBeforeCompile = sh => {
    sh.uniforms.triScale = { value: scale }
    sh.uniforms.bumpK = { value: bump }
    sh.uniforms.triNormal = { value: nTex }
    sh.uniforms.triNScale = { value: opts.nScale ?? scale * 2 }
    sh.uniforms.triNStr = { value: opts.nStrength ?? 1 }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriP; varying vec3 vTriN;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        ${local
          ? 'vec3 triS = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz)); vTriP = transformed * triS; vTriN = objectNormal;'
          : `vec4 triWP = vec4(transformed, 1.0); vec3 triON = objectNormal;
             #ifdef USE_INSTANCING
             triWP = instanceMatrix * triWP; triON = mat3(instanceMatrix) * triON;
             #endif
             vTriP = (modelMatrix * triWP).xyz; vTriN = normalize(mat3(modelMatrix) * triON);`}`)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriP; varying vec3 vTriN; uniform float triScale; uniform float bumpK;\n#ifdef TRI_NORMAL\nuniform sampler2D triNormal; uniform float triNScale; uniform float triNStr;\n#endif\n#ifdef TRI_LOCAL\nuniform mat3 normalMatrix;\n#endif')
      .replace('#include <map_fragment>', `
        vec3 triW = pow(abs(vTriN), vec3(4.0)); triW /= (triW.x + triW.y + triW.z);
        vec4 triTex = texture2D(map, vTriP.zy * triScale) * triW.x
                    + texture2D(map, vTriP.xz * triScale) * triW.y
                    + texture2D(map, vTriP.xy * triScale) * triW.z;
        vec4 texelColor = mapTexelToLinear(triTex);
        diffuseColor.rgb *= texelColor.rgb;
        float triLum = dot(triTex.rgb, vec3(0.3333));`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(roughness * (0.7 + 0.6 * (1.0 - triLum)), 0.04, 1.0);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        #ifdef TRI_NORMAL
        {
          // triplanar com mistura "whiteout": cada projeção vira normal no espaço do vTriN
          vec3 tbN = normalize(vTriN);
          vec3 tbW = pow(abs(tbN), vec3(4.0)); tbW /= (tbW.x + tbW.y + tbW.z);
          vec3 tbX = texture2D(triNormal, vTriP.zy * triNScale).xyz * 2.0 - 1.0;
          vec3 tbY = texture2D(triNormal, vTriP.xz * triNScale).xyz * 2.0 - 1.0;
          vec3 tbZ = texture2D(triNormal, vTriP.xy * triNScale).xyz * 2.0 - 1.0;
          tbX.xy *= triNStr; tbY.xy *= triNStr; tbZ.xy *= triNStr;
          tbX = vec3(tbX.xy + tbN.zy, abs(tbX.z) * tbN.x);
          tbY = vec3(tbY.xy + tbN.xz, abs(tbY.z) * tbN.y);
          tbZ = vec3(tbZ.xy + tbN.xy, abs(tbZ.z) * tbN.z);
          vec3 tbOut = normalize(tbX.zyx * tbW.x + tbY.xzy * tbW.y + tbZ.xyz * tbW.z);
          #ifdef TRI_LOCAL
          normal = normalize(normalMatrix * tbOut);
          #else
          normal = normalize((viewMatrix * vec4(tbOut, 0.0)).xyz);
          #endif
          normal *= faceDirection;
        }
        #else
        {
          vec3 tbPx = dFdx(-vViewPosition); vec3 tbPy = dFdy(-vViewPosition);
          float tbHx = dFdx(triLum); float tbHy = dFdy(triLum);
          vec3 tbR1 = cross(tbPy, normal); vec3 tbR2 = cross(normal, tbPx);
          float tbDet = dot(tbPx, tbR1);
          vec3 tbGrad = sign(tbDet) * (tbHx * tbR1 + tbHy * tbR2);
          normal = normalize(abs(tbDet) * normal - bumpK * tbGrad);
        }
        #endif`)
  }
  m.customProgramCacheKey = () => `tri-${kind}-${local ? 1 : 0}-${nTex ? 1 : 0}`
  return m
}

/* Troca os materiais do cenário e das armas por PBR (mantém os mesmos objetos-chave em MAT). */
export function upgradeMaterials(MAT: Record<string, THREE.Material>) {
  const col = (k: string) => (MAT[k] as THREE.MeshStandardMaterial).color.getHex()
  const set = (k: string, kind: Kind, o: Parameters<typeof surfaceMaterial>[2] = {}) => {
    if (MAT[k]) MAT[k] = surfaceMaterial(col(k), kind, o)
  }
  set('ground', 'dirt', { scale: 0.09, normal: 'dirt', nScale: 0.22, nStrength: 0.8 })
  set('groundDry', 'dirt', { scale: 0.09, normal: 'dirt', nScale: 0.22, nStrength: 0.8 })
  set('road', 'asphalt', { scale: 0.15, rough: 1, normal: 'asphalt', nScale: 0.6 })
  set('roadDust', 'dirt', { scale: 0.22, normal: 'dirt', nScale: 0.4 })
  set('wall', 'concrete', { scale: 0.22, normal: 'concrete', nScale: 0.45 })
  set('wallDark', 'concrete', { scale: 0.22, normal: 'concrete', nScale: 0.45 })
  set('concrete', 'concrete', { scale: 0.22, normal: 'concrete', nScale: 0.45 })
  set('crate', 'wood', { scale: 0.9, rough: 0.8, normal: 'wood', nScale: 0.9 })
  set('metal', 'metal', { scale: 0.5, rough: 0.55, metal: 0.6, normal: 'metal', nScale: 0.8, nStrength: 0.6 })
  set('barrel', 'paint', { scale: 0.9, rough: 0.6, metal: 0.4, normal: 'metal', nScale: 1.2, nStrength: 0.5 })
  set('sandbag', 'fabric', { scale: 0.9, normal: 'burlap', nScale: 1.5, nStrength: 1.3 })
  set('contA', 'corrugated', { scale: 0.35, rough: 0.6, metal: 0.45, normal: 'corrugated', nScale: 0.35, nStrength: 1.4 })
  set('contB', 'corrugated', { scale: 0.35, rough: 0.6, metal: 0.45, normal: 'corrugated', nScale: 0.35, nStrength: 1.4 })
  set('contC', 'corrugated', { scale: 0.35, rough: 0.6, metal: 0.45, normal: 'corrugated', nScale: 0.35, nStrength: 1.4 })
  set('floorTile', 'tile', { scale: 0.25, rough: 0.5, normal: 'tile', nScale: 0.25 })
  set('floorHall', 'tile', { scale: 0.25, rough: 0.45, normal: 'tile', nScale: 0.25 })
  // Ruínas: poeira, asfalto rachado, fachada com fuligem, lataria queimada e o kit do SketchUp
  set('dust', 'dirt', { scale: 0.09, normal: 'dirt', nScale: 0.25, nStrength: 0.9 })
  set('roadCracked', 'cracked', { scale: 0.07, rough: 1, normal: 'asphalt', nScale: 0.5 })
  set('ruin', 'ruin', { scale: 0.2, normal: 'concrete', nScale: 0.4 })
  set('ruinDark', 'ruin', { scale: 0.2, normal: 'concrete', nScale: 0.4 })
  set('burnt', 'metal', { scale: 0.6, rough: 0.85, metal: 0.35, normal: 'metal', nScale: 1, nStrength: 0.9 })
  set('pole', 'wood', { scale: 1.5, rough: 0.85, normal: 'wood', nScale: 1.5 })
  set('kConcrete', 'concrete', { scale: 0.3, normal: 'concrete', nScale: 0.6 })
  set('kBreak', 'concrete', { scale: 0.6, normal: 'dirt', nScale: 1.2, nStrength: 1.4 })
  set('kRebar', 'metal', { scale: 2, rough: 0.8, metal: 0.5, normal: 'metal', nScale: 3 })
  set('kRubble', 'concrete', { scale: 0.5, normal: 'dirt', nScale: 1.2, nStrength: 1.3 })
  set('kJersey', 'concrete', { scale: 0.45, normal: 'concrete', nScale: 1.8, nStrength: 0.5 })
  // uniformes e equipamento: tecido no espaço do objeto (não "escorrega" quando o soldado anda)
  set('enemyBody', 'fabric', { scale: 3, local: true, normal: 'twill', nScale: 4 })
  set('enemyVest', 'fabric', { scale: 3, local: true, normal: 'burlap', nScale: 4, nStrength: 0.8 })
  set('sleeve', 'fabric', { scale: 8, local: true, normal: 'twill', nScale: 10 })
  // armas: metal fosco com reflexo do céu, polímero e madeira
  const std = (k: string, rough: number, metal: number, env = 0.45) => { const m = MAT[k] as THREE.MeshStandardMaterial; if (m) { m.roughness = rough; m.metalness = metal; m.envMapIntensity = env } }
  // preto anodizado e fosfatizado: quase não reflete o céu, o brilho vem da luz direta
  std('gBlack', 0.62, 0.12, 0.1); std('gSteel', 0.45, 0.6, 0.2); std('gScope', 0.35, 0.5, 0.2)
  std('gPoly', 0.8, 0.0, 0.08); std('gGlass', 0.05, 0.9, 0.6); std('hands', 0.85, 0, 0.2)
  std('tire', 0.9, 0, 0.15)
  set('gWood', 'wood', { scale: 6, local: true, rough: 0.6 })
  set('gWoodL', 'wood', { scale: 6, local: true, rough: 0.6 })
  Object.values(MAT).forEach(m => { const sm = m as THREE.MeshStandardMaterial; if (sm.isMeshStandardMaterial && sm.envMapIntensity === 1) sm.envMapIntensity = 0.4 })
}

/* IBL: panorama equirretangular do céu calculado na CPU (horizonte, zênite, sol e chão),
   pré-filtrado com PMREM. Dá reflexos e luz ambiente coerentes com a hora do dia do mapa. */
let pmrem: THREE.PMREMGenerator | null = null
let envRT: THREE.WebGLRenderTarget | null = null
export function skyEnvironmentCPU(renderer: THREE.WebGLRenderer, zen: THREE.Color, hor: THREE.Color, sunC: THREE.Color, sunD: THREE.Vector3): THREE.Texture {
  pmrem ??= new THREE.PMREMGenerator(renderer)
  const W = 256, H = 128, data = new Uint8Array(W * H * 4)
  const dir = new THREE.Vector3(), c = new THREE.Color(), ground = new THREE.Color(0x3a342a)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const phi = (x / W) * Math.PI * 2, th = (y / H) * Math.PI
    dir.set(-Math.sin(th) * Math.cos(phi), Math.cos(th), -Math.sin(th) * Math.sin(phi))
    const h = dir.y
    if (h >= 0) c.copy(hor).lerp(zen, Math.pow(h, 0.55))
    else c.copy(hor).multiplyScalar(0.78).lerp(ground, Math.min(1, -h * 3))
    const sd = Math.max(0, dir.dot(sunD))
    c.r += sunC.r * (Math.pow(sd, 24) * 0.45 + Math.pow(sd, 4) * 0.12)
    c.g += sunC.g * (Math.pow(sd, 24) * 0.45 + Math.pow(sd, 4) * 0.12)
    c.b += sunC.b * (Math.pow(sd, 24) * 0.45 + Math.pow(sd, 4) * 0.12)
    const i = ((H - 1 - y) * W + x) * 4
    data[i] = Math.min(255, c.r * 255); data[i + 1] = Math.min(255, c.g * 255); data[i + 2] = Math.min(255, c.b * 255); data[i + 3] = 255
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat)
  tex.mapping = THREE.EquirectangularReflectionMapping
  tex.encoding = THREE.sRGBEncoding
  tex.needsUpdate = true
  envRT?.dispose()
  envRT = pmrem.fromEquirectangular(tex)
  tex.dispose()
  return envRT.texture
}

/* IBL fotográfico: HDRI CC0 (Poly Haven via @pmndrs/assets) pré-filtrado com PMREM.
   Enquanto o EXR decodifica, a cena usa o panorama da CPU (skyEnvironmentCPU). */
const HDRIS: Record<string, string> = { sunset: hdriSunset, sky: hdriSky, city: hdriCity }
const hdriCache = new Map<string, THREE.Texture>()
export async function hdriEnvironment(renderer: THREE.WebGLRenderer, key: string): Promise<THREE.Texture> {
  const hit = hdriCache.get(key); if (hit) return hit
  pmrem ??= new THREE.PMREMGenerator(renderer)
  const buf = await (await fetch(HDRIS[key])).arrayBuffer()
  const loader = new EXRLoader()
  const d = loader.parse(buf) as unknown as { data: ArrayBufferView; width: number; height: number; format: THREE.PixelFormat; type: THREE.TextureDataType }
  const tex = new THREE.DataTexture(d.data as unknown as BufferSource & ArrayBufferView, d.width, d.height, d.format, d.type)
  tex.mapping = THREE.EquirectangularReflectionMapping
  tex.encoding = THREE.LinearEncoding
  tex.minFilter = tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  tex.flipY = false
  tex.needsUpdate = true
  const rt = pmrem.fromEquirectangular(tex)
  tex.dispose()
  hdriCache.set(key, rt.texture)
  return rt.texture
}

/* ---------------- pós-processamento ---------------- */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, exposure: { value: 1.0 }, time: { value: 0 },
    vignette: { value: 0.32 }, grain: { value: 0.035 }, saturation: { value: 1.08 },
    lift: { value: new THREE.Vector3(0.01, 0.012, 0.02) },       // sombras levemente frias
    gain: { value: new THREE.Vector3(1.04, 1.0, 0.94) },          // altas quentes (look BO2)
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float exposure, time, vignette, grain, saturation; uniform vec3 lift, gain;
    varying vec2 vUv;
    vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5;
      // aberração cromática sutil nas bordas
      float ca = dot(d, d) * 0.004;
      vec3 c = vec3(texture2D(tDiffuse, vUv + d * ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - d * ca).b);
      c = aces(c * exposure);
      c = c * gain + lift * (1.0 - c);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, saturation);
      c *= 1.0 - vignette * smoothstep(0.35, 0.85, length(d * vec2(1.25, 1.0)));
      c = pow(c, vec3(1.0 / 2.2));                                    // saída sRGB
      c += (rnd(vUv * 1000.0) - 0.5) * grain;
      gl_FragColor = vec4(c, 1.0);
    }`,
}

/* Desenha a arma em 1ª pessoa por cima da cena, dentro do mesmo buffer (ela também recebe a gradação). */
class OverlayPass extends Pass {
  overlay: THREE.Scene; cam: THREE.Camera; active: () => boolean
  constructor(overlay: THREE.Scene, cam: THREE.Camera, active: () => boolean) {
    super(); this.overlay = overlay; this.cam = cam; this.active = active; this.needsSwap = false
  }
  render(renderer: THREE.WebGLRenderer, _w: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    if (!this.active()) return
    const auto = renderer.autoClear
    renderer.autoClear = false
    renderer.setRenderTarget(readBuffer)
    renderer.clearDepth()
    renderer.render(this.overlay, this.cam)
    renderer.autoClear = auto
  }
}

export interface PostFX {
  render(dt: number): void
  setSize(w: number, h: number): void
  setQuality(q: Quality): void
  /** gradação por mapa (saturação, lift nas sombras, gain nas altas) */
  setGrade(g: Grade): void
}
export interface Grade { saturation?: number; lift?: [number, number, number]; gain?: [number, number, number]; exposure?: number }
const GRADE_DEFAULT: Required<Grade> = { saturation: 1.08, lift: [0.01, 0.012, 0.02], gain: [1.04, 1.0, 0.94], exposure: 1 }

export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera,
  gunScene: THREE.Scene, gunCamera: THREE.Camera, showGun: () => boolean, exposure: number): PostFX {
  const size = new THREE.Vector2(); renderer.getSize(size)
  const pr = renderer.getPixelRatio()
  const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    // com stencil a r128 aloca DEPTH24_STENCIL8; sem ele o depth é de 16 bits e superfícies próximas
    // (janelas, decalques, faixas de asfalto) brigam a distância
    stencilBuffer: true,
  })
  const composer = new EffectComposer(renderer, rt)
  const renderPass = new RenderPass(scene, camera)
  const sao = new SAOPass(scene, camera, false, true)
  Object.assign(sao.params, { saoIntensity: 0.012, saoScale: 6, saoKernelRadius: 22, saoMinResolution: 0, saoBlur: true, saoBlurRadius: 6, saoBlurStdDev: 3, saoBlurDepthCutoff: 0.01 })
  // fumaça, traçantes e marcadores não entram na oclusão (evita halos escuros)
  const saoRender = sao.render.bind(sao)
  const hidden: THREE.Object3D[] = []
  sao.render = (...args: Parameters<typeof saoRender>) => {
    scene.traverseVisible(o => { if ((o as THREE.Sprite).isSprite || (o as THREE.Line).isLine || (o as THREE.Points).isPoints) hidden.push(o) })
    hidden.forEach(o => (o.visible = false))
    saoRender(...args)
    hidden.forEach(o => (o.visible = true)); hidden.length = 0
  }
  const gun = new OverlayPass(gunScene, gunCamera, showGun)
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.28, 0.5, 1.6)   // só sol, clarões e fogo
  const grade = new ShaderPass(GradeShader)
  grade.uniforms.exposure.value = exposure * 1.2        // mesma escala do ACES do renderer (r128 divide por 0,6)
  const smaa = new SMAAPass(size.x * pr, size.y * pr)
  ;[renderPass, sao, gun, bloom, grade, smaa].forEach(p => composer.addPass(p))

  let quality: Quality = 'alta'
  let gradeExp = 1                                         // ajuste de exposição do mapa atual
  const apply = () => {
    const post = quality !== 'baixa'
    renderer.toneMapping = post ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = exposure * gradeExp
    sao.enabled = quality === 'alta'
    smaa.enabled = quality === 'alta'
    bloom.enabled = post
  }
  apply()

  return {
    render(dt) {
      if (quality === 'baixa') {
        renderer.setRenderTarget(null)
        renderer.clear(); renderer.render(scene, camera)
        if (showGun()) { renderer.autoClear = false; renderer.clearDepth(); renderer.render(gunScene, gunCamera); renderer.autoClear = true }
        return
      }
      grade.uniforms.time.value = (grade.uniforms.time.value + dt) % 100
      composer.render(dt)
    },
    setSize(w, h) { composer.setSize(w, h); bloom.setSize(w / 2, h / 2) },
    setQuality(q) { quality = q; apply() },
    setGrade(g) {
      const v = { ...GRADE_DEFAULT, ...g }
      grade.uniforms.saturation.value = v.saturation
      grade.uniforms.lift.value.set(...v.lift)
      grade.uniforms.gain.value.set(...v.gain)
      gradeExp = v.exposure
      grade.uniforms.exposure.value = exposure * 1.2 * gradeExp
      apply()
    },
  }
}
