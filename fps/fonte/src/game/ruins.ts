/* Peças visuais do mapa Ruínas geradas por código (sem arquivos externos):
   vidro trincado com furos de bala, cacos presos na moldura, decalques de parede
   (rajada de tiros e fuligem) e fios de poste em catenária. */
import * as THREE from 'three'
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/* Gerador pseudoaleatório com semente: o vidro sai igual a cada partida. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

type Draw = (ctx: CanvasRenderingContext2D, alpha: boolean) => void
/** Desenha a mesma arte duas vezes: cor (map) e opacidade (alphaMap, lida no canal verde). */
function pair(size: number, draw: Draw) {
  const mk = (alpha: boolean) => {
    const c = document.createElement('canvas'); c.width = c.height = size
    const x = c.getContext('2d')!
    draw(x, alpha)
    const t = new THREE.CanvasTexture(c)
    t.anisotropy = 4
    if (!alpha) t.encoding = THREE.sRGBEncoding
    return t
  }
  return { map: mk(false), alphaMap: mk(true) }
}

/* Estrela de trincas de um impacto: raios irregulares + anéis quebrados entre eles. */
function impactStar(x: CanvasRenderingContext2D, r: () => number, cx: number, cy: number, R: number, alpha: boolean) {
  const n = 9 + Math.floor(r() * 7)
  const ang: number[] = []
  for (let i = 0; i < n; i++) ang.push((i + r() * 0.6) / n * Math.PI * 2)
  x.strokeStyle = alpha ? 'rgba(255,255,255,0.85)' : 'rgba(250,252,255,0.95)'
  x.lineCap = 'round'
  const tips: [number, number][][] = []
  ang.forEach(a => {
    const len = R * (0.45 + r() * 0.8)
    let px = cx, py = cy
    const pts: [number, number][] = [[px, py]]
    x.lineWidth = 1.4
    x.beginPath(); x.moveTo(px, py)
    const seg = 5 + Math.floor(r() * 4)
    for (let s = 1; s <= seg; s++) {
      const d = len * s / seg, aa = a + (r() - 0.5) * 0.35
      px = cx + Math.cos(aa) * d; py = cy + Math.sin(aa) * d
      x.lineTo(px, py); pts.push([px, py])
    }
    x.stroke()
    tips.push(pts)
  })
  // anéis concêntricos (teia de aranha), só entre raios vizinhos e com falhas
  x.lineWidth = 1
  for (let ring = 1; ring <= 3; ring++) {
    for (let i = 0; i < tips.length; i++) {
      if (r() < 0.3) continue
      const a = tips[i], b = tips[(i + 1) % tips.length]
      const k = Math.min(a.length, b.length) - 1, j = Math.max(1, Math.round(k * ring / 4))
      if (!a[j] || !b[j]) continue
      x.beginPath(); x.moveTo(a[j][0], a[j][1])
      x.quadraticCurveTo((a[j][0] + b[j][0]) / 2 + (r() - 0.5) * 6, (a[j][1] + b[j][1]) / 2 + (r() - 0.5) * 6, b[j][0], b[j][1])
      x.stroke()
    }
  }
  // furo: miolo aberto (alfa 0) com borda moída e branca
  const hole = 3 + r() * 3
  x.fillStyle = alpha ? 'rgba(255,255,255,0.95)' : 'rgba(235,240,242,1)'
  x.beginPath(); x.arc(cx, cy, hole * 2.4, 0, Math.PI * 2); x.fill()
  x.save(); x.globalCompositeOperation = 'destination-out'
  x.beginPath(); x.arc(cx, cy, hole, 0, Math.PI * 2); x.fill(); x.restore()
  if (alpha) { x.fillStyle = '#000'; x.beginPath(); x.arc(cx, cy, hole, 0, Math.PI * 2); x.fill() }
}

/** Vidro de vitrine trincado: tom escuro translúcido, rachaduras longas e impactos de bala. */
export function crackedGlass(seed: number) {
  const S = 512
  return pair(S, (x, alpha) => {
    const r = rng(seed)
    x.fillStyle = alpha ? 'rgb(92,92,92)' : 'rgb(120,132,136)'       // ~36% opaco: dá para ver através
    x.fillRect(0, 0, S, S)
    // sujeira e poeira acumulada na parte de baixo
    const g = x.createLinearGradient(0, S, 0, S * 0.55)
    g.addColorStop(0, alpha ? 'rgba(255,255,255,0.55)' : 'rgba(190,176,150,0.8)'); g.addColorStop(1, 'rgba(0,0,0,0)')
    x.fillStyle = g; x.fillRect(0, 0, S, S)
    // trincas longas atravessando o painel
    x.strokeStyle = alpha ? 'rgba(255,255,255,0.7)' : 'rgba(245,248,250,0.9)'
    for (let i = 0; i < 5; i++) {
      x.lineWidth = 1 + r()
      let px = r() * S, py = r() < 0.5 ? 0 : S
      x.beginPath(); x.moveTo(px, py)
      for (let s = 0; s < 14; s++) { px += (r() - 0.5) * 70; py += (py < S / 2 ? 1 : -1) * (20 + r() * 30); x.lineTo(px, py) }
      x.stroke()
    }
    const hits = 3 + Math.floor(r() * 4)
    for (let i = 0; i < hits; i++) impactStar(x, r, S * (0.15 + r() * 0.7), S * (0.2 + r() * 0.6), 60 + r() * 110, alpha)
  })
}

