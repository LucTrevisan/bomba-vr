/**
 * XRManager v5 — Usando sistema nativo do Babylon para UI VR
 * Botões funcionam com controladores E mãos via WebXR pointer events
 */
import * as BABYLON from '@babylonjs/core'

export class XRManager {
  constructor(scene, interaction, assembly) {
    this.scene       = scene
    this.interaction = interaction
    this.assembly    = assembly
    this.xrHelper    = null
    this.vrUI        = null
    this.inXR        = false
    this._grabState  = { key: null, offset: null, hand: null }
    this._pinchL     = false
    this._pinchR     = false
  }

  async init() {
    const supported = await BABYLON.WebXRSessionManager
      .IsSessionSupportedAsync('immersive-vr').catch(() => false)

    if (!supported) {
      console.warn('⚠️ WebXR não suportado — modo desktop ativo')
      this._showDesktopWarning()
      return
    }

    try {
      // Criar experiência XR com pointer selection nativo
      this.xrHelper = await this.scene.createDefaultXRExperienceAsync({
        floorMeshes:      [],
        optionalFeatures: true,
        uiOptions: {
          sessionMode:        'immersive-vr',
          referenceSpaceType: 'local-floor',
        },
        inputOptions: {
          doNotLoadControllerMeshes: false,
        }
      })

      this.xrHelper.baseExperience.camera.position =
        new BABYLON.Vector3(0, 1.6, -1.5)

      // ── POINTER SELECTION — faz botões VR funcionarem com controles ────
      try {
        const fm = this.xrHelper.baseExperience.featuresManager
        const pointerSelection = fm.enableFeature(
          BABYLON.WebXRFeatureName.POINTER_SELECTION, 'stable', {
            xrInput:                    this.xrHelper.input,
            enablePointerSelectionOnAllControllers: true,
          }
        )
        console.log('✅ Pointer Selection ativado — botões VR funcionam')
      } catch (e) {
        console.warn('Pointer selection:', e.message)
      }

      // ── HAND TRACKING ──────────────────────────────────────────────────
      try {
        const fm = this.xrHelper.baseExperience.featuresManager
        fm.enableFeature(BABYLON.WebXRFeatureName.HAND_TRACKING, 'latest', {
          xrInput:     this.xrHelper.input,
          jointMeshes: { enablePhysics: false, invisible: false },
        })
        console.log('✅ Hand tracking ativado')
        this._setupHandTracking()
      } catch (e) {
        console.log('Hand tracking indisponível:', e.message)
      }

      // ── CONTROLADORES ──────────────────────────────────────────────────
      this._setupControllers()

      // ── TELEPORTE ──────────────────────────────────────────────────────
      try {
        this.xrHelper.baseExperience.featuresManager.enableFeature(
          BABYLON.WebXRFeatureName.TELEPORTATION, 'stable', {
            xrInput: this.xrHelper.input, floorMeshes: []
          }
        )
      } catch {}

      // ── ESTADO VR ──────────────────────────────────────────────────────
      this.xrHelper.baseExperience.onStateChangedObservable.add(state => {
        if (state === BABYLON.WebXRState.IN_XR) {
          this.inXR = true
          this.vrUI?.onEnterVR()
          console.log('✅ Entrou no VR')
        } else if (state === BABYLON.WebXRState.NOT_IN_XR) {
          this.inXR = false
          this.vrUI?.onExitVR()
        }
      })

      console.log('✅ WebXR v5 inicializado')
    } catch (e) {
      console.error('Erro WebXR:', e)
    }
  }

