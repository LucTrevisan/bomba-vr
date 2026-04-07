/**
 * VRUIManager v3 — Painéis 3D completos para Meta Quest
 * Etapa A: Painel de modos flutuante
 * Etapa B: Painel de info da peça
 * Etapa C: Integração com hand tracking
 */
import * as BABYLON from '@babylonjs/core'
import * as GUI     from '@babylonjs/gui'

export class VRUIManager {
  constructor(scene, assembly, pumpModel) {
    this.scene     = scene
    this.assembly  = assembly
    this.pumpModel = pumpModel
    this._panels   = {}
    this._inVR     = false
    this._modoAtivo = 'visualizacao'
  }

  init() {
    this._buildMainPanel()
    this._buildInfoPanel()
    this._buildStepPanel()
    this._buildToolbar()
    this._bindCallbacks()
    this._hideAllVR()  // esconder até entrar no VR
  }

  // ── Chamado pelo XRManager quando entra/sai do VR ────────────────────────
  onEnterVR() {
    this._inVR = true
    this._showAllVR()
    // Reposicionar painéis na frente do usuário
    this._repositionPanels()
  }

  onExitVR() {
    this._inVR = false
    this._hideAllVR()
  }

  // ── ETAPA A — Painel principal de modos ──────────────────────────────────
  _buildMainPanel() {
    const plane = BABYLON.MeshBuilder.CreatePlane('vr_main',
      { width: 0.55, height: 0.70 }, this.scene)
    plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y
    plane.isPickable    = true
    plane.renderingGroupId = 1

    const tex = GUI.AdvancedDynamicTexture.CreateForMesh(plane, 550, 700)

    // Fundo
    const bg = new GUI.Rectangle()
    bg.background   = 'rgba(8,12,24,0.96)'
    bg.cornerRadius = 20
    bg.thickness    = 2
    bg.color        = '#C8102E'
    bg.width = '100%'; bg.height = '100%'
    tex.addControl(bg)

    const stack = new GUI.StackPanel()
    stack.isVertical  = true
    stack.paddingTop  = '16px'
    stack.paddingLeft = stack.paddingRight = '14px'
    stack.width = '100%'
    bg.addControl(stack)

    // Título
    const title = new GUI.TextBlock()
    title.text      = 'BOMBA CENTRÍFUGA'
    title.color     = '#C8102E'
    title.fontSize  = 32
    title.height    = '36px'
    title.fontWeight = 'bold'
    title.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER
    stack.addControl(title)

    const sub = new GUI.TextBlock()
    sub.text     = 'SENAI · Mecatrônica'
    sub.color    = '#5a6a80'
    sub.fontSize = 20
    sub.height   = '24px'
    stack.addControl(sub)

    // Separador
    const sep = new GUI.Rectangle()
    sep.height = '2px'; sep.width = '88%'
    sep.background = '#C8102E'; sep.thickness = 0
    sep.paddingTop = '8px'; sep.paddingBottom = '8px'
    stack.addControl(sep)

    // Botões de modo
    const modos = [
      { id: 'visualizacao', label: '👁  Visualizar',  cor: '#C8102E' },
      { id: 'livre',        label: '🔧  Livre',        cor: '#1A2030' },
      { id: 'guiado',       label: '📋  Guiado',       cor: '#1A2030' },
      { id: 'avaliacao',    label: '🏆  Avaliação',    cor: '#1A2030' },
    ]

    modos.forEach(({ id, label, cor }) => {
      const btn = GUI.Button.CreateSimpleButton(`vrbtn_${id}`, label)
      btn.width           = '96%'
      btn.height          = '78px'
      btn.color           = '#E8EDF5'
      btn.fontSize        = 28
      btn.background      = id === 'visualizacao' ? '#C8102E' : '#1A2030'
      btn.cornerRadius    = 10
      btn.thickness       = 1
      btn.paddingTop = btn.paddingBottom = '4px'
      btn.isHitTestVisible = true

      btn.onPointerEnterObservable.add(() => {
        if (btn.background !== '#C8102E') btn.background = '#253045'
      })
      btn.onPointerOutObservable.add(() => {
        const ativo = this._modoAtivo === id
        btn.background = ativo ? '#C8102E' : '#1A2030'
      })
      btn.onPointerUpObservable.add(() => {
        this._setModoVR(id)
      })

      stack.addControl(btn)
      this._panels[`vrbtn_${id}`] = btn
    })

    // Separador
    const sep2 = new GUI.Rectangle()
    sep2.height = '1px'; sep2.width = '88%'
    sep2.background = '#253045'; sep2.thickness = 0
    sep2.paddingTop = sep2.paddingBottom = '4px'
    stack.addControl(sep2)

    // Botões de ação
    const acoes = [
      { id: 'explodir',  label: '💥  Explodir',  bg: '#1A1A2E', cor: '#00C8FF' },
      { id: 'montar',    label: '🔩  Montar',     bg: '#1A1A2E', cor: '#10d98a' },
      { id: 'reiniciar', label: '↺  Reiniciar',  bg: '#1A1508', cor: '#f5a623' },
    ]

    acoes.forEach(({ id, label, bg, cor }) => {
      const btn = GUI.Button.CreateSimpleButton(`vrbtn_${id}`, label)
      btn.width        = '96%'
      btn.height       = '62px'
      btn.color        = cor
      btn.fontSize     = 26
      btn.background   = bg
      btn.cornerRadius = 10
      btn.thickness    = 1
      btn.paddingTop = btn.paddingBottom = '3px'
      btn.isHitTestVisible = true

      btn.onPointerUpObservable.add(() => {
        if (id === 'explodir')  this.assembly.explodir(true)
        if (id === 'montar')    this.assembly.montar(true)
        if (id === 'reiniciar') this.assembly.reset()
      })

      stack.addControl(btn)
    })

    this._panels.mainPlane = plane
    this._panels.mainTex   = tex
  }