/** Vitrine estourada: só sobram cacos pontudos presos na moldura. */
export function shatteredGlass(seed: number) {
  const S = 512
  return pair(S, (x, alpha) => {
    const r = rng(seed)
    x.clearRect(0, 0, S, S)
    if (alpha) { x.fillStyle = '#000'; x.fillRect(0, 0, S, S) }
    const shard = (ex: (t: number) => [number, number], inward: [number, number]) => {
      const n = 7 + Math.floor(r() * 5)
      x.fillStyle = alpha ? 'rgb(120,120,120)' : 'rgb(128,140,144)'
      x.strokeStyle = alpha ? 'rgba(255,255,255,0.8)' : 'rgba(240,245,248,0.9)'
      x.lineWidth = 1.2
      x.beginPath()
      const [sx, sy] = ex(0); x.moveTo(sx, sy)
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n, tm = (t0 + t1) / 2 + (r() - 0.5) * 0.4 / n
        const depth = 12 + Math.pow(r(), 2) * 150
        const [mx, my] = ex(tm)
        x.lineTo(mx + inward[0] * depth, my + inward[1] * depth)
        const [bx, by] = ex(t1); x.lineTo(bx, by)
      }
      x.closePath(); x.fill(); x.stroke()
    }
    shard(t => [t * S, 0], [0, 1])
    shard(t => [t * S, S], [0, -1])
    shard(t => [0, t * S], [1, 0])
    shard(t => [S, t * S], [-1, 0])
  })
}

/** Atlas de decalques (2 células): rajada de tiros e mancha de fuligem. */
export function wallDecals() {
  const W = 512, H = 256
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const x = c.getContext('2d')!
  const r = rng(77)
  // célula 0: rajada (buracos com lasca clara em volta e miolo escuro)
  for (let i = 0; i < 18; i++) {
    const px = 128 + (r() - 0.5) * 210 * r(), py = 128 + (r() - 0.5) * 200 * r(), s = 2.5 + r() * 3.5
    const g = x.createRadialGradient(px, py, 0, px, py, s * 2.4)
    g.addColorStop(0, 'rgba(16,14,12,1)'); g.addColorStop(0.4, 'rgba(34,30,27,0.9)')
    g.addColorStop(0.5, 'rgba(176,166,150,0.4)'); g.addColorStop(1, 'rgba(170,160,145,0)')
    x.fillStyle = g; x.beginPath(); x.arc(px, py, s * 2.4, 0, Math.PI * 2); x.fill()
  }
  // célula 1: fuligem de explosão, borda irregular
  const cx = 384, cy = 128
  for (let i = 0; i < 90; i++) {
    const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * 100, s = 20 + r() * 40
    const px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d * 0.9
    const g = x.createRadialGradient(px, py, 0, px, py, s)
    g.addColorStop(0, 'rgba(14,12,10,0.22)'); g.addColorStop(1, 'rgba(14,12,10,0)')
    x.fillStyle = g; x.beginPath(); x.arc(px, py, s, 0, Math.PI * 2); x.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.encoding = THREE.sRGBEncoding
  t.anisotropy = 4
  return t
}

/** Plano de decalque na célula `cell` do atlas, já posicionado (para juntar num único mesh). */
export function decalQuad(cell: number, pos: THREE.Vector3, normal: THREE.Vector3, size: number, spin: number) {
  const g = new THREE.PlaneGeometry(size, size)
  const uv = g.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) + cell) / 2)
  const o = new THREE.Object3D()
  o.position.copy(pos).addScaledVector(normal, 0.02)
  o.lookAt(pos.clone().add(normal))
  o.rotateZ(spin)
  o.updateMatrix()
  g.applyMatrix4(o.matrix)
  return g
}

/** Fio pendurado entre dois pontos (catenária aproximada por parábola), como tubo fino. */
export function cable(a: THREE.Vector3, b: THREE.Vector3, sag: number, radius = 0.018) {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= 16; i++) {
    const t = i / 16
    pts.push(new THREE.Vector3().lerpVectors(a, b, t).add(new THREE.Vector3(0, -sag * 4 * t * (1 - t), 0)))
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, radius, 4, false)
}

/** Fio arrebentado: sai do ponto `a`, faz barriga e termina no chão em `b`. */
export function droopingCable(a: THREE.Vector3, b: THREE.Vector3, radius = 0.02) {
  const mid = new THREE.Vector3().lerpVectors(a, b, 0.45); mid.y = Math.min(a.y, b.y) + (a.y - b.y) * 0.25
  const end = b.clone().add(new THREE.Vector3(0.8, 0, 0.3))
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, mid, b, end]), 24, radius, 4, false)
}

export function merge(geos: THREE.BufferGeometry[]) {
  const g = BufferGeometryUtils.mergeBufferGeometries(geos, false)
  geos.forEach(x => x.dispose())
  return g
}
