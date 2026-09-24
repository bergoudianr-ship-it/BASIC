/* Decodifica malhas exportadas do Trimble SketchUp (ver assets/m4a1-sketchup.ts)
   e gera BufferGeometry com normais por ângulo de vinco: quinas vivas continuam
   duras e superfícies curvas (cano, tubo, anéis) ficam suaves. */
import * as THREE from 'three'
import { M4A1_MESH, M4A1_PARTS } from './assets/m4a1-sketchup'

export interface MeshPart { name: string; mat: string; geometry: THREE.BufferGeometry }

function decodeB64(s: string): Uint8Array {
  const bin = atob(s), out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/* Normais suavizadas só entre faces com ângulo menor que creaseDeg. */
function creasedGeometry(pos: Float32Array, creaseDeg: number): THREE.BufferGeometry {
  const triCount = pos.length / 9
  const fn = new Float32Array(triCount * 3)
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  for (let t = 0; t < triCount; t++) {
    a.fromArray(pos, t * 9); b.fromArray(pos, t * 9 + 3); c.fromArray(pos, t * 9 + 6)
    const n = b.sub(a).cross(c.sub(a)).normalize()
    fn[t * 3] = n.x; fn[t * 3 + 1] = n.y; fn[t * 3 + 2] = n.z
  }
  const key = (i: number) => `${Math.round(pos[i] * 1e5)},${Math.round(pos[i + 1] * 1e5)},${Math.round(pos[i + 2] * 1e5)}`
  const byVert = new Map<string, number[]>()
  for (let v = 0; v < triCount * 3; v++) {
    const k = key(v * 3); const l = byVert.get(k); if (l) l.push(Math.floor(v / 3)); else byVert.set(k, [Math.floor(v / 3)])
  }
  const cos = Math.cos(THREE.MathUtils.degToRad(creaseDeg))
  const nrm = new Float32Array(pos.length)
  for (let v = 0; v < triCount * 3; v++) {
    const t = Math.floor(v / 3)
    let x = 0, y = 0, z = 0
    for (const o of byVert.get(key(v * 3))!) {
      const d = fn[t * 3] * fn[o * 3] + fn[t * 3 + 1] * fn[o * 3 + 1] + fn[t * 3 + 2] * fn[o * 3 + 2]
      if (d >= cos) { x += fn[o * 3]; y += fn[o * 3 + 1]; z += fn[o * 3 + 2] }
    }
    const l = Math.hypot(x, y, z) || 1
    nrm[v * 3] = x / l; nrm[v * 3 + 1] = y / l; nrm[v * 3 + 2] = z / l
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
  g.computeBoundingBox(); g.computeBoundingSphere()
  return g
}

let m4Cache: MeshPart[] | null = null
/** Peças da M4A1 (metros, espaço do jogo). Geometrias compartilhadas entre todas as instâncias. */
export function m4a1Parts(): MeshPart[] {
  if (m4Cache) return m4Cache
  const buf = decodeB64(M4A1_MESH), dv = new DataView(buf.buffer)
  let o = 0
  m4Cache = M4A1_PARTS.map(label => {
    const [name, mat] = label.split('|')
    const nv = dv.getUint16(o, true), nt = dv.getUint16(o + 2, true); o += 4
    const verts = new Float32Array(nv * 3)
    for (let i = 0; i < nv * 3; i++) { verts[i] = dv.getInt16(o, true) * 0.0001; o += 2 }  // 0,1 mm → m
    const pos = new Float32Array(nt * 9)
    for (let i = 0; i < nt * 3; i++) { const vi = buf[o++]; pos[i * 3] = verts[vi * 3]; pos[i * 3 + 1] = verts[vi * 3 + 1]; pos[i * 3 + 2] = verts[vi * 3 + 2] }
    return { name, mat, geometry: creasedGeometry(pos, 40) }
  })
  return m4Cache
}
