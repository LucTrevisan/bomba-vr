/**
 * QRManager — QR Code dinâmico da URL atual
 * Aparece como painel flutuante na cena 3D
 */
import * as BABYLON from '@babylonjs/core'
import * as GUI     from '@babylonjs/gui'
import QRCode       from 'qrcode'

export class QRManager {
  constructor(scene) {
    this.scene   = scene
    this._plane  = null
    this._visible = false
  }

  async init() {
    await this._buildPanel()
  }

  toggle() {
    this._visible = !this._visible
    this._plane?.setEnabled(this._visible)

    if (this._visible) {
      // Reposicionar na frente da câmera
      this._repositionPanel()
    }
  }

  async _buildPanel() {
    // Plano 3D quadrado
    const plane = BABYLON.MeshBuilder.CreatePlane('qr_panel', {
      width: 0.40, height: 0.48
    }, this.scene)
    plane.billboardMode  = BABYLON.Mesh.BILLBOARDMODE_ALL
    plane.isPickable     = false
    plane.renderingGroupId = 1
    plane.setEnabled(false)

    const tex = GUI.AdvancedDynamicTexture.CreateForMesh(plane, 400, 480)

    // Fundo
    const bg = new GUI.Rectangle()
    bg.background   = 'rgba(6,13,24,0.97)'
    bg.cornerRadius = 20
    bg.thickness    = 2
    bg.color        = '#C8102E'
    bg.width = '100%'; bg.height = '100%'
    tex.addControl(bg)

    const stack = new GUI.StackPanel()
    stack.paddingTop = stack.paddingLeft = stack.paddingRight = '16px'
    stack.width = '100%'
    bg.addControl(stack)

    // Título SENAI
    const titulo = new GUI.TextBlock()
    titulo.text      = 'SENAI · Simulador VR'
    titulo.color     = '#C8102E'
    titulo.fontSize  = 22
    titulo.height    = '26px'
    titulo.fontWeight = 'bold'
    titulo.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER
    stack.addControl(titulo)

    // Subtítulo
    const sub = new GUI.TextBlock()
    sub.text    = 'Bomba Centrífuga'
    sub.color   = '#5a6a80'
    sub.fontSize = 18
    sub.height  = '22px'
    sub.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER
    stack.addControl(sub)

    // Espaço
    const sp = new GUI.Rectangle()
    sp.height = '8px'; sp.thickness = 0
    stack.addControl(sp)

    // Imagem do QR Code
    const qrImage = new GUI.Image('qr_img', '')
    qrImage.width  = '240px'
    qrImage.height = '240px'
    qrImage.paddingLeft = qrImage.paddingRight = 'auto'
    stack.addControl(qrImage)

    // Gerar QR Code com a URL atual
    try {
      const url = window.location.href.split('?')[0]  // sem query params
      const dataUrl = await QRCode.toDataURL(url, {
        width:          240,
        margin:         2,
        color: {
          dark:  '#000000',
          light: '#FFFFFF',
        },
        errorCorrectionLevel: 'M',
      })
      qrImage.source = dataUrl
      console.log('✅ QR Code gerado para:', url)
    } catch (e) {
      console.warn('QR Code erro:', e)
    }

    // Texto de instrução
    const inst = new GUI.TextBlock()
    inst.text        = 'Escaneie para acessar'
    inst.color       = '#E8EDF5'
    inst.fontSize    = 18
    inst.height      = '22px'
    inst.paddingTop  = '8px'
    inst.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER
    stack.addControl(inst)

    const inst2 = new GUI.TextBlock()
    inst2.text       = 'no celular ou tablet'
    inst2.color      = '#5a6a80'
    inst2.fontSize   = 16
    inst2.height     = '20px'
    inst2.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER
    stack.addControl(inst2)

    this._plane = plane
  }

  _repositionPanel() {
    const cam = this.scene.activeCamera
    if (!cam || !this._plane) return

    try {
      const forward = cam.getForwardRay ? cam.getForwardRay(1).direction
        : new BABYLON.Vector3(0, 0, 1)
      const right = BABYLON.Vector3.Cross(forward, BABYLON.Vector3.Up()).normalize()

      this._plane.position = new BABYLON.Vector3(
        cam.position.x + forward.x * 1.5 + right.x * 0.5,
        cam.position.y + 0.1,
        cam.position.z + forward.z * 1.5 + right.z * 0.5
      )
    } catch {
      this._plane.position = new BABYLON.Vector3(0.6, 0.3, 1.5)
    }
  }
}
