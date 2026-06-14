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
  const anchors     = {}
  let worldCuboidGroup = null
  let activeScenarioId = null

  // ── World cuboid ────────────────────────────────────────────────────────────

  const placeWorldCuboid = (scenarioId) => {
    const level = SCENARIO_AOD[scenarioId]
    if (level === null || level === undefined) {
      if (worldCuboidGroup) worldCuboidGroup.visible = false
      return
    }

    const {scene, camera} = XR8.Threejs.xrScene()
    if (!scene || !camera) return

    if (worldCuboidGroup) {
      scene.remove(worldCuboidGroup)
      worldCuboidGroup = null
    }

    // height = raw AOD in metres — S01 4.8m / S03 5.2m / S06 7.5m / S07 5.1m
    const height = level
    const group  = new THREE.Group()

    // Water body — MeshBasicMaterial needs no lights; always renders
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(3, height, 3),
      new THREE.MeshBasicMaterial({ color:'#00BFFF', transparent:true, opacity:0.65, side:THREE.DoubleSide })
    )
    box.position.y = height / 2
    group.add(box)

    // Water surface shimmer
    const surface = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 3),
      new THREE.MeshBasicMaterial({ color:'#00DFFF', transparent:true, opacity:0.75, side:THREE.DoubleSide })
    )
    surface.rotation.x = -Math.PI / 2
    surface.position.y = height
    group.add(surface)

    // Waterline strip on back face
    const waterline = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 0.04),
      new THREE.MeshBasicMaterial({ color:0xffffff, side:THREE.DoubleSide })
    )
    waterline.position.set(0, height, -1.5)
    group.add(waterline)

    // Faint 1m reference marks
    const refMat = new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.12, side:THREE.DoubleSide })
    for (let h = 1; h <= height; h += 1) {
      const mark = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.02), refMat)
      mark.position.set(0, h, -1.5)
      group.add(mark)
    }

    // Camera-quaternion direction (same as reference project) with NaN guard:
    // if camera tilts straight down, horizontal component → zero → guard kicks in
    const dir = new THREE.Vector3(0, 0, -1)
    dir.applyQuaternion(camera.quaternion)
    dir.y = 0
    if (dir.lengthSq() < 0.001) dir.set(0, 0, -1)
    dir.normalize()
    group.position.copy(camera.position)
    group.position.addScaledVector(dir, 2)
    group.position.y = 0

    scene.add(group)
    worldCuboidGroup = group
  }

  // ── Scene init ──────────────────────────────────────────────────────────────

  const onStart = async ({canvas}) => {
    const {scene, camera, renderer} = XR8.Threejs.xrScene()

    scene.add(new THREE.AmbientLight(0x404040, 5))
    const sun = new THREE.DirectionalLight(0xffffff, 1)
    sun.position.set(2, 1, 1)
    scene.add(sun)

    // Upright PNG plane for each scenario card (image targets 1–5)
    Object.entries(SCENARIO_CONFIG).forEach(([scenarioId, config]) => {
      const texture = new THREE.TextureLoader().load(`./textures/${config.texture}`)
      const plane   = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map:texture, transparent:true, opacity:0.85, side:THREE.DoubleSide })
      )
      // rotation.x = -π/2 lays the plane flat on the card surface.
      // In 8th Wall's image target frame, local +Y is the card normal (toward camera);
      // the default PlaneGeometry (XY, normal = +Z) would stand vertical on the card.
      plane.rotation.x   = -Math.PI / 2
      plane.position.y   = 0.01   // tiny lift above card surface in the normal (+Y) direction
      plane.userData.sid = scenarioId

      const anchor = new THREE.Group()
      anchor.visible = false
      anchor.add(plane)
      scene.add(anchor)
      anchors[scenarioId] = anchor
    })

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

    // Terrain backdrop marker — just track, no content
    if (detail.name === '3D_Model_Print' || detail.name === 'image_target_6') return

    const scenarioId = TARGET_TO_SCENARIO[detail.name]
    if (!scenarioId) { console.warn('Unknown target:', detail.name); return }

    const anchor = anchors[scenarioId]
    if (!anchor) return

    anchor.position.copy(detail.position)
    anchor.position.y += 0.05
    if (detail.quaternion) anchor.quaternion.copy(detail.quaternion)
    else if (detail.rotation) anchor.rotation.copy(detail.rotation)
    anchor.scale.setScalar(detail.scale)
    anchor.visible = true

    activeScenarioId = scenarioId
    placeWorldCuboid(scenarioId)
    updateFactorPanel(scenarioId)
  }

  const hideTarget = ({detail}) => {
    const scenarioId = TARGET_TO_SCENARIO[detail.name]
    if (!scenarioId) return
    const anchor = anchors[scenarioId]
    if (anchor) anchor.visible = false
  }

  return {
    name: 'flood-ar',
    onStart,
    listeners: [
      {event: 'reality.imagefound',   process: showTarget},
      {event: 'reality.imageupdated', process: showTarget},
      {event: 'reality.imagelost',    process: hideTarget},
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