  // ── HAND TRACKING ────────────────────────────────────────────────────────
  _setupHandTracking() {
    this.xrHelper.input.onControllerAddedObservable.add(ctrl => {
      if (!ctrl.inputSource?.hand) return
      const hand = ctrl.inputSource.handedness

      let pinchActive = false
      let frames      = 0

      this.scene.registerBeforeRender(() => {
        if (!this.inXR) return
        const joints = ctrl.inputSource?.hand
        if (!joints) return

        const thumb = joints.get('thumb-tip')
        const index = joints.get('index-finger-tip')
        if (!thumb || !index) return

        const tp   = this._jPos(thumb)
        const ip   = this._jPos(index)
        if (!tp || !ip) return

        const dist   = BABYLON.Vector3.Distance(tp, ip)
        const center = BABYLON.Vector3.Lerp(tp, ip, 0.5)

        // Pinch ON
        if (!pinchActive && dist < 0.025) {
          frames++
          if (frames >= 2) {
            pinchActive = true
            frames      = 0
            hand === 'left'
              ? (this._pinchL = true, this._onPinchLeft())
              : (this._pinchR = true, this._onPinchRight(center))
          }
        }

        // Pinch OFF
        if (pinchActive && dist > 0.055) {
          pinchActive = false
          frames      = 0
          hand === 'left'
            ? (this._pinchL = false)
            : (this._pinchR = false, this._onRelease(center))
        }

        // Arrastar peça (mão direita)
        if (pinchActive && hand === 'right' && this._grabState.key) {
          const node = window._app?.pumpModel?.parts?.[this._grabState.key]
          if (node && this._grabState.offset) {
            node.position = center.subtract(this._grabState.offset)
          }
        }
      })
    })
  }

  _onPinchLeft() {
    // Dois pinches = reset
    if (this._pinchR) { this.assembly.reset(); this._toast('↺ Reset!'); return }
    // Pinch esquerdo = toggle explodir/montar
    if (this.assembly.isExploded) {
      this.assembly.montar(true)
      this._toast('🔩 Montando...')
    } else {
      this.assembly.explodir(true)
      this._toast('💥 Explodindo...')
    }
  }

  _onPinchRight(center) {
    // Dois pinches = reset
    if (this._pinchL) { this.assembly.reset(); this._toast('↺ Reset!'); return }
    // Tentar pegar peça
    const hit = this._nearestMesh(center, 0.15)
    if (hit?.metadata?.partKey) {
      const key  = hit.metadata.partKey
      const node = window._app?.pumpModel?.parts?.[key]
      if (node) {
        this._grabState = { key, offset: center.subtract(node.position), hand: 'right' }
        this.interaction.select(key)
        this.vrUI?.showPartInfoVR(key)
        this._toast('✋ ' + (window._app?.pumpModel?.meta?.[key]?.label || key))
      }
    }
  }

  _onRelease(center) {
    if (!this._grabState.key) return
    const snapped = this.assembly.trySnap(this._grabState.key)
    if (snapped) {
      this.interaction.flashSnap(this._grabState.key)
      this._toast('✅ Encaixado!')
    }
    this.interaction.deselect()
    this._grabState = { key: null, offset: null, hand: null }
  }

