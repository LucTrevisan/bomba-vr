/**
 * AssemblyManager — Lógica completa de montagem, progresso e validação
 */
import * as BABYLON from '@babylonjs/core'
import { MONTAGEM_SEQ, DESMONTAGEM_SEQ, SNAP_DIST } from '../utils/constants.js'

// Offsets da vista explodida (posição relativa ao originPos)
const EXPLODE = {
  support               : new BABYLON.Vector3(  0.000,  0.00,  0.00),
  motor_body            : new BABYLON.Vector3(  0.000,  0.00,  1.80),

  // Hidráulico — Z negativo
  pump_casing           : new BABYLON.Vector3(  0.048,  0.00, -0.55),
  pump_impeller         : new BABYLON.Vector3(  0.048,  0.00, -0.85),
  wear_ring             : new BABYLON.Vector3(  0.048,  0.00, -1.05),
  wear_ring_2           : new BABYLON.Vector3(  0.048,  0.00, -1.25),

  // Vedação — Z negativo
  seal_chamber          : new BABYLON.Vector3(  0.048,  0.00, -0.45),
  pump_lantern_ring     : new BABYLON.Vector3(  0.048,  0.00, -0.60),
  pump_packing_set      : new BABYLON.Vector3(  0.048,  0.00, -0.70),
  pump_packing_set_2    : new BABYLON.Vector3(  0.048,  0.00, -0.78),
  pump_packing_set_3    : new BABYLON.Vector3(  0.048,  0.00, -0.86),
  pump_packing_set_4    : new BABYLON.Vector3(  0.048,  0.00, -0.94),
  pump_packing_set_5    : new BABYLON.Vector3(  0.048,  0.00, -1.02),
  pump_packing_set_6    : new BABYLON.Vector3(  0.048,  0.00, -1.10),
  pump_packing_set_7    : new BABYLON.Vector3(  0.048,  0.00, -1.18),
  pump_packing_set_8    : new BABYLON.Vector3(  0.048,  0.00, -1.26),
  pump_packing_gland    : new BABYLON.Vector3(  0.048,  0.00, -0.32),

  // Mancal — sobe
  house_bearing         : new BABYLON.Vector3(  0.048,  0.50,  0.00),
  shaft                 : new BABYLON.Vector3(  0.048,  0.65,  0.00),

  // Transmissão — Z positivo bem espaçados
  bearing_cover         : new BABYLON.Vector3(  0.048,  0.00,  0.55),
  bearing_cover_2       : new BABYLON.Vector3(  0.048,  0.00,  0.70),
  pump_coupling         : new BABYLON.Vector3(  0.000,  0.00,  0.85),
  coupling              : new BABYLON.Vector3(  0.000,  0.00,  1.05),
  coupling_2            : new BABYLON.Vector3(  0.000,  0.00,  1.25),
  pump_protection       : new BABYLON.Vector3(  0.000,  0.00,  1.45),
}

export class AssemblyManager {
  constructor(scene, pumpModel) {
    this.scene        = scene
    this.pumpModel    = pumpModel
    this.modo         = 'visualizacao'  // visualizacao | livre | guiado | avaliacao
    this.montado      = new Set()       // chaves das peças montadas
    this.guidedStep   = 0
    this.score        = 0
    this.erros        = 0
    this.tempoInicio  = 0
    this.isExploded   = false

    // Callbacks
    this.onSnap        = null
    this.onErro        = null
    this.onStepChange  = null
    this.onComplete    = null
    this.onProgress    = null
  }

  init() {
    const keys = Object.keys(this.pumpModel.parts)
    keys.forEach(k => this.montado.add(k))
    this._emitProgress()
    // Não iniciar animações se não há peças mapeadas
    if (keys.length === 0) {
      console.warn('⚠️ Nenhuma peça mapeada — animações desativadas')
      this._noPartsMode = true
    }
  }

  // ── Modos ───────────────────────────────────────────────────────────────
  setModo(modo) {
    // Sem peças — não animar
    if (this._noPartsMode) {
      this.modo = modo
      console.warn('Modo alterado mas sem peças para animar')
      return
    }

    // Cancelar qualquer animação em andamento
    this._cancelAnim = true
    setTimeout(() => { this._cancelAnim = false }, 100)

    this.modo = modo

    switch (modo) {
      case 'visualizacao':
        this.montar(true)
        break

      case 'livre':
        this._resetStats()
        this.explodir(true)
        break

      case 'guiado':
        this._resetStats()
        this.guidedStep = 0
        this.explodir(false).then(() => {
          if (this.modo === 'guiado') this._nextGuidedStep()
        })
        break

      case 'avaliacao':
        this._resetStats()
        this.guidedStep  = 0
        this.tempoInicio = Date.now()
        this.explodir(true)
        break
    }
  }

  _resetStats() {
    this.score = 0; this.erros = 0; this.montado.clear()
    this._emitProgress()
  }

  // ── Snap ────────────────────────────────────────────────────────────────
  trySnap(key) {
    const node   = this.pumpModel.parts[key]
    const meta   = this.pumpModel.meta?.[key]
    if (!node || meta?.interactive === false) return false

    const origin = this.pumpModel.originPos[key]
    // Comparar posição LOCAL diretamente
    const dist = BABYLON.Vector3.Distance(node.position, origin)

    if (dist < SNAP_DIST) {
      this._animTo(node, origin.clone(), 220)
      this.montado.add(key)
      this._calcScore(key, true)
      this.onSnap?.(key)
      this._emitProgress()

      // Só verificar conclusão nos modos ativos (não em visualizacao)
      if (this.modo !== 'visualizacao') {
        const totalInteractive = Object.entries(this.pumpModel.meta || {})
          .filter(([,v]) => v.interactive !== false).length || 17
        if (this.montado.size >= totalInteractive) {
          setTimeout(() => this.onComplete?.(), 500)
        }
      }
      return true
    }

    if (this.modo === 'avaliacao' || this.modo === 'guiado') {
      this.erros++
      this._calcScore(key, false)
      this.onErro?.(key)
    }
    return false
  }