  // ── ETAPA B — Painel de info da peça ─────────────────────────────────────
  _buildInfoPanel() {
    const plane = BABYLON.MeshBuilder.CreatePlane('vr_info',
      { width: 0.50, height: 0.65 }, this.scene)
    plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y
    plane.isPickable    = false
    plane.renderingGroupId = 1
    plane.setEnabled(false)

    const tex = GUI.AdvancedDynamicTexture.CreateForMesh(plane, 500, 650)

    const bg = new GUI.Rectangle()
    bg.background   = 'rgba(6,13,24,0.97)'
    bg.cornerRadius = 18
    bg.thickness    = 2
    bg.color        = '#00C8FF'
    bg.width = '100%'; bg.height = '100%'
    tex.addControl(bg)

    const stack = new GUI.StackPanel()
    stack.paddingTop = stack.paddingLeft = stack.paddingRight = '14px'
    stack.width = '100%'
    bg.addControl(stack)

    // Badge de grupo
    const badge = new GUI.TextBlock()
    badge.text     = 'COMPONENTE'
    badge.color    = '#00C8FF'
    badge.fontSize = 20
    badge.height   = '22px'
    badge.fontWeight = 'bold'
    stack.addControl(badge)

    // Nome da peça
    const nome = new GUI.TextBlock()
    nome.text        = '—'
    nome.color       = '#E8EDF5'
    nome.fontSize    = 34
    nome.height      = '38px'
    nome.fontWeight  = 'bold'
    nome.textWrapping = true
    stack.addControl(nome)

    // Nome EN
    const en = new GUI.TextBlock()
    en.text      = '—'
    en.color     = '#5a6a80'
    en.fontSize  = 18
    en.height    = '20px'
    stack.addControl(en)

    // Separador
    const sep = new GUI.Rectangle()
    sep.height = '2px'; sep.width = '90%'
    sep.background = '#00C8FF44'; sep.thickness = 0
    sep.paddingTop = sep.paddingBottom = '6px'
    stack.addControl(sep)

    // Descrição
    const desc = new GUI.TextBlock()
    desc.text         = '—'
    desc.color        = '#8a9ab8'
    desc.fontSize     = 19
    desc.height       = '100px'
    desc.textWrapping = true
    desc.lineSpacing  = '4px'
    stack.addControl(desc)

    // Dados técnicos
    const dadosLabel = new GUI.TextBlock()
    dadosLabel.text      = 'DADOS TÉCNICOS'
    dadosLabel.color     = '#5a6a80'
    dadosLabel.fontSize  = 16
    dadosLabel.height    = '18px'
    dadosLabel.fontWeight = 'bold'
    stack.addControl(dadosLabel)

    const material = new GUI.TextBlock()
    material.text        = '—'
    material.color       = '#E8EDF5'
    material.fontSize    = 20
    material.height      = '22px'
    material.textWrapping = true
    stack.addControl(material)

    const norma = new GUI.TextBlock()
    norma.text      = '—'
    norma.color     = '#5a6a80'
    norma.fontSize  = 18
    norma.height    = '20px'
    stack.addControl(norma)

    // Torque highlight
    const torqueBox = new GUI.Rectangle()
    torqueBox.height      = '60px'
    torqueBox.width       = '96%'
    torqueBox.background  = 'rgba(200,16,46,0.10)'
    torqueBox.cornerRadius = 8
    torqueBox.thickness   = 1
    torqueBox.color       = '#C8102E44'
    torqueBox.paddingTop  = '6px'

    const torqueText = new GUI.TextBlock()
    torqueText.text      = '—'
    torqueText.color     = '#fff'
    torqueText.fontSize  = 26
    torqueText.fontWeight = 'bold'
    torqueBox.addControl(torqueText)
    stack.addControl(torqueBox)

    // Manutenção
    const manut = new GUI.TextBlock()
    manut.text        = '—'
    manut.color       = '#f5a623'
    manut.fontSize    = 18
    manut.height      = '40px'
    manut.textWrapping = true
    manut.paddingTop  = '6px'
    stack.addControl(manut)

    // Botão fechar
    const close = GUI.Button.CreateSimpleButton('vr_info_close', '✕  Fechar')
    close.width      = '88%'
    close.height     = '52px'
    close.color      = '#E8EDF5'
    close.background = '#1A2030'
    close.cornerRadius = 8
    close.fontSize   = 22
    close.paddingTop = '8px'
    close.isHitTestVisible = true
    close.onPointerUpObservable.add(() => {
      plane.setEnabled(false)
      this._panels.infoPlane.setEnabled(false)
    })
    stack.addControl(close)

    this._panels.infoPlane    = plane
    this._panels.infoBadge    = badge
    this._panels.infoNome     = nome
    this._panels.infoEn       = en
    this._panels.infoDesc     = desc
    this._panels.infoMaterial = material
    this._panels.infoNorma    = norma
    this._panels.infoTorque   = torqueText
    this._panels.infoTorqueBox = torqueBox
    this._panels.infoManut    = manut
  }