  // ── CONTROLADORES FÍSICOS ────────────────────────────────────────────────
  _setupControllers() {
    this.xrHelper.input.onControllerAddedObservable.add(ctrl => {
      if (ctrl.inputSource?.hand) return  // ignorar mãos aqui

      ctrl.onMotionControllerInitObservable.add(mc => {
        const hand = mc.handedness

        // TRIGGER → pegar peça (pointer selection já cuida dos botões GUI)
        const trigger = mc.getComponent('xr-standard-trigger')
        if (trigger) {
          let grabKey    = null
          let grabOffset = null

          trigger.onButtonStateChangedObservable.add(comp => {
            if (comp.pressed) {
              // Raycast para peças
              const ray = new BABYLON.Ray(BABYLON.Vector3.Zero(), BABYLON.Vector3.Forward())
              ctrl.getWorldPointerRayToRef(ray)
              const pick = this.scene.pickWithRay(ray,
                m => m.isPickable && m.metadata?.partKey && m.isEnabled()
              )
              if (pick?.hit && pick.pickedMesh?.metadata?.partKey) {
                grabKey = pick.pickedMesh.metadata.partKey
                const node = window._app?.pumpModel?.parts?.[grabKey]
                if (node) {
                  const ctrlPos = ctrl.pointer?.position || ctrl.grip?.position
                  if (ctrlPos) grabOffset = ctrlPos.subtract(node.position)
                }
                this.interaction.select(grabKey)
                this.vrUI?.showPartInfoVR(grabKey)
              }
            } else {
              if (grabKey) {
                const snapped = this.assembly.trySnap(grabKey)
                if (snapped) {
                  this.interaction.flashSnap(grabKey)
                  this._toast('✅ Encaixado!')
                }
                this.interaction.deselect()
                grabKey = null; grabOffset = null
              }
            }
          })

          // Mover peça com trigger pressionado
          this.scene.registerBeforeRender(() => {
            if (!grabKey || !grabOffset) return
            const node    = window._app?.pumpModel?.parts?.[grabKey]
            const ctrlPos = ctrl.pointer?.position || ctrl.grip?.position
            if (node && ctrlPos) node.position = ctrlPos.subtract(grabOffset)
          })
        }

        // BOTÃO A (direito) / X (esquerdo) → explodir/montar
        const btnAX = mc.getComponent('a-button') || mc.getComponent('x-button')
        if (btnAX) {
          btnAX.onButtonStateChangedObservable.add(comp => {
            if (!comp.pressed) return
            if (this.assembly.isExploded) {
              this.assembly.montar(true)
              this._toast('🔩 Montando...')
            } else {
              this.assembly.explodir(true)
              this._toast('💥 Explodindo...')
            }
          })
        }

        // BOTÃO B (direito) / Y (esquerdo) → próximo passo
        const btnBY = mc.getComponent('b-button') || mc.getComponent('y-button')
        if (btnBY) {
          btnBY.onButtonStateChangedObservable.add(comp => {
            if (!comp.pressed) return
            this.assembly.guidedAdvance()
            this._toast('📋 Próximo passo')
          })
        }

        // ANALÓGICO esquerdo pressionado → toggle menu
        const stick = mc.getComponent('xr-standard-thumbstick')
        if (stick && hand === 'left') {
          stick.onButtonStateChangedObservable.add(comp => {
            if (!comp.pressed) return
            const main = this.vrUI?._panels?.mainPlane
            if (main) main.setEnabled(!main.isEnabled())
            this._toast('📋 Menu')
          })
        }

        // GRIP → mover objetos com grip
        const grip = mc.getComponent('xr-standard-squeeze')
        if (grip) {
          let grabKey = null; let grabOffset = null
          grip.onButtonStateChangedObservable.add(comp => {
            if (comp.pressed) {
              const ray = new BABYLON.Ray(BABYLON.Vector3.Zero(), BABYLON.Vector3.Forward())
              ctrl.getWorldPointerRayToRef(ray)
              const pick = this.scene.pickWithRay(ray,
                m => m.isPickable && m.metadata?.partKey && m.isEnabled()
              )
              if (pick?.hit) {
                grabKey = pick.pickedMesh.metadata.partKey
                const node    = window._app?.pumpModel?.parts?.[grabKey]
                const ctrlPos = ctrl.grip?.position || ctrl.pointer?.position
                if (node && ctrlPos) grabOffset = ctrlPos.subtract(node.position)
                this.interaction.select(grabKey)
              }
            } else {
              if (grabKey) {
                this.assembly.trySnap(grabKey)
                this.interaction.deselect()
                grabKey = null; grabOffset = null
              }
            }
          })
          this.scene.registerBeforeRender(() => {
            if (!grabKey || !grabOffset) return
            const node    = window._app?.pumpModel?.parts?.[grabKey]
            const ctrlPos = ctrl.grip?.position || ctrl.pointer?.position
            if (node && ctrlPos) node.position = ctrlPos.subtract(grabOffset)
          })
        }
      })
    })
  }

  // ── HELPERS ──────────────────────────────────────────────────────────────
  _jPos(joint) {
    try {
      const frame = this.xrHelper.baseExperience.sessionManager.currentFrame
      const pose  = frame?.getJointPose?.(
        joint,
        this.xrHelper.baseExperience.sessionManager.referenceSpace
      )
      if (!pose) return null
      const p = pose.transform.position
      return new BABYLON.Vector3(p.x, p.y, p.z)
    } catch { return null }
  }

  _nearestMesh(pos, radius) {
    let best = null, bestDist = radius
    for (const m of this.scene.meshes) {
      if (!m.isPickable || !m.metadata?.partKey || !m.isEnabled()) continue
      const d = BABYLON.Vector3.Distance(pos, m.getAbsolutePosition())
      if (d < bestDist) { best = m; bestDist = d }
    }
    return best
  }

  _toast(msg) {
    const el = document.getElementById('toast')
    if (!el) return
    el.textContent = msg
    el.className   = 'toast toast-info visible'
    clearTimeout(this._toastTimer)
    this._toastTimer = setTimeout(() => el.classList.remove('visible'), 2000)
  }

  _showDesktopWarning() {
    const el = document.getElementById('xr-status')
    if (el) {
      el.textContent = '⚠️ WebXR não disponível — modo desktop ativo. Use o Meta Browser no Quest.'
      el.style.display = 'block'
    }
  }
}
