/**
 * PumpModel — Carrega o GLB e organiza os componentes
 */
import * as BABYLON from '@babylonjs/core'
import '@babylonjs/loaders/glTF'
import { MESH_MAP } from '../utils/constants.js'

export class PumpModel {
  constructor(scene) {
    this.scene     = scene
    this.rootNode  = null   // TransformNode raiz
    this.parts     = {}     // { key: mesh/node }
    this.originPos = {}     // posições montadas
    this.originRot = {}
    this.meta      = {}     // dados do componentes.json
    this._unmapped = []
    this.loaded    = false
  }

  async load() {
    // Carregar metadados
    try {
      const res  = await fetch(import.meta.env.BASE_URL + 'assets/componentes.json')
      this.meta  = await res.json()
    } catch (e) { console.warn('componentes.json não carregado') }

    // Criar nó raiz para agrupar toda a bomba
    this.rootNode = new BABYLON.TransformNode('bomba_root', this.scene)
    this.rootNode.position = new BABYLON.Vector3(0, 0.0, 0)
    // Rotação: -90° em X coloca a bomba na horizontal (eixo ao longo de Z)
    // Inventor: eixo da bomba em X, exportado com Z=up pelo FreeCAD
    // X:-90 corrige Z-up→Y-up, Y:+90 gira para ficar de frente
    // SolidWorks 2025 GLB: Z-up, eixo da bomba ao longo de X
    // X:-90° converte Z-up → Y-up (fica horizontal)
    // Escala 3x para proporção correta no ambiente 360°
    this.rootNode.rotation = new BABYLON.Vector3(0, 0, 0)
    this.rootNode.scaling  = new BABYLON.Vector3(4, 4, 4)

    // Tentar carregar GLB
    try {
      const result = await BABYLON.SceneLoader.ImportMeshAsync(
        '', import.meta.env.BASE_URL + 'assets/', 'bomba.glb', this.scene
      )
      this._parseGLB(result.meshes)
      console.log('✅ GLB carregado. Peças:', Object.keys(this.parts).length)
      if (this._unmapped.length) {
        console.warn('⚠️ Não mapeados:', this._unmapped.length, 'meshes')
      }
    } catch (e) {
      console.warn('⚠️ bomba.glb não encontrado — modelo procedural ativo')
      this._buildProcedural()
    }

    this._storeOrigins()
    this._applyShadows()
    this._applyColorOverrides()
    this.loaded = true
  }

  _parseGLB(meshes) {
    // Reparentar todos os meshes para o rootNode
    meshes.forEach(m => {
      if (m && !m.parent) m.parent = this.rootNode
    })

    meshes.forEach(mesh => {
      if (!mesh.name || mesh.name === '__root__') return

      // Limpar nome: remover _primitiveN mas NÃO remover sufixos numéricos
      // pois "wear_ring" e "pump_impeller" são peças diferentes
      const clean = mesh.name
        .replace(/_primitive\d+$/i, '')  // remove _primitive0
        .trim()

      const key = this._matchName(clean) ?? this._matchName(mesh.name)

      if (key) {
        // Verificar se já existe esta chave — se sim, criar chave com sufixo
        // Ex: wear_ring já existe → criar wear_ring_2, wear_ring_3 etc
        let finalKey = key
        if (this.parts[key]) {
          // Contar quantas instâncias já existem
          let n = 2
          while (this.parts[key + '_' + n]) n++
          finalKey = key + '_' + n
          // Registrar no meta como a mesma peça
        }
        this.parts[finalKey] = mesh
        mesh.metadata = { ...(mesh.metadata || {}), partKey: finalKey, baseKey: key }
      } else {
        this._unmapped.push(mesh.name)
      }
    })
  }

  _matchName(raw) {
    if (!raw) return null
    const variants = [
      raw,                                    // original: moteur_wftp2-1_146b3t-1
      raw.replace(/_primitive\d+$/i, ''),    // sem _primitive0
      raw.replace(/[-_]\d+$/,       ''),    // sem sufixo -1 ou _1
      raw.replace(/[-_]\d+/g,       ''),    // sem TODOS os sufixos numéricos
      raw.replace(/-\d+_\d+[a-z]+\d+$/i,''), // sem -1_146b3t020
      raw.split('-')[0],                      // só antes do primeiro hífen: moteur_wftp2
      raw.split('_')[0],                      // só antes do primeiro underscore: moteur
      raw.replace(/[_-]/g,           ' '),   // underscores/hífens → espaço
    ]
    for (const v of variants) {
      const low = v.toLowerCase().trim()
      if (!low || low.length < 3) continue
      for (const { fragment, key } of MESH_MAP) {
        if (low.includes(fragment.toLowerCase())) return key
      }
    }
    return null
  }

