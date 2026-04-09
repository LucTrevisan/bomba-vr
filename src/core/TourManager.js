/**
 * TourManager — Fase 1: Tour de pontos 360°
 * 
 * Fallback automático:
 * - Se tour.json não existir → usa ambiente360.jpg (comportamento atual)
 * - Se foto de um ponto não existir → usa ambiente360.jpg como fallback
 * - Se tour.json existir → ativa navegação entre pontos com setas
 */
import * as BABYLON from '@babylonjs/core'
import * as GUI     from '@babylonjs/gui'

export class TourManager {
  constructor(scene, sceneManager) {
    this.scene        = scene
    this.sceneManager = sceneManager
    this._pontos      = []
    this._pontoAtual  = 0
    this._ativo       = false
    this._setas       = []
    this._painelInfo  = null
    this._onMudar     = null  // callback quando muda de ponto
  }

  // ── Inicializar — verifica se tour existe ─────────────────────────────
  async init() {
    const base    = import.meta.env.BASE_URL
    const tourUrl = base + 'assets/tour.json'

    const existe = await this._fileExists(tourUrl)

    if (!existe) {
      console.log('📍 tour.json não encontrado — usando ambiente360 padrão')
      return false  // não ativa o tour
    }

    try {
      const res    = await fetch(tourUrl)
      const config = await res.json()
      this._pontos = config.pontos || []

      if (this._pontos.length === 0) {
        console.warn('📍 tour.json vazio — usando ambiente360 padrão')
        return false
      }

      this._ativo = true
      console.log(`✅ Tour ativado — ${this._pontos.length} pontos`)

      // NÃO carregar o primeiro ponto durante init
      // O ambiente360.jpg padrão já está carregado
      // Tour só muda a foto quando o usuário navegar

      // Criar setas de navegação
      this._criarSetas()

      // Criar painel de navegação HTML
      this._criarPainelNav()

      return true
    } catch (e) {
      console.warn('📍 Erro ao carregar tour.json:', e.message, '— usando ambiente360 padrão')
      return false
    }
  }

  get ativo() { return this._ativo }

  // ── Navegar entre pontos ──────────────────────────────────────────────
  async irParaProximo() {
    if (!this._ativo || this._pontos.length === 0) return
    const proximo = (this._pontoAtual + 1) % this._pontos.length
    await this._irParaPonto(proximo)
  }

  async irParaAnterior() {
    if (!this._ativo || this._pontos.length === 0) return
    const anterior = (this._pontoAtual - 1 + this._pontos.length) % this._pontos.length
    await this._irParaPonto(anterior)
  }

  async irParaIndice(idx) {
    if (!this._ativo || idx < 0 || idx >= this._pontos.length) return
    await this._irParaPonto(idx)
  }

  // ── Carregar foto de um ponto com fade ────────────────────────────────
  async _irParaPonto(idx) {
    const ponto   = this._pontos[idx]
    const base    = import.meta.env.BASE_URL
    const fotoUrl = base + 'assets/' + ponto.foto
    const fallback = base + 'assets/ambiente360.jpg'

    // Verificar se a foto do ponto existe
    const fotoExiste = await this._fileExists(fotoUrl)
    const urlFinal   = fotoExiste ? fotoUrl : fallback

    if (!fotoExiste) {
      console.warn(`📍 Foto não encontrada: ${ponto.foto} — usando ambiente360.jpg`)
    }

    // Fade out
    await this._fade(1, 0, 300)

    // Trocar textura
    await this.sceneManager.trocarAmbiente360(urlFinal)

    // Atualizar ponto atual
    this._pontoAtual = idx

    // Atualizar câmera para a orientação do ponto
    if (ponto.camera) {
      const cam = this.sceneManager.camera
      if (cam && ponto.camera.alpha !== undefined) {
        cam.alpha = ponto.camera.alpha
        cam.beta  = ponto.camera.beta  ?? cam.beta
      }
    }

    // Fade in
    await this._fade(0, 1, 300)

    // Atualizar UI
    this._atualizarPainelNav()
    this._onMudar?.(idx, ponto)
    console.log(`📍 Ponto ${idx + 1}/${this._pontos.length}: ${ponto.nome}`)
  }

