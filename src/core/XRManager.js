/**
 * XRManager v3 — WebXR com hand tracking completo para Meta Quest
 * - Raycast nos painéis VR
 * - Pinch para selecionar e mover peças
 * - Callbacks para VRUIManager
 */
import * as BABYLON from '@babylonjs/core'

const PINCH_ON  = 0.025  // distância para ativar pinch
const PINCH_OFF = 0.055  // distância para soltar pinch

export class XRManager {
  constructor(scene, interaction, assembly) {
    this.scene       = scene
    this.interaction = interaction
    this.assembly    = assembly
    this.xrHelper    = null
    this.vrUI        = null   // referência ao VRUIManager (definida em main.js)
    this.inXR        = false
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
      this.xrHelper = await this.scene.createDefaultXRExperienceAsync({
        floorMeshes:      [],
        optionalFeatures: true,
        uiOptions: {
          sessionMode:        'immersive-vr',
          referenceSpaceType: 'local-floor',
        },
      })

      // Posição inicial
      this.xrHelper.baseExperience.camera.position =
        new BABYLON.Vector3(0, 1.6, -1.5)

      // Hand tracking (Etapa C)
      try {
        const fm = this.xrHelper.baseExperience.featuresManager
        fm.enableFeature(BABYLON.WebXRFeatureName.HAND_TRACKING, 'latest', {
          xrInput:     this.xrHelper.input,
          jointMeshes: { enablePhysics: false, invisible: false },
        })
        console.log('✅ Hand tracking ativado')
        this._setupHandTracking()
      } catch {
        console.log('Hand tracking indisponível — usando controladores')
        this._setupControllers()
      }

      // Teleporte
      try {
        this.xrHelper.baseExperience.featuresManager.enableFeature(
          BABYLON.WebXRFeatureName.TELEPORTATION, 'stable', {
            xrInput:    this.xrHelper.input,
            floorMeshes: [],
          }
        )
      } catch {}

      // Entrar/sair do VR
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

      console.log('✅ WebXR inicializado')
    } catch (e) {
      console.error('Erro WebXR:', e)
    }
  }

  // ── ETAPA C — Hand tracking completo ─────────────────────────────────────
  _setupHandTracking() {
    this.xrHelper.input.onControllerAddedObservable.add(ctrl => {
      if (!ctrl.inputSource?.hand) return

      const hand = ctrl.inputSource.handedness  // 'left' | 'right'
      let pinchActive = false
      let grabKey     = null
      let grabOffset  = null

      this.scene.registerBeforeRender(() => {
        const joints = ctrl.inputSource?.hand
        if (!joints) return

        const thumbTip = joints.get('thumb-tip')
        const indexTip = joints.get('index-finger-tip')
        if (!thumbTip || !indexTip) return

        const tp = this._jointPos(thumbTip)
        const ip = this._jointPos(indexTip)
        if (!tp || !ip) return

        const dist   = BABYLON.Vector3.Distance(tp, ip)
        const center = BABYLON.Vector3.Lerp(tp, ip, 0.5)

        // ── Pinch detectado ──
        if (!pinchActive && dist < PINCH_ON) {
          pinchActive = true

          // 1. Verificar se pinch está em painel VR
          const panelHit = this._raycastPanels(center)
          if (panelHit) {
            // O GUI do Babylon processa automaticamente via pointer events
            return
          }

          // 2. Verificar se pinch está em peça da bomba
          const meshHit = this._nearestMesh(center, 0.12)
          if (meshHit) {
            grabKey = meshHit.metadata?.partKey
            const node = window._app?.pumpModel?.parts?.[grabKey]
            if (node) {
              grabOffset = center.subtract(node.position)
              this.interaction.select(grabKey)
              // Mostrar info no painel VR
              this.vrUI?.showPartInfoVR(grabKey)
            }
          }
        }

        // ── Pinch solto ──
        if (pinchActive && dist > PINCH_OFF) {
          pinchActive = false
          if (grabKey) {
            const snapped = this.assembly.trySnap(grabKey)
            if (snapped) this.interaction.flashSnap(grabKey)
            this.interaction.deselect()
            grabKey = null
            grabOffset = null
          }
        }

        // ── Arrastar peça ──
        if (pinchActive && grabKey && grabOffset) {
          const node = window._app?.pumpModel?.parts?.[grabKey]
          if (node) node.position = center.subtract(grabOffset)
        }
      })
    })
  }

  // ── Controladores físicos (fallback) ──────────────────────────────────────
  _setupControllers() {
    this.xrHelper.input.onControllerAddedObservable.add(ctrl => {
      ctrl.onMotionControllerInitObservable.add(mc => {
        const trigger = mc.getComponent('xr-standard-trigger')
        if (!trigger) return
        let grabKey = null

        trigger.onButtonStateChangedObservable.add(comp => {
          if (comp.pressed) {
            // Raycast da mão
            const ray = new BABYLON.Ray(
              BABYLON.Vector3.Zero(),
              BABYLON.Vector3.Forward()
            )
            ctrl.getWorldPointerRayToRef(ray)
            const pick = this.scene.pickWithRay(ray, m => m.isPickable)

            if (pick?.hit) {
              const key = pick.pickedMesh?.metadata?.partKey
              if (key) {
                grabKey = key
                this.interaction.select(key)
                this.vrUI?.showPartInfoVR(key)
              }
            }
          } else {
            if (grabKey) {
              const snapped = this.assembly.trySnap(grabKey)
              if (snapped) this.interaction.flashSnap(grabKey)
              this.interaction.deselect()
              grabKey = null
            }
          }
        })

        // Botão A/X — explodir/montar toggle
        const btnA = mc.getComponent('a-button') || mc.getComponent('x-button')
        if (btnA) {
          btnA.onButtonStateChangedObservable.add(comp => {
            if (!comp.pressed) return
            if (this.assembly.isExploded) this.assembly.montar(true)
            else this.assembly.explodir(true)
          })
        }

        // Botão B/Y — próximo passo guiado
        const btnB = mc.getComponent('b-button') || mc.getComponent('y-button')
        if (btnB) {
          btnB.onButtonStateChangedObservable.add(comp => {
            if (comp.pressed) this.assembly.guidedAdvance()
          })
        }
      })
    })
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  _jointPos(joint) {
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
    return this.scene.meshes
      .filter(m => m.isPickable && m.metadata?.partKey && m.isEnabled())
      .find(m => BABYLON.Vector3.Distance(pos, m.getAbsolutePosition()) < radius)
      ?? null
  }

  _raycastPanels(pos) {
    // Verificar se a posição está próxima de um painel VR
    const panels = ['vr_main', 'vr_info', 'vr_step', 'vr_toolbar']
    return panels.some(name => {
      const mesh = this.scene.getMeshByName(name)
      if (!mesh || !mesh.isEnabled()) return false
      return BABYLON.Vector3.Distance(pos, mesh.getAbsolutePosition()) < 0.30
    })
  }

  _showDesktopWarning() {
    const el = document.getElementById('xr-status')
    if (el) {
      el.textContent = '⚠️ WebXR não disponível — modo desktop ativo. Use o Meta Browser no Quest.'
      el.style.display = 'block'
    }
  }
}