  // Modelo procedural de demonstração
  _buildProcedural() {
    const s = this.scene
    const r = this.rootNode

    const pbr = (name, color, m=0.7, rg=0.5) => {
      const mat = new BABYLON.PBRMaterial(name, s)
      mat.albedoColor = new BABYLON.Color3(...color)
      mat.metallic    = m
      mat.roughness   = rg
      mat.usePhysicalLightFalloff = false
      mat.environmentIntensity    = 0.0
      mat.directIntensity         = 0.8
      mat.specularIntensity       = m > 0.7 ? 0.5 : 0.2
      mat.microSurface            = 0.8
      return mat
    }

    const azul   = pbr('m_azul',   [0.10, 0.22, 0.55])
    const dourado = pbr('m_dour',  [0.65, 0.52, 0.10], 0.9, 0.15)
    const teal   = pbr('m_teal',   [0.15, 0.55, 0.60])
    const cinza  = pbr('m_cinza',  [0.40, 0.40, 0.43], 0.8, 0.3)
    const preto  = pbr('m_preto',  [0.12, 0.12, 0.14], 0.7, 0.5)
    const vermelho = pbr('m_verm', [0.55, 0.08, 0.08], 0.5, 0.5)

    const add = (name, mesh, mat, pos, rotZ=0) => {
      mesh.parent   = r
      mesh.position = new BABYLON.Vector3(...pos)
      if (rotZ) mesh.rotation.z = rotZ
      mesh.material = mat
      this.parts[name] = mesh
      return mesh
    }

    // Base
    const base = BABYLON.MeshBuilder.CreateBox('support', {width:1.4,height:0.07,depth:0.55}, s)
    add('support', base, pbr('m_base',[0.08,0.15,0.42]), [0,-0.32,0])

    // Carcaça
    const carc = BABYLON.MeshBuilder.CreateCylinder('pump_casing', {diameter:0.55,height:0.30,tessellation:48}, s)
    add('pump_casing', carc, azul, [-0.35,0,0], Math.PI/2)

    // Rotor
    const rotorN = new BABYLON.TransformNode('pump_impeller', s)
    rotorN.parent = r; rotorN.position.set(-0.35,0,0)
    const disco = BABYLON.MeshBuilder.CreateCylinder('imp_d',{diameter:0.38,height:0.10,tessellation:48},s)
    disco.parent = rotorN; disco.material = dourado
    for (let i=0;i<7;i++){
      const ang=(i/7)*Math.PI*2
      const pa=BABYLON.MeshBuilder.CreateBox(`pa${i}`,{width:0.035,height:0.08,depth:0.14},s)
      pa.parent=rotorN; pa.position.set(Math.cos(ang)*0.13,0,Math.sin(ang)*0.13)
      pa.rotation.y=ang+0.3; pa.material=dourado
    }
    this.parts['pump_impeller'] = rotorN

    // Anel de desgaste
    const wr = BABYLON.MeshBuilder.CreateTorus('wear_ring',{diameter:0.42,thickness:0.014,tessellation:48},s)
    add('wear_ring', wr, cinza, [-0.35,0,0])
    wr.rotation.z = Math.PI/2

    // Eixo
    const eixo = BABYLON.MeshBuilder.CreateCylinder('shaft',{diameter:0.04,height:0.80,tessellation:20},s)
    add('shaft', eixo, teal, [0.08,0,0], Math.PI/2)

    // Mancal
    const manc = BABYLON.MeshBuilder.CreateBox('house_bearing',{width:0.22,height:0.26,depth:0.26},s)
    add('house_bearing', manc, azul, [0.15,0,0])

    // Câmara de selagem
    const cam = BABYLON.MeshBuilder.CreateCylinder('seal_chamber',{diameter:0.15,height:0.09,tessellation:32},s)
    add('seal_chamber', cam, pbr('m_sc',[0.18,0.38,0.55]), [-0.10,0,0], Math.PI/2)

    // Gaxeta
    const gax = BABYLON.MeshBuilder.CreateTorus('pump_packing_gland',{diameter:0.10,thickness:0.022,tessellation:32},s)
    add('pump_packing_gland', gax, cinza, [-0.14,0,0])
    gax.rotation.z = Math.PI/2

    // Anel lanterna
    const al = BABYLON.MeshBuilder.CreateTorus('pump_lantern_ring',{diameter:0.09,thickness:0.015,tessellation:32},s)
    add('pump_lantern_ring', al, pbr('m_al',[0.70,0.60,0.15],0.9,0.15), [-0.18,0,0])
    al.rotation.z = Math.PI/2

    // Conjunto gaxetas
    const cg = BABYLON.MeshBuilder.CreateTorus('pump_packing_set',{diameter:0.10,thickness:0.016,tessellation:32},s)
    add('pump_packing_set', cg, pbr('m_cg',[0.85,0.85,0.60],0.1,0.9), [-0.21,0,0])
    cg.rotation.z = Math.PI/2

    // Tampa rolamento
    const tr = BABYLON.MeshBuilder.CreateCylinder('bearing_cover',{diameter:0.22,height:0.05,tessellation:32},s)
    add('bearing_cover', tr, azul, [0.28,0,0], Math.PI/2)

    // Proteção
    const prot = BABYLON.MeshBuilder.CreateCylinder('pump_protection',{diameter:0.20,height:0.18,tessellation:32},s)
    add('pump_protection', prot, pbr('m_prot',[0.08,0.16,0.44],0.6,0.45), [0.42,0.12,0], Math.PI/2)
    prot.alpha = 0.7

    // Acoplamento
    const acpN = new BABYLON.TransformNode('coupling', s)
    acpN.parent = r; acpN.position.set(0.42,0,0); acpN.rotation.z = Math.PI/2
    const a1 = BABYLON.MeshBuilder.CreateCylinder('acp1',{diameter:0.14,height:0.07,tessellation:6},s)
    a1.parent=acpN; a1.position.z=-0.04; a1.material=preto
    const a2 = BABYLON.MeshBuilder.CreateCylinder('acp2',{diameter:0.14,height:0.07,tessellation:6},s)
    a2.parent=acpN; a2.position.z=0.04; a2.material=vermelho
    this.parts['coupling']      = acpN
    this.parts['pump_coupling'] = a1

    // Motor
    const motN = new BABYLON.TransformNode('motor_body', s)
    motN.parent = r; motN.position.set(0.68,0,0)
    const mc = BABYLON.MeshBuilder.CreateCylinder('motor_corpo',{diameter:0.22,height:0.35,tessellation:32},s)
    mc.parent=motN; mc.rotation.z=Math.PI/2
    mc.material=pbr('m_mot',[0.10,0.28,0.38],0.6,0.45)
    const mbox = BABYLON.MeshBuilder.CreateBox('motor_box',{width:0.12,height:0.10,depth:0.14},s)
    mbox.parent=motN; mbox.position.set(0,0.14,0)
    mbox.material=pbr('m_motb',[0.08,0.22,0.35],0.6,0.5)
    this.parts['motor_body']    = motN
    this.parts['motor_rotor']   = mc
    this.parts['fr_motor_cover']= mbox

    const rmc = BABYLON.MeshBuilder.CreateCylinder('r_mot_cover',{diameter:0.18,height:0.04,tessellation:24},s)
    add('r_motor_cover', rmc, cinza, [0.88,0,0], Math.PI/2)
  }