  // ── Painel de passo guiado ────────────────────────────────────────────────
  _buildStepPanel() {
    const plane = BABYLON.MeshBuilder.CreatePlane('vr_step',
      { width: 0.50, height: 0.35 }, this.scene)
    plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y
    plane.isPickable    = true
    plane.renderingGroupId = 1
    plane.setEnabled(false)

    const tex = GUI.AdvancedDynamicTexture.CreateForMesh(plane, 500, 350)

    const bg = new GUI.Rectangle()
    bg.background   = 'rgba(6,13,24,0.96)'
    bg.cornerRadius = 16
    bg.thickness    = 2
    bg.color        = '#10d98a'
    bg.width = '100%'; bg.height = '100%'
    tex.addControl(bg)

    const stack = new GUI.StackPanel()
    stack.paddingTop = stack.paddingLeft = stack.paddingRight = '12px'
    stack.width = '100%'
    bg.addControl(stack)

    const stepLbl = new GUI.TextBlock()
    stepLbl.text     = 'PASSO 1 / 15'
    stepLbl.color    = '#10d98a'
    stepLbl.fontSize = 24
    stepLbl.height   = '26px'
    stepLbl.fontWeight = 'bold'
    stack.addControl(stepLbl)

    const stepName = new GUI.TextBlock()
    stepName.text     = '—'
    stepName.color    = '#E8EDF5'
    stepName.fontSize = 30
    stepName.height   = '34px'
    stepName.fontWeight = 'bold'
    stack.addControl(stepName)

    const stepDesc = new GUI.TextBlock()
    stepDesc.text        = 'Selecione e encaixe a peça indicada.'
    stepDesc.color       = '#5a6a80'
    stepDesc.fontSize    = 18
    stepDesc.height      = '52px'
    stepDesc.textWrapping = true
    stack.addControl(stepDesc)

    const next = GUI.Button.CreateSimpleButton('vr_next', '▶  Próximo Passo')
    next.width        = '92%'
    next.height       = '60px'
    next.color        = '#0D1117'
    next.background   = '#10d98a'
    next.cornerRadius = 10
    next.fontSize     = 24
    next.fontWeight   = 'bold'
    next.isHitTestVisible = true
    next.onPointerUpObservable.add(() => this.assembly.guidedAdvance())
    stack.addControl(next)

    this._panels.stepPlane = plane
    this._panels.stepLbl   = stepLbl
    this._panels.stepName  = stepName
    this._panels.stepDesc  = stepDesc
  }