  // ── Setas 3D no chão ─────────────────────────────────────────────────
  _criarSetas() {
    // Seta para frente
    this._criarSeta('seta_frente', new BABYLON.Vector3(0, 0.05, 1.5),
      '▶', () => this.irParaProximo())

    // Seta para trás
    this._criarSeta('seta_tras', new BABYLON.Vector3(0, 0.05, -1.5),
      '◀', () => this.irParaAnterior(), Math.PI)
  }

  _criarSeta(nome, posicao, icone, onClick, rotY = 0) {
    const plane = BABYLON.MeshBuilder.CreatePlane(nome, {
      width: 0.5, height: 0.5
    }, this.scene)
    plane.position    = posicao
    plane.rotation.x  = Math.PI / 2   // deitar no chão
    plane.rotation.z  = rotY
    plane.isPickable  = true
    plane.renderingGroupId = 1

    const tex = GUI.AdvancedDynamicTexture.CreateForMesh(plane, 256, 256)

    const bg = new GUI.Ellipse()
    bg.width = '220px'; bg.height = '220px'
    bg.background   = 'rgba(200,16,46,0.85)'
    bg.thickness     = 3
    bg.color         = '#ffffff'
    tex.addControl(bg)

    const txt = new GUI.TextBlock()
    txt.text     = icone
    txt.fontSize = 80
    txt.color    = '#ffffff'
    bg.addControl(txt)

    // Hover e clique
    plane.actionManager = new BABYLON.ActionManager(this.scene)
    plane.actionManager.registerAction(
      new BABYLON.ExecuteCodeAction(
        BABYLON.ActionManager.OnPickTrigger, onClick
      )
    )
    plane.actionManager.registerAction(
      new BABYLON.ExecuteCodeAction(
        BABYLON.ActionManager.OnPointerOverTrigger,
        () => { bg.background = 'rgba(255,50,80,0.95)'; plane.scaling.setAll(1.15) }
      )
    )
    plane.actionManager.registerAction(
      new BABYLON.ExecuteCodeAction(
        BABYLON.ActionManager.OnPointerOutTrigger,
        () => { bg.background = 'rgba(200,16,46,0.85)'; plane.scaling.setAll(1.0) }
      )
    )

    // Pulsar suavemente
    let t = 0
    this.scene.registerBeforeRender(() => {
      t += 0.02
      plane.position.y = posicao.y + Math.sin(t) * 0.02
    })

    this._setas.push(plane)
  }

  // ── Painel de navegação HTML ──────────────────────────────────────────
  _criarPainelNav() {
    const painel = document.getElementById('tour-nav')
    if (!painel) return

    painel.style.display = 'flex'
    this._atualizarPainelNav()

    document.getElementById('tour-prev')?.addEventListener('click',
      () => this.irParaAnterior())
    document.getElementById('tour-next')?.addEventListener('click',
      () => this.irParaProximo())
  }

  _atualizarPainelNav() {
    const ponto = this._pontos[this._pontoAtual]
    if (!ponto) return

    const nome = document.getElementById('tour-nome')
    const cont = document.getElementById('tour-contador')
    if (nome) nome.textContent = ponto.nome || `Ponto ${this._pontoAtual + 1}`
    if (cont) cont.textContent = `${this._pontoAtual + 1} / ${this._pontos.length}`

    // Atualizar indicadores de ponto (bolinhas)
    const dots = document.querySelectorAll('.tour-dot')
    dots.forEach((d, i) => {
      d.classList.toggle('ativo', i === this._pontoAtual)
    })
  }

  // ── Fade da esfera 360° ───────────────────────────────────────────────
  _fade(de, para, ms) {
    const sky = this.sceneManager._sky
    if (!sky) return Promise.resolve()
    return new Promise(resolve => {
      const t0 = performance.now()
      const tick = () => {
        const t = Math.min((performance.now() - t0) / ms, 1)
        if (sky.material) sky.material.alpha = de + (para - de) * t
        t < 1 ? requestAnimationFrame(tick) : resolve()
      }
      requestAnimationFrame(tick)
    })
  }

  async _fileExists(url) {
    try {
      const r = await fetch(url, { method: 'HEAD' })
      return r.ok
    } catch { return false }
  }
}
