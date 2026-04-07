/**
 * main.js — Simulador VR Bomba Centrífuga v2.0
 * SENAI Antonio Adolphe Lobbe — Mecatrônica
 */

import { SceneManager }        from './core/SceneManager.js'
import { PumpModel }           from './core/PumpModel.js'
import { AssemblyManager }     from './assembly/AssemblyManager.js'
import { InteractionManager }  from './interaction/InteractionManager.js'
import { XRManager }           from './core/XRManager.js'
import { HUDManager }          from './ui/HUDManager.js'
import { VRUIManager }         from './ui/VRUIManager.js'
import { AnimationController } from './core/AnimationController.js'
import { AudioManager }        from './audio/AudioManager.js'

function setStatus(msg) {
  const el = document.getElementById('loading-status')
  if (el) el.textContent = msg
}
function setProgress(pct) {
  const bar = document.getElementById('loading-bar')
  if (bar) bar.style.width = pct + '%'
}

function _updateInfoPanelPos(sceneManager, pumpModel, key) {
  const panel = document.getElementById('info-panel')
  if (!panel) return
  panel._currentKey = key

  const node = pumpModel.parts[key]
  if (!node) return

  const engine = sceneManager.engine
  const scene  = sceneManager.scene
  const camera = sceneManager.camera

  try {
    const absPos = node.getAbsolutePosition
      ? node.getAbsolutePosition()
      : node.position.clone()

    // Projetar posição 3D para coordenadas de tela 2D
    const projected = BABYLON.Vector3.Project(
      absPos,
      BABYLON.Matrix.Identity(),
      scene.getTransformMatrix(),
      camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
    )

    // Limites da tela
    const W = engine.getRenderWidth()
    const H = engine.getRenderHeight()
    const pw = 350
    const ph = Math.min(500, H * 0.7)

    // Posição: à direita da peça, centralizado verticalmente
    let x = Math.min(projected.x + 30, W - pw - 10)
    let y = Math.min(Math.max(projected.y - ph / 2, 80), H - ph - 80)

    // Se projetou fora da tela (peça atrás da câmera), manter canto
    if (projected.z < 0 || projected.z > 1) {
      x = 18; y = H - ph - 90
    }

    panel.style.left   = x + 'px'
    panel.style.top    = y + 'px'
    panel.style.bottom = 'auto'
  } catch(e) {
    // Fallback: canto inferior esquerdo
    panel.style.left   = '18px'
    panel.style.top    = 'auto'
    panel.style.bottom = '90px'
  }
}

async function init() {
  const canvas = document.getElementById('renderCanvas')

  try {
    setStatus('Criando engine 3D e ambiente 360...');  setProgress(8)
    const sceneManager = new SceneManager(canvas)
    await sceneManager.init()

    setStatus('Inicializando audio...');               setProgress(20)
    const audio = new AudioManager()
    await audio.init()

    setStatus('Carregando modelo da bomba...');        setProgress(32)
    const pumpModel = new PumpModel(sceneManager.scene)
    await pumpModel.load()

    setStatus('Configurando montagem...');             setProgress(50)
    const assembly = new AssemblyManager(sceneManager.scene, pumpModel)
    assembly.init()

    setStatus('Configurando interacao...');            setProgress(62)
    const interaction = new InteractionManager(
      sceneManager.scene, pumpModel, assembly, audio
    )
    interaction.init()

    setStatus('Configurando WebXR...');               setProgress(74)
    const xr = new XRManager(sceneManager.scene, interaction, assembly)
    await xr.init()

    setStatus('Preparando animacoes...');              setProgress(82)
    const anim = new AnimationController(sceneManager.scene, pumpModel, sceneManager)

    let hud = null
    setStatus('Construindo interface...');             setProgress(88)
    hud = new HUDManager(assembly, pumpModel, audio)
    hud.init()

    // Conectar selecao ao painel de info
    // Atualizar posição do painel de info a cada frame da câmera
    sceneManager.scene.registerAfterRender(() => {
      const panel = document.getElementById('info-panel')
      if (!panel || panel.classList.contains('hidden')) return
      const key = panel._currentKey
      if (!key) return
      _updateInfoPanelPos(sceneManager, pumpModel, key)
    })

    setProgress(94)
    const vrUI = new VRUIManager(sceneManager.scene, assembly, pumpModel)
    vrUI.init()

    // Conectar VRUIManager ao XRManager — permite callbacks ao entrar/sair VR
    xr.vrUI = vrUI

    // Mostrar info VR quando peça é selecionada
    const origSelectVR = interaction.select.bind(interaction)
    interaction.select = (key) => {
      origSelectVR(key)
      hud?.showPartInfo(key)
      if (xr.inXR) vrUI.showPartInfoVR(key)
      _updateInfoPanelPos(sceneManager, pumpModel, key)
    }

    // Snap com feedback completo
    const origSnap = assembly.trySnap.bind(assembly)
    assembly.trySnap = (key) => {
      const ok = origSnap(key)
      if (ok) { interaction.flashSnap(key); audio.playSnap() }
      else if (assembly.modo !== 'visualizacao') { interaction.flashErro(key); audio.playError() }
      return ok
    }

    // Botoes extras na toolbar
    _extraToolbar(anim)

    setStatus('Pronto!'); setProgress(100)
    setTimeout(() => {
      const ol = document.getElementById('loading-overlay')
      if (ol) { ol.style.opacity='0'; setTimeout(() => ol.remove(), 600) }
    }, 400)

    window._app = { sceneManager, pumpModel, assembly, interaction, xr, hud, vrUI, anim, audio }
    console.log('Simulador VR v2.0 - SENAI Antonio Adolphe Lobbe')
    console.log('Pecas:', Object.keys(pumpModel.parts).length)

  } catch (err) {
    console.error('Erro:', err)
    setStatus('Erro: ' + err.message)
  }
}

function _extraToolbar(anim) {
  const tb = document.getElementById('toolbar')
  if (!tb) return
  const mk = (ico, title, fn) => {
    const b = document.createElement('button')
    b.className='tool-btn'; b.title=title; b.textContent=ico
    b.addEventListener('click', fn); tb.appendChild(b)
  }
  mk('🎬','Cinemática de desmontagem', () => anim.playDisassembly())
  mk('💧','Fluxo de líquido',          () => anim._flowParticles ? anim.stopFlow() : anim.startFlow())
  mk('🔄','Showcase 360°',             () => anim.playShowcase())
}

init()