  // ── Toolbar VR — botões rápidos ───────────────────────────────────────────
  _buildToolbar() {
    // Toolbar pequena no pulso esquerdo (wrist-attached em versão futura)
    // Por ora, painel pequeno flutuante
    const plane = BABYLON.MeshBuilder.CreatePlane('vr_toolbar',
      { width: 0.30, height: 0.12 }, this.scene)
    plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y
    plane.isPickable    = true
    plane.renderingGroupId = 1

    const tex = GUI.AdvancedDynamicTexture.CreateForMesh(plane, 300, 120)

    const bg = new GUI.Rectangle()
    bg.background = 'rgba(8,12,24,0.90)'
    bg.cornerRadius = 10; bg.thickness = 1; bg.color = '#253045'
    bg.width = '100%'; bg.height = '100%'
    tex.addControl(bg)

    const row = new GUI.StackPanel()
    row.isVertical = false; row.width = '100%'; row.height = '100%'
    bg.addControl(row)

    const toolBtns = [
      { label: '💥', fn: () => this.assembly.explodir(true)  },
      { label: '🔩', fn: () => this.assembly.montar(true)    },
      { label: '↺',  fn: () => this.assembly.reset()         },
      { label: '💡', fn: () => this._showHint()               },
    ]

    toolBtns.forEach(({ label, fn }) => {
      const btn = GUI.Button.CreateSimpleButton('tb_' + label, label)
      btn.width = '70px'; btn.height = '70px'
      btn.color = '#E8EDF5'; btn.background = 'transparent'
      btn.fontSize = 32; btn.thickness = 0
      btn.isHitTestVisible = true
      btn.onPointerUpObservable.add(fn)
      row.addControl(btn)
    })

    this._panels.toolbarPlane = plane
  }

  // ── Mostrar info de peça no VR ────────────────────────────────────────────
  showPartInfoVR(key) {
    if (!this._inVR) return
    const baseKey = key.replace(/_\d+$/, '')
    const meta    = this.pumpModel.meta?.[baseKey] || this.pumpModel.meta?.[key]
    if (!meta) return

    const GRUPO_COR = {
      hidraulico: '#00C8FF', transmissao: '#FFB830',
      mancal: '#A78BFA',    vedacao: '#34D399',
      motor: '#F87171',     estrutura: '#94A3B8',
    }
    const cor = GRUPO_COR[meta.grupo] || '#00C8FF'

    // Atualizar textos
    if (this._panels.infoBadge)    this._panels.infoBadge.text    = (meta.grupo || 'componente').toUpperCase()
    if (this._panels.infoBadge)    this._panels.infoBadge.color   = cor
    if (this._panels.infoNome)     this._panels.infoNome.text     = meta.label || key
    if (this._panels.infoNome)     this._panels.infoNome.color    = cor
    if (this._panels.infoEn)       this._panels.infoEn.text       = meta.en || ''
    if (this._panels.infoDesc)     this._panels.infoDesc.text     = meta.desc || ''
    if (this._panels.infoMaterial) this._panels.infoMaterial.text = meta.material || '—'
    if (this._panels.infoNorma)    this._panels.infoNorma.text    = meta.norma || '—'
    if (this._panels.infoManut)    this._panels.infoManut.text    = '⏱ ' + (meta.intervalo || '—')

    if (this._panels.infoTorque) {
      const temTorque = meta.torque && meta.torque !== '—'
      this._panels.infoTorque.text = temTorque
        ? `TORQUE: ${meta.torque}`
        : `FERRAMENTA: ${meta.ferramenta || '—'}`
      if (this._panels.infoTorqueBox) {
        this._panels.infoTorqueBox.color      = temTorque ? '#C8102E44' : '#00C8FF22'
        this._panels.infoTorqueBox.background = temTorque ? 'rgba(200,16,46,0.10)' : 'rgba(0,200,255,0.05)'
      }
    }

    // Posicionar painel à direita do painel principal
    const mainPos = this._panels.mainPlane?.position
    if (mainPos) {
      this._panels.infoPlane.position = new BABYLON.Vector3(
        mainPos.x + 0.60, mainPos.y, mainPos.z
      )
    }

    // Atualizar borda
    const bg = this._panels.infoPlane?.getChildren?.()[0]

    this._panels.infoPlane?.setEnabled(true)
  }

