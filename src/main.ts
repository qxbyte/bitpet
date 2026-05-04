import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow, PhysicalPosition } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { PixelSprite, AnimationName } from './sprite';
import { BubbleLayer } from './bubble';

const PHRASES = ['哎！', '嘿～', '别戳了！', '好痒～', '干嘛啦', '(*/ω＼*)', '呦？', '...']
const LOCKED: AnimationName[] = ['launch', 'exit', 'thinking', 'active', 'click', 'eating']

async function main() {
  const canvas = document.getElementById('pet-canvas') as HTMLCanvasElement
  const sprite  = new PixelSprite(canvas)
  const bubble  = new BubbleLayer()
  const appWin  = getCurrentWindow()

  const v = Date.now()
  await sprite.load(`/sprites/bitpet.png?v=${v}`, `/sprites/manifest.json?v=${v}`)
  document.getElementById('loading')!.style.display = 'none'
  canvas.style.display = 'block'

  // ── 启动：Row 8 播完后回 Row 1 (idle) ───────────────────
  sprite.setState('launch', true)
  setTimeout(() => {
    if (sprite.getCurrentState() === 'launch') sprite.setState('idle')
  }, 6000)

  const app = document.getElementById('app')!

  // 点击（非拖动）只在 idle 时使用 Row 9，然后回到 Row 1。
  let dragMoved = false
  app.addEventListener('mousedown', () => { dragMoved = false })
  app.addEventListener('click', () => {
    if (dragMoved) return
    if (sprite.getCurrentState() !== 'idle') return
    if (sprite.getPendingState() !== null) return
    sprite.setState('click', true)
    bubble.showPhrase(PHRASES[Math.floor(Math.random() * PHRASES.length)])
    setTimeout(() => {
      if (sprite.getCurrentState() === 'click') sprite.setState('idle', true)
    }, 750)
  })

  // ── 拖动：向左 Row 3 / 向右 Row 2 ────────────────────────
  let lastX = 0
  let lastY = 0
  let lastWindowX: number | null = null
  let dragStartWindowX = 0
  let dragStartWindowY = 0
  let isDragging = false
  let isPointerDown = false
  let savePositionTimer = 0
  const finishDrag = () => {
    isPointerDown = false
    isDragging = false
    if (dragMoved) {
      setTimeout(() => {
        const cur = sprite.getCurrentState()
        if (cur === 'walk_left' || cur === 'walk_right') sprite.setState('idle', true)
      }, 250)
    }
  }

  app.addEventListener('mousedown', async (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    dragMoved = false
    isPointerDown = true
    isDragging = false
    lastX = e.screenX
    lastY = e.screenY
    lastWindowX = null
    const pos = await appWin.outerPosition()
    dragStartWindowX = pos.x
    dragStartWindowY = pos.y
  })

  window.addEventListener('mousemove', async (e) => {
    if (!isPointerDown) return
    const dx = e.screenX - lastX
    const dy = e.screenY - lastY
    if (!isDragging && Math.hypot(dx, dy) < 6) return

    isDragging = true
    dragMoved = true

    const dir: AnimationName = dx < 0 ? 'walk_left' : 'walk_right'
    if (sprite.getCurrentState() !== dir) sprite.setState(dir, true)
    await appWin.setPosition(new PhysicalPosition(
      dragStartWindowX + Math.round(dx),
      dragStartWindowY + Math.round(dy),
    ))
  })

  window.addEventListener('mouseup', () => {
    finishDrag()
  })

  await appWin.onMoved(async ({ payload }) => {
    if (isDragging) {
      dragMoved = true
      if (lastWindowX !== null) {
        const dx = payload.x - lastWindowX
        if (Math.abs(dx) >= 1) {
          const dir: AnimationName = dx < 0 ? 'walk_left' : 'walk_right'
          if (sprite.getCurrentState() !== dir) sprite.setState(dir, true)
        }
      }
    }
    lastWindowX = payload.x

    window.clearTimeout(savePositionTimer)
    savePositionTimer = window.setTimeout(async () => {
      const scale = await appWin.scaleFactor()
      await invoke('update_position', {
        x: payload.x / scale,
        y: payload.y / scale,
      })
    }, 250)
  })

  // ── Tauri 事件 ────────────────────────────────────────────

  // 用户回车后模型思考中 → Row 5
  await listen<{ tool: string; session: string }>('bubble:session_start', (e) => {
    bubble.showSession(e.payload.tool, e.payload.session)
    sprite.setState('thinking')
  })

  // 模型输出回复内容 → Row 7
  await listen<string>('bubble:delta', (e) => {
    if (sprite.getCurrentState() !== 'active') sprite.setState('active')
    bubble.appendDelta(e.payload)
  })

  await listen('bubble:session_end', () => {
    bubble.showComplete()
    sprite.setState('idle')
  })

  await listen('app:exit', () => {
    sprite.setState('exit', true)
  })

  // 状态衰减 → 饥饿超过 50% 时 Row 6 (sleeping) / 精力耗尽 Row 9 (deep_sleep)
  await listen<{ hunger: number; energy: number }>('state:update', (e) => {
    const { hunger, energy } = e.payload
    const cur = sprite.getCurrentState()
    if (LOCKED.includes(cur) || cur.startsWith('walk')) return

    if (hunger > 50) {
      sprite.setState('sleeping')
    } else if (energy <= 20) {
      sprite.setState('deep_sleep')
    } else if (cur === 'sleeping' || cur === 'deep_sleep') {
      sprite.setState('idle')
    }
  })

  // ── 闲置只保持 Row 1，无随机变体 ─────────────────────────
  // (idle IS Row 1, 没有其他切换逻辑)
}

main().catch(console.error)