  // ── Materiais PBR por peça ────────────────────────────────────────────────
  _applyPBRMaterials() {
    if (!this.meta) return
    const scene = this.scene

    Object.entries(this.parts).forEach(([key, node]) => {
      const baseKey = key.replace(/_\d+$/, '')
      const meta    = this.meta[baseKey] || this.meta[key]
      if (!meta?.pbr) return

      const { r, g, b, metallic, roughness } = meta.pbr
      const mat = new BABYLON.PBRMaterial(`pbr_${key}`, scene)

      mat.albedoColor        = new BABYLON.Color3(r, g, b)
      mat.metallic           = metallic
      mat.roughness          = roughness
      mat.usePhysicalLightFalloff = false
      mat.environmentIntensity    = 0.0   // sem reflexo de ambiente
      mat.directIntensity         = 0.8
      mat.specularIntensity       = metallic > 0.7 ? 0.6 : 0.2
      mat.microSurface            = 0.85  // reduz brilhos exagerados

      // Aplicar em todos os meshes do nó
      const meshes = node.getChildMeshes
        ? node.getChildMeshes(false)
        : (node instanceof BABYLON.AbstractMesh ? [node] : [])

      meshes.forEach(m => {
        if (m instanceof BABYLON.AbstractMesh) {
          m.material = mat
          m.receiveShadows = true
        }
      })
      if (node instanceof BABYLON.AbstractMesh) {
        node.material = mat
        node.receiveShadows = true
      }
    })

    console.log('✅ Materiais PBR aplicados')
  }

