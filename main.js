import './style.css'
import * as THREE from 'three'

// 8th Wall's Threejs pipeline module reads THREE from window — spread required
window.THREE = { ...THREE }

// ── DATA ─────────────────────────────────────────────────────────────────────

const SCENARIO_CONFIG = {
  flood_current:      { target: 'image-target-1', texture: 'flood_current.png',      name: 'S01 — Present Day (4.8m AOD)',  color: '#1A2E4A', aod: 4.8  },
  flood_2050_high:    { target: 'image_target_2',  texture: 'flood_2050_high.png',    name: 'S03 — 2050 High (5.2m AOD)',    color: '#4D4FA1', aod: 5.2  },
  flood_2100_extreme: { target: 'image_target_3',  texture: 'flood_2100_extreme.png', name: 'S06 — 2100 Extreme (7.5m AOD)', color: '#7E1416', aod: 7.5  },
  flood_development:  { target: 'image_target_4',  texture: 'flood_development.png',  name: 'S07 — Development (5.1m AOD)',  color: '#934220', aod: 5.1  },
  zone_filterbeds:    { target: 'image_target_5',  texture: 'zone_filterbeds.png',    name: 'S08 — Filter Beds Restored',    color: '#1A6634', aod: null },
}

// Maps the image target name (from JSON "name" field) → scenarioId
const TARGET_TO_SCENARIO = Object.fromEntries(
  Object.entries(SCENARIO_CONFIG).map(([id, c]) => [c.target, id])
)
// image_target_6 "name" in its JSON is "3D_Model_Print" — terrain marker, no scenario

const SCENARIO_AOD = {
  flood_current:      4.8,
  flood_2050_high:    5.2,
  flood_2100_extreme: 7.5,
  flood_development:  5.1,
  zone_filterbeds:    null,
}

const FACTOR_DATA = {
  flood_current:      { surface:{cls:'orange',val:'Mixed'},      density:{cls:'orange',val:'Medium'},   sewage:{cls:'orange',val:'Limited'},     trees:{cls:'orange',val:'Some'}   },
  flood_2050_high:    { surface:{cls:'red',   val:'Impermeable'},density:{cls:'red',   val:'High'},     sewage:{cls:'red',   val:'Blocked'},      trees:{cls:'orange',val:'Lower'}  },
  flood_2100_extreme: { surface:{cls:'red',   val:'Impermeable'},density:{cls:'red',   val:'Very High'},sewage:{cls:'orange',val:'Overwhelmed'},  trees:{cls:'red',   val:'None'}   },
  flood_development:  { surface:{cls:'red',   val:'Impermeable'},density:{cls:'red',   val:'High'},     sewage:{cls:'orange',val:'Limited'},      trees:{cls:'orange',val:'Lower'}  },
  zone_filterbeds:    { surface:{cls:'green', val:'Permeable'},  density:{cls:'green', val:'Low'},      sewage:{cls:'green', val:'Restored'},     trees:{cls:'green', val:'High'}   },
}

const FACTOR_COLORS = { green: '#5dc27f', orange: '#f39c12', red: '#e34d4d' }

// ── UI ────────────────────────────────────────────────────────────────────────

const updateFactorPanel = (scenarioId) => {
  const config  = SCENARIO_CONFIG[scenarioId]
  const factors = FACTOR_DATA[scenarioId]
  const infoBar = document.getElementById('infoBar')
  const panel   = document.getElementById('detailPanel')

  if (!config || !factors) {
    if (infoBar) { infoBar.textContent = 'Point camera at a scenario card'; infoBar.style.background = 'rgba(20,20,20,0.85)' }
    if (panel)   panel.hidden = true
    return
  }

  if (infoBar) {
    infoBar.textContent = config.name
    infoBar.style.background = config.color + 'CC'
    infoBar.style.color = '#fff'
  }

  if (panel) {
    panel.hidden = false
    panel.innerHTML = `
      <h4 class="factor-heading">Flood Factors</h4>
      ${['surface','density','sewage','trees'].map(k => {
        const f     = factors[k]
        const color = FACTOR_COLORS[f.cls] || '#fff'
        const label = k.charAt(0).toUpperCase() + k.slice(1)
        return `<div class="factor-row">
          <span class="factor-name">${label}</span>
          <div class="factor-pip" style="background:${color};box-shadow:0 0 5px ${color}"></div>
          <span class="factor-val" style="color:${color}">${f.val}</span>
        </div>`
      }).join('')}
    `
  }
}