  // ── Reposicionar painéis na frente do usuário ─────────────────────────────
  _repositionPanels() {
    const cam = this.scene.activeCamera
    if (!cam) return

    const forward = cam.getForwardRay(1).direction
    const base    = cam.position.clone()

    // Painel principal — à esquerda
    if (this._panels.mainPlane) {
      this._panels.mainPlane.position = new BABYLON.Vector3(
        base.x + forward.x * 1.2 - 0.35,
        base.y - 0.10,
        base.z + forward.z * 1.2
      )
    }

    // Painel de passo — à direita
    if (this._panels.stepPlane) {
      this._panels.stepPlane.position = new BABYLON.Vector3(
        base.x + forward.x * 1.2 + 0.35,
        base.y - 0.10,
        base.z + forward.z * 1.2
      )
    }

    // Toolbar — abaixo do painel principal
    if (this._panels.toolbarPlane) {
      this._panels.toolbarPlane.position = new BABYLON.Vector3(
        base.x + forward.x * 1.0,
        base.y - 0.45,
        base.z + forward.z * 1.0
      )
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  _setModoVR(id) {
    this._modoAtivo = id
    this.assembly.setModo(id)

    // Atualizar visual dos botões
    const modos = ['visualizacao', 'livre', 'guiado', 'avaliacao']
    modos.forEach(m => {
      const btn = this._panels[`vrbtn_${m}`]
      if (btn) btn.background = m === id ? '#C8102E' : '#1A2030'
    })

    // Mostrar/esconder painel de passo
    const showStep = id === 'guiado' || id === 'avaliacao'
    this._panels.stepPlane?.setEnabled(showStep)

    // Sincronizar HTML
    document.querySelectorAll('.mode-btn').forEach(el => {
      el.classList.toggle('active', el.dataset.mode === id)
    })
  }

  _showHint() {
    const key  = this.assembly.getNextExpected?.()
    const meta = this.pumpModel.meta?.[key]
    if (!meta || !this._panels.stepName) return
    this._panels.stepName.text = `💡 ${meta.label}`
    this._panels.stepPlane?.setEnabled(true)
  }

  _showAllVR() {
    this._panels.mainPlane?.setEnabled(true)
    this._panels.toolbarPlane?.setEnabled(true)
  }

  _hideAllVR() {
    this._panels.mainPlane?.setEnabled(false)
    this._panels.stepPlane?.setEnabled(false)
    this._panels.infoPlane?.setEnabled(false)
    this._panels.toolbarPlane?.setEnabled(false)
  }

  _bindCallbacks() {
    this._origStepChange = this.assembly.onStepChange
    this._origComplete   = this.assembly.onComplete

    this.assembly.onStepChange = (key, idx, total) => {
      this._origStepChange?.(key, idx, total)
      const meta = this.pumpModel.meta?.[key]
      if (this._panels.stepLbl)  this._panels.stepLbl.text  = `PASSO ${idx+1} / ${total}`
      if (this._panels.stepName) this._panels.stepName.text = meta?.label ?? key
      if (this._panels.stepDesc) this._panels.stepDesc.text = meta?.desc ?? ''
      if (this._inVR) this._panels.stepPlane?.setEnabled(true)
    }

    this.assembly.onComplete = () => {
      this._origComplete?.()
      if (this._panels.stepLbl)  this._panels.stepLbl.text  = '✅ CONCLUÍDO!'
      if (this._panels.stepName) this._panels.stepName.text = 'Bomba montada!'
    }
  }
}
