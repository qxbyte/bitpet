import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow, PhysicalPosition } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { PixelSprite, AnimationName } from './sprite';
import { BubbleLayer } from './bubble';

const PHRASES = ['哎！', '嘿～', '别戳了！', '好痒～', '干嘛啦', '(*/ω＼*)', '呦？', '...']
const LOCKED: AnimationName[] = ['launch', 'exit', 'thinking', 'active', 'click']

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

  // 用户回车后模型思考中 → Row 5（立即切换，确保思考动画第一时间出现）
  await listen<{ tool: string; session: string }>('bubble:session_start', (e) => {
    bubble.showSession(e.payload.tool, e.payload.session)
    sprite.setState('thinking', true)
  })

  // 模型输出回复内容 → Row 7（立即切换，从 thinking 过渡到 active）
  await listen<string>('bubble:delta', (e) => {
    sprite.setState('active', true)
    bubble.appendDelta(e.payload)
  })

  await listen('bubble:session_end', () => {
    bubble.showComplete()
    sprite.setState('idle')
  })

  await listen('app:exit', () => {
    sprite.setState('exit', true)
  })

  // 状态轮询：500ms 检查一次，同步 sleep 状态
  const syncState = async () => {
    try {
      const status = await invoke<{ hunger: number; energy: number }>('get_status')
      const cur = sprite.getCurrentState()

      if (LOCKED.includes(cur) || cur.startsWith('walk')) return
      if (status.energy <= 20 && cur !== 'deep_sleep') {
        sprite.setState('deep_sleep')
      } else if (status.hunger >= 100 && cur !== 'sleeping' && cur !== 'deep_sleep') {
        sprite.setState('sleeping', true)
      } else if (status.hunger < 100 && (cur === 'sleeping' || cur === 'deep_sleep')) {
        sprite.setState('idle', true)
      }
    } catch { /* ignore */ }
  }
  await syncState()
  setInterval(syncState, 500)

  // 睡觉动画（持久）：直接切换，不受 LOCKED 限制
  await listen('pet:sleep', () => {
    sprite.setState('sleeping', true)
  })

  // 状态衰减 → 饥饿达到 100% 时进入睡眠；喂食后唤醒
  await listen<{ hunger: number; energy: number }>('state:update', (e) => {
    const { hunger, energy } = e.payload
    const cur = sprite.getCurrentState()
    if (LOCKED.includes(cur) || cur.startsWith('walk')) return

    if (energy <= 20) {
      sprite.setState('deep_sleep')
    } else if (hunger >= 100) {
      sprite.setState('sleeping')
    } else if (cur === 'sleeping' || cur === 'deep_sleep') {
      sprite.setState('idle')
    }
  })

  // ── 右键菜单 ─────────────────────────────────────────────
  const ctxMenu = document.getElementById('context-menu')!
  const menuQuit = document.getElementById('menu-quit')!

  app.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    const x = Math.min(e.clientX, window.innerWidth - 90)
    const y = Math.min(e.clientY, window.innerHeight - 30)
    ctxMenu.style.left = `${x}px`
    ctxMenu.style.top = `${y}px`
    ctxMenu.style.display = 'block'
  })

  document.addEventListener('click', () => {
    ctxMenu.style.display = 'none'
  })

  menuQuit.addEventListener('click', () => {
    ctxMenu.style.display = 'none'
    invoke('quit_app')
  })
}

main().catch(console.error)