// ── PIPELINE MODULE ───────────────────────────────────────────────────────────

const imageTargetPipelineModule = () => {
  // Required by 8th Wall's GL compositor — without this Three.js objects
  // are invisible because the colour-space blend doesn't match the camera feed
  THREE.ColorManagement.enabled = false

  let worldCuboidGroup = null
  let activeScenarioId = null
  let lastCardPos = null   // set from detail.position on every imagefound/updated

  // ── World cuboid ────────────────────────────────────────────────────────────

  const placeWorldCuboid = (scenarioId) => {
    const level = SCENARIO_AOD[scenarioId]
    if (level === null || level === undefined) {
      if (worldCuboidGroup) worldCuboidGroup.visible = false
      return
    }

    const {scene} = XR8.Threejs.xrScene()
    if (!scene) return

    if (worldCuboidGroup) {
      scene.remove(worldCuboidGroup)
      worldCuboidGroup = null
    }

    // Height = flood rise above 4.8 m AOD baseline, 1:1 Three.js units
    // S01 (4.8)→0.05  |  S03 (5.2)→0.4  |  S06 (7.5)→2.7  |  S07 (5.1)→0.3
    const height = Math.max(0.05, level - 4.8)
    const group  = new THREE.Group()

    // ── Water body ──────────────────────────────────────────────────────────
    // 5×5m: walls sit ~2.5m from the camera when camera is inside —
    // safely within 8th Wall's ~3.5m far-clip plane.
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(5, height, 5),
      new THREE.MeshBasicMaterial({ color: '#00BFFF', transparent: true, opacity: 0.65, side: THREE.DoubleSide })
    )
    box.position.y = height / 2   // bottom at y=0, top at y=height
    group.add(box)

    // Wireframe edges so the box reads as 3D even with transparent fill
    const edges = new THREE.EdgesGeometry(box.geometry)
    const wireframe = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 })
    )
    wireframe.position.copy(box.position)
    group.add(wireframe)

    // Water surface on top
    const surface = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 5),
      new THREE.MeshBasicMaterial({ color: '#40E0FF', transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    )
    surface.rotation.x = -Math.PI / 2
    surface.position.y = height
    group.add(surface)

    // ── Placement ────────────────────────────────────────────────────────────
    // Camera sits at y=0. Group y=0 puts the box floor at camera height so
    // the camera is at the base of the volume looking into it.
    // XZ: project 2 m beyond the card so the box centre is reachable but the
    // near face stays close to camera. This is the same logic from the commit
    // that first rendered the box (even if it was "all blue").
    if (lastCardPos) {
      const toCard = new THREE.Vector3(lastCardPos.x, 0, lastCardPos.z)
      const dist   = toCard.length() || 1
      toCard.normalize()
      group.position.set(toCard.x * (dist + 2), 0, toCard.z * (dist + 2))
      console.log('[flood-ar] box placed — dist:', dist.toFixed(2), 'height:', height.toFixed(2), 'pos:', group.position)
      console.log('[flood-ar] near face dist:', ((dist + 2) - 2.5).toFixed(2), 'far face dist:', ((dist + 2) + 2.5).toFixed(2))
    } else {
      group.position.set(0, 0, -2)
      console.log('[flood-ar] box placed at fallback (0,0,-2) — height:', height.toFixed(2))
    }

    scene.add(group)
    worldCuboidGroup = group
  }

  // ── Scene init ──────────────────────────────────────────────────────────────

  const onStart = async ({canvas}) => {
    const {camera} = XR8.Threejs.xrScene()

    XR8.XrController.updateCameraProjectionMatrix({ origin:camera.position, facing:camera.quaternion })

    // Tap info bar to toggle cuboid
    document.getElementById('infoBar')?.addEventListener('click', () => {
      if (!activeScenarioId) return
      if (worldCuboidGroup?.visible) { worldCuboidGroup.visible = false }
      else { placeWorldCuboid(activeScenarioId) }
    })
  }

  // ── Image target events ─────────────────────────────────────────────────────

  const showTarget = ({detail}) => {
    console.log('imagefound:', detail.name)

    if (detail.name === '3D_Model_Print' || detail.name === 'image_target_6') return

    const scenarioId = TARGET_TO_SCENARIO[detail.name]
    if (!scenarioId) { console.warn('Unknown target:', detail.name); return }

    activeScenarioId = scenarioId
    lastCardPos = detail.position
    placeWorldCuboid(scenarioId)
    updateFactorPanel(scenarioId)
  }

  return {
    name: 'flood-ar',
    onStart,
    listeners: [
      {event: 'reality.imagefound',   process: showTarget},
      {event: 'reality.imageupdated', process: showTarget},
    ],
  }
}