  _calcScore(key, correto) {
    if (this.modo === 'visualizacao') return
    if (correto) {
      // Bônus por rapidez
      const elapsed = (Date.now() - this.tempoInicio) / 1000
      const bonus   = Math.max(0, 20 - Math.floor(elapsed / 10))
      this.score   += 10 + bonus
    } else {
      this.score = Math.max(0, this.score - 3)
    }
  }

  _emitProgress() {
    const total       = Object.keys(this.pumpModel.parts).length
    const montadoCount = this.montado.size
    const pct         = total > 0 ? Math.round((montadoCount / total) * 100) : 0
    this.onProgress?.({ montado: montadoCount, total, pct, score: this.score, erros: this.erros })
  }

  // ── Vista explodida ──────────────────────────────────────────────────────
  async explodir(animated = true) {
    this.isExploded = true

    // Garantir que as origens estão disponíveis
    const nOrigens = Object.keys(this.pumpModel.originPos).length
    if (nOrigens === 0) {
      console.warn('⚠️ originPos vazio — recalculando origens')
      this.pumpModel._storeOrigins()
    }

    const promises  = []
    Object.entries(this.pumpModel.parts).forEach(([key, node]) => {
      const off    = EXPLODE[key] ?? new BABYLON.Vector3(0, 0.5, 0)
      const origin = this.pumpModel.originPos[key]
      if (!origin) {
        // Usar posição atual como origem e registrar
        this.pumpModel.originPos[key] = node.position.clone()
        return
      }
      const target = new BABYLON.Vector3(
        origin.x + off.x,
        origin.y + off.y,
        origin.z + off.z
      )
      // delay baseado na sequência — chaves não listadas recebem delay 0
      const seqIdx = MONTAGEM_SEQ.indexOf(key)
      const delay  = seqIdx >= 0 ? seqIdx * 50 : 0
      if (animated) promises.push(this._animTo(node, target, 500, delay))
      else {
        node.position.x = target.x
        node.position.y = target.y
        node.position.z = target.z
      }
    })
    await Promise.all(promises)
  }

  async montar(animated = true) {
    this.isExploded = false
    const promises  = []
    Object.entries(this.pumpModel.parts).forEach(([key, node]) => {
      // Restaurar posição LOCAL original (relativa ao pai)
      const target = this.pumpModel.originPos[key].clone()
      const delay  = (MONTAGEM_SEQ.length - MONTAGEM_SEQ.indexOf(key)) * 40
      if (animated) promises.push(this._animTo(node, target, 600, delay))
      else {
        node.position.x = target.x
        node.position.y = target.y
        node.position.z = target.z
      }
    })
    await Promise.all(promises)
  }

  async reset() {
    this._resetStats()
    if (this.modo === 'guiado' || this.modo === 'avaliacao') {
      await this.explodir(true)
      this.guidedStep = 0
      if (this.modo === 'guiado') setTimeout(() => this._nextGuidedStep(), 500)
      if (this.modo === 'avaliacao') this.tempoInicio = Date.now()
    } else {
      await this.montar(true)
    }
  }

  // ── Passo guiado ─────────────────────────────────────────────────────────
  async _nextGuidedStep() {
    // Pular passos cujas peças não existem no modelo carregado
    while (this.guidedStep < MONTAGEM_SEQ.length) {
      const key = MONTAGEM_SEQ[this.guidedStep]
      if (this.pumpModel.parts[key]) break
      this.guidedStep++
    }
    if (this.guidedStep >= MONTAGEM_SEQ.length) {
      this.onComplete?.(); return
    }
    const key = MONTAGEM_SEQ[this.guidedStep]
    this.onStepChange?.(key, this.guidedStep, MONTAGEM_SEQ.length)
  }

  async guidedAdvance() {
    // Evitar loop infinito — avançar no máximo até o fim da sequência
    while (this.guidedStep < MONTAGEM_SEQ.length) {
      const key  = MONTAGEM_SEQ[this.guidedStep]
      const node = this.pumpModel.parts[key]
      if (node) break          // peça existe — usar este passo
      this.guidedStep++        // peça não existe no modelo — pular
    }
    if (this.guidedStep >= MONTAGEM_SEQ.length) {
      this.onComplete?.(); return
    }
    const key  = MONTAGEM_SEQ[this.guidedStep]
    const node = this.pumpModel.parts[key]
    if (!node) { this.onComplete?.(); return }
    const target = this.pumpModel.originPos[key].clone()
    await this._animTo(node, target, 700)
    this.montado.add(key)
    this._emitProgress()
    this.guidedStep++
    this._nextGuidedStep()
  }

  getNextExpected() { return MONTAGEM_SEQ[this.guidedStep] }

  getTempo() {
    if (!this.tempoInicio) return 0
    return Math.floor((Date.now() - this.tempoInicio) / 1000)
  }

  // ── Animação ─────────────────────────────────────────────────────────────
  _animTo(node, target, ms, delay=0) {
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        const start = node.position.clone()
        const t0    = performance.now()
        const tick  = () => {
          if (this._cancelAnim) {
            node.position = target.clone()
            resolve()
            return
          }
          const t = Math.min((performance.now()-t0)/ms, 1)
          const e = t<.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2
          node.position = BABYLON.Vector3.Lerp(start, target, e)
          t<1 ? requestAnimationFrame(tick) : (node.position=target.clone(), resolve())
        }
        requestAnimationFrame(tick)
      }, delay)
    })
  }
}