  // ── Sobrescrever cores específicas mantendo o resto original ────────────
  _applyColorOverrides() {
    // Aplicar cor diretamente nos meshes pelo nome — mais confiável que pela chave
    const verde = new BABYLON.Color3(0.046, 0.302, 0.10)
    const azul  = new BABYLON.Color3(0.046, 0.302, 1.0)
    const targetColors = {
      'Pump_Casing':    verde,  // carcaça → verde
      'moteur_wftp2':   azul,   // motor → azul
      'Drive_Coupling': verde,  // acoplamento drive → verde
      'Pump_Coupling':  verde,  // acoplamento bomba (ciano) → verde
      'Sleeve_Hub':     verde,  // manga → verde
    }

    this.scene.meshes.forEach(m => {
      if (!m.material || !m.name) return
      const nameLower = m.name.toLowerCase()

      for (const [fragment, color] of Object.entries(targetColors)) {
        if (nameLower.includes(fragment.toLowerCase())) {
          const mat = m.material.clone('mat_color_' + m.name)
          if (mat.diffuseColor) mat.diffuseColor = color
          if (mat.albedoColor)  mat.albedoColor  = color
          m.material = mat
          break
        }
      }
    })

    console.log('✅ Cores aplicadas: carcaça verde, motor azul')
  }

  _storeOrigins() {
    Object.entries(this.parts).forEach(([k, n]) => {
      this.originPos[k] = n.position.clone()
      this.originRot[k] = n.rotation ? n.rotation.clone() : new BABYLON.Vector3(0,0,0)
    })

    // Corrigir X das peças desalinhadas — valor confirmado x=+0.05
    const CORRIGIR_X = {
      'bearing_cover':   0.05,
      'coupling':        0.05,
      'wear_ring':       0.05,
      'bearing_cover_2': 0.05,
      'coupling_2':      0.05,
      'wear_ring_2':     0.05,
    }
    Object.entries(CORRIGIR_X).forEach(([k, xVal]) => {
      const node = this.parts[k]
      if (node) node.position.x = xVal
      if (this.originPos[k]) this.originPos[k].x = xVal
    })
  }

  _applyShadows() {
    const gen = this.scene._shadowGenerator
    if (!gen) return
    const add = m => { try { gen.addShadowCaster(m, true) } catch {} }
    Object.values(this.parts).forEach(n => {
      if (n.getChildMeshes) n.getChildMeshes().forEach(add)
      else if (n instanceof BABYLON.AbstractMesh) add(n)
    })
  }

  getMeshesForKey(key) {
    const node = this.parts[key]
    if (!node) return []
    if (node.getChildMeshes) {
      const ch = node.getChildMeshes(false).filter(m => m instanceof BABYLON.AbstractMesh)
      if (ch.length) return ch
    }
    if (node instanceof BABYLON.AbstractMesh) return [node]
    return []
  }

  // Ajuste de rotação via console
  setRotation(x, y, z) {
    if (!this.rootNode) return
    this.rootNode.rotation = new BABYLON.Vector3(
      x*Math.PI/180, y*Math.PI/180, z*Math.PI/180
    )
    console.log(`🔄 Rotação: X=${x}° Y=${y}° Z=${z}°`)
  }

  setScale(s) {
    if (this.rootNode) this.rootNode.scaling = new BABYLON.Vector3(s,s,s)
  }

  debugMeshNames() {
    console.table(
      this.scene.meshes
        .filter(m => m.name && m.name !== '__root__')
        .map(m => ({ nome: m.name, mapeado: this._matchName(m.name.replace(/_primitive\d+$/i,'').trim()) ?? '❌' }))
    )
  }
}
