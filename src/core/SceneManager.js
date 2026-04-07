/**
 * SceneManager.js — Engine, câmera, iluminação e ambiente 360°
 * Método validado pelo teste360.html — StandardMaterial + emissiveTexture
 */
import * as BABYLON from '@babylonjs/core'

export class SceneManager {
  constructor(canvas) {
    this.canvas  = canvas
    this.engine  = null
    this.scene   = null
    this.camera  = null
    this.shadowGenerator = null
  }

  async init() {
    // ── Engine ──────────────────────────────────────────────────────────────
    this.engine = new BABYLON.Engine(this.canvas, true, {
      preserveDrawingBuffer: true,
      stencil:      true,
      antialias:    false,  // desativado para performance
      xrCompatible: true,
    })
    // Limitar FPS para economizar CPU/GPU no desktop
    this.engine.setHardwareScalingLevel(1.0)

    // ── Cena ────────────────────────────────────────────────────────────────
    this.scene = new BABYLON.Scene(this.engine)
    // clearColor DEVE ser preto opaco — a esfera 360 cobre tudo por baixo
    this.scene.clearColor = new BABYLON.Color4(0, 0, 0, 1)
    this.scene.fogMode    = BABYLON.Scene.FOGMODE_NONE

    // ── Câmera orbital ───────────────────────────────────────────────────────
    this.camera = new BABYLON.ArcRotateCamera(
      'cam', -Math.PI / 2, Math.PI / 4, 4.0,
      new BABYLON.Vector3(0, 0.5, 0), this.scene
    )
    this.camera.lowerRadiusLimit      = 0.5
    this.camera.upperRadiusLimit      = 12
    this.camera.wheelPrecision        = 60
    this.camera.pinchDeltaPercentage  = 0.001
    this.camera.angularSensibilityX   = 500
    this.camera.angularSensibilityY   = 500
    this.camera.panningSensibility    = 100
    this.camera.multiTouchPanning     = true
    this.camera.multiTouchPanAndZoom  = true
    this.camera.attachControl(this.canvas, true)

    // ── Ambiente 360° — método validado ──────────────────────────────────────
    await this._setup360()

    // ── Iluminação ───────────────────────────────────────────────────────────
    this._setupLighting()

    // ── Grade de chão ────────────────────────────────────────────────────────

    // ── Post-processing ──────────────────────────────────────────────────────
    this._setupPostProcessing()

    // ── Render loop ──────────────────────────────────────────────────────────
    this.engine.runRenderLoop(() => this.scene.render())
    window.addEventListener('resize', () => this.engine.resize())
  }

  async _setup360() {
    // Esfera invertida — câmera fica dentro olhando para a textura interna
    const sphere = BABYLON.MeshBuilder.CreateSphere('sky360', {
      diameter:        1000,   // grande o suficiente — infiniteDistance garante câmera sempre dentro
      segments:        64,   // mais segmentos = panorama mais suave
      sideOrientation: BABYLON.Mesh.BACKSIDE,
    }, this.scene)

    sphere.isPickable       = false
    sphere.infiniteDistance = true   // segue a câmera — sempre visível
    sphere.renderingGroupId = 0      // renderiza antes de tudo
    sphere.position         = BABYLON.Vector3.Zero()

    const mat = new BABYLON.StandardMaterial('sky360mat', this.scene)
    mat.disableLighting = true
    mat.backFaceCulling = false
    mat.fogEnabled      = false

    // Cor de fallback enquanto a textura carrega
    mat.emissiveColor = new BABYLON.Color3(0.04, 0.06, 0.10)
    sphere.material   = mat
    this._sky         = sphere
    this._skyMat      = mat

    // Carregar textura — mesmo método do teste360.html que funcionou
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.warn('⚠️ Foto 360° timeout — usando fundo escuro')
        resolve()
      }, 12000)

      const tex = new BABYLON.Texture(
        import.meta.env.BASE_URL + 'assets/ambiente360.jpg',
        this.scene,
        false,   // noMipmap
        false,   // invertY = false para equiretangular
        BABYLON.Texture.TRILINEAR_SAMPLINGMODE, // melhor qualidade que BILINEAR
        () => {
          // ── onLoad ──────────────────────────────────────────────────────
          clearTimeout(timeout)
          tex.uScale = -1   // inverter horizontal (necessário para 360°)
          tex.vScale =  1
          tex.wrapU  = BABYLON.Texture.WRAP_ADDRESSMODE
          tex.wrapV  = BABYLON.Texture.CLAMP_ADDRESSMODE

          // Usar TANTO diffuse QUANTO emissive — garante visibilidade
          mat.diffuseTexture  = tex
          mat.emissiveTexture = tex
          mat.emissiveColor   = BABYLON.Color3.White()

          console.log('✅ Ambiente 360° carregado — 2000x1000px')

          resolve()
        },
        (msg) => {
          // ── onError ─────────────────────────────────────────────────────
          clearTimeout(timeout)
          console.warn('⚠️ Foto 360° falhou:', msg)
          // Mantém cor de fallback escura
          resolve()
        }
      )
    })
  }

  _setupLighting() {
    // Iluminação neutra — preserva cores originais do SolidWorks
    // Inspirado no setup do gltf.report: luz uniforme sem dominância de cor

    // Hemisférica principal — branca pura, simula ambiente estúdio
    const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0,1,0), this.scene)
    hemi.intensity   = 0.85
    hemi.diffuse     = new BABYLON.Color3(1.0, 1.0, 1.0)
    hemi.specular    = new BABYLON.Color3(0.3, 0.3, 0.3)
    hemi.groundColor = new BABYLON.Color3(0.5, 0.5, 0.5)

    // Direcional principal — branca, ângulo de estúdio
    const dir = new BABYLON.DirectionalLight('dir', new BABYLON.Vector3(-1,-2,-0.5), this.scene)
    dir.position  = new BABYLON.Vector3(8, 12, 8)
    dir.intensity = 0.7
    dir.diffuse   = new BABYLON.Color3(1.0, 1.0, 1.0)
    dir.specular  = new BABYLON.Color3(0.8, 0.8, 0.8)

    // Fill light suave — evitar sombras duras
    const fill = new BABYLON.DirectionalLight('fill', new BABYLON.Vector3(1,-0.5,1), this.scene)
    fill.position  = new BABYLON.Vector3(-5, 5, -5)
    fill.intensity = 0.4
    fill.diffuse   = new BABYLON.Color3(1.0, 1.0, 1.0)
    fill.specular  = new BABYLON.Color3(0.0, 0.0, 0.0)

    this.shadowGenerator = new BABYLON.ShadowGenerator(1024, dir)
    this.shadowGenerator.useBlurExponentialShadowMap = true
    this.shadowGenerator.blurKernel = 8
    this.scene._shadowGenerator     = this.shadowGenerator

    // Chão invisível que só recebe sombra
  }



  _setupPostProcessing() {
    // Post-processing leve — compatível com Meta Quest
    try {
      const p = new BABYLON.DefaultRenderingPipeline('pipe', true, this.scene, [this.camera])
      p.bloomEnabled   = false  // bloom desativado — pesado no Quest
      p.imageProcessingEnabled             = true
      p.imageProcessing.contrast           = 1.05
      p.imageProcessing.vignetteEnabled    = false // vinheta desativada
      p.imageProcessing.toneMappingEnabled = false // tonemapping desativado
    } catch (e) { /* não crítico */ }
  }

  // Girar o ambiente (alinhar oficina com a frente da bomba)
  setEnvRotation(deg) {
    const tex = this._skyMat?.diffuseTexture
    if (tex) tex.uOffset = deg / 360
  }
}