// ── IMAGE TARGET LOADER ───────────────────────────────────────────────────────

async function loadImageTargetsFromJson(url) {
  const res = await fetch(url, {cache: 'no-store'})
  if (!res.ok) { console.warn(`Image target not found: ${url}`); return [] }
  const raw     = await res.json()
  const targets = Array.isArray(raw) ? raw : [raw]
  return targets.map(t => ({
    name:       t.name,
    type:       t.type || 'PLANAR',
    imagePath:  t.imagePath,
    metadata:   t.metadata ?? {},
    properties: t.properties || t.xrMetadata || undefined,
    xrMetadata: t.properties || t.xrMetadata || undefined,
    resources:  t.resources,
    created:    t.created,
    updated:    t.updated,
  }))
}

// ── STARTUP ───────────────────────────────────────────────────────────────────

const onxrloaded = async () => {
  try {
    const [t1,t2,t3,t4,t5,t6] = await Promise.all([
      loadImageTargetsFromJson('./image-targets/image-target-1.json'),
      loadImageTargetsFromJson('./image-targets/image_target_2.json'),
      loadImageTargetsFromJson('./image-targets/image_target_3.json'),
      loadImageTargetsFromJson('./image-targets/image_target_4.json'),
      loadImageTargetsFromJson('./image-targets/image_target_5.json'),
      loadImageTargetsFromJson('./image-targets/image_target_6.json'),
    ])
    const imageTargets = [...t1,...t2,...t3,...t4,...t5,...t6]
    console.log('Loaded image targets:', imageTargets.map(t => t.name))

    XR8.XrController.configure({
      imageTargetData:      imageTargets,
      disableWorldTracking: true,  // image-target-only AR; SLAM not needed
    })

    XR8.addCameraPipelineModules([
      XR8.GlTextureRenderer.pipelineModule(),
      XR8.Threejs.pipelineModule(),
      XR8.XrController.pipelineModule(),
      XRExtras.AlmostThere.pipelineModule(),
      XRExtras.FullWindowCanvas.pipelineModule(),
      XRExtras.Loading.pipelineModule(),
      XRExtras.RuntimeError.pipelineModule(),
      imageTargetPipelineModule(),
    ])

    XR8.run({
      canvas:         document.getElementById('camerafeed'),
      allowedDevices: XR8.XrConfig.device().ANY,
    })
  } catch (e) {
    console.error('Flood AR init failed:', e)
    XRExtras?.RuntimeError?.showRuntimeError?.()
  }
}

const load = () => XRExtras.Loading.showLoading({onxrloaded})

if (window.XR8)       { onxrloaded() } else { window.addEventListener('xrloaded',      onxrloaded, {once:true}) }
if (window.XRExtras)  { load()       } else { window.addEventListener('xrextrasloaded', load,       {once:true}) }
