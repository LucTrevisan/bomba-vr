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
    // ── Engine com suporte WebXR nativo ─────────────────────────────────────
    // Verificar suporte WebGL2 (necessário para Quest)
    const gl = this.canvas.getContext('webgl2') ||
               this.canvas.getContext('webgl')
    if (!gl) {
      console.error('WebGL não suportado neste dispositivo')
      throw new Error('WebGL not supported')
    }

    this.engine = new BABYLON.Engine(this.canvas, true, {
      preserveDrawingBuffer: true,
      stencil:               true,
      antialias:             false,
      xrCompatible:          true,   // obrigatório para Quest
      disableWebGL2Support:  false,  // forçar WebGL2 quando disponível
      failIfMajorPerformanceCaveat: false,  // não falhar em dispositivos lentos
    })

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
    const base    = import.meta.env.BASE_URL
    const hdrFile = base + 'assets/ambiente360.hdr'
    const jpgFile = base + 'assets/ambiente360.jpg'

    // Tentar HDRI primeiro (alta qualidade + reflexos PBR)
    // Se não existir, usar JPG como fallback
    const fileToLoad = await this._fileExists(hdrFile) ? hdrFile : jpgFile
    const isHDR      = fileToLoad.endsWith('.hdr')

    console.log(`🌐 Carregando ambiente: ${isHDR ? 'HDRI alta qualidade' : 'JPG'}`)

    if (isHDR) {
      await this._setup360HDR(fileToLoad)
    } else {
      await this._setup360JPG(fileToLoad)
    }
  }

  async _fileExists(url) {
    try {
      const r = await fetch(url, { method: 'HEAD' })
      return r.ok
    } catch { return false }
  }

  async _setup360HDR(url) {
    return new Promise((resolve) => {
      try {
        // HDRCubeTexture para arquivos .hdr equiretangulares do Poly Haven
        // size=512: qualidade boa sem impacto de performance no Quest
        const hdrTex = new BABYLON.HDRCubeTexture(
          url,
          this.scene,
          512,        // tamanho do cubemap gerado
          false,      // noMipmap
          true,       // generateHarmonics
          false,      // gammaSpace
          false,      // reserved
          () => {
            // Usar como environment para reflexos PBR
            this.scene.environmentTexture   = hdrTex
            this.scene.environmentIntensity = 0.8

            // Criar skybox visível a partir do HDR
            const skybox = this.scene.createDefaultSkybox(
              hdrTex,
              true,   // pbr
              1000,   // scale
              0.0     // blur
            )
            if (skybox) {
              skybox.isPickable       = false
              skybox.renderingGroupId = 0
              this._sky = skybox
            }

            console.log('✅ HDRI carregado — ambiente de alta qualidade ativo')
            resolve()
          },
          (err) => {
            console.warn('⚠️ HDRI falhou:', err, '— usando JPG')
            this._setup360JPG(
              import.meta.env.BASE_URL + 'assets/ambiente360.jpg'
            ).then(resolve)
          }
        )
      } catch (e) {
        console.warn('⚠️ HDRCubeTexture não suportado:', e.message)
        this._setup360JPG(
          import.meta.env.BASE_URL + 'assets/ambiente360.jpg'
        ).then(resolve)
      }
    })
  }

  async _setup360JPG(url) {
    const sphere = BABYLON.MeshBuilder.CreateSphere('sky360', {
      diameter:        1000,
      segments:        64,
      sideOrientation: BABYLON.Mesh.BACKSIDE,
    }, this.scene)

    sphere.isPickable       = false
    sphere.infiniteDistance = true
    sphere.renderingGroupId = 0
    sphere.position         = BABYLON.Vector3.Zero()

    const mat = new BABYLON.StandardMaterial('sky360mat', this.scene)
    mat.disableLighting = true
    mat.backFaceCulling = false
    mat.fogEnabled      = false
    mat.emissiveColor   = new BABYLON.Color3(0.04, 0.06, 0.10)
    sphere.material     = mat
    this._sky           = sphere

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.warn('⚠️ JPG 360° timeout')
        resolve()
      }, 12000)

      const tex = new BABYLON.Texture(
        url, this.scene, false, false,
        BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
        () => {
          clearTimeout(timeout)
          tex.uScale = 1
          tex.vScale = 1
          tex.wrapU  = BABYLON.Texture.WRAP_ADDRESSMODE
          tex.wrapV  = BABYLON.Texture.CLAMP_ADDRESSMODE
          mat.diffuseTexture  = tex
          mat.emissiveTexture = tex
          mat.emissiveColor   = BABYLON.Color3.White()
          console.log('✅ JPG 360° carregado')
          resolve()
        },
        () => { clearTimeout(timeout); resolve() }
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
