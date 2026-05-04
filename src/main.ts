import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { PixelSprite, AnimationName } from './sprite';
import { BubbleLayer } from './bubble';

const PHRASES = ['哎！', '嘿～', '别戳了！', '好痒～', '干嘛啦', '(*/ω＼*)', '呦？', '...']
const LOCKED: AnimationName[] = ['launch', 'eating']

async function main() {
  const canvas = document.getElementById('pet-canvas') as HTMLCanvasElement
  const sprite  = new PixelSprite(canvas)
  const bubble  = new BubbleLayer()
  const appWin  = getCurrentWindow()

  const v = Date.now()
  await sprite.load(`/sprites/bitpet.png?v=${v}`, `/sprites/manifest.json?v=${v}`)
  document.getElementById('loading')!.style.display = 'none'
  canvas.style.display = 'block'

  // ── 启动：Row 5 (launch/💡) 播完后回 Row 1 (idle) ────────
  sprite.setState('launch', true)
  setTimeout(() => {
    if (sprite.getCurrentState() === 'launch') sprite.setState('idle')
  }, 2500)

  const app = document.getElementById('app')!

  // ── 鼠标悬停：Row 4 (hover) ───────────────────────────────
  app.addEventListener('mouseenter', () => {
    const cur = sprite.getCurrentState()
    if (!LOCKED.includes(cur) && !cur.startsWith('walk')) {
      sprite.setState('hover')
    }
  })

  app.addEventListener('mouseleave', () => {
    setTimeout(() => {
      if (sprite.getCurrentState() === 'hover') sprite.setState('idle')
    }, 400)
  })

  // 点击（非拖动）→ 随机短语
  let dragMoved = false
  app.addEventListener('mousedown', () => { dragMoved = false })
  app.addEventListener('click', () => {
    if (dragMoved) return
    bubble.showPhrase(PHRASES[Math.floor(Math.random() * PHRASES.length)])
  })

  // ── 拖动：向左 Row 3 / 向右 Row 2 ────────────────────────
  let lastX = 0
  app.addEventListener('mousedown', (e) => { lastX = e.screenX })

  window.addEventListener('mousemove', async (e) => {
    const dx = e.screenX - lastX
    if (Math.abs(dx) < 4) return
    dragMoved = true

    const dir: AnimationName = dx < 0 ? 'walk_left' : 'walk_right'
    if (sprite.getCurrentState() !== dir) sprite.setState(dir, true)
    lastX = e.screenX
    await appWin.startDragging()
  })

  window.addEventListener('mouseup', () => {
    if (dragMoved) {
      setTimeout(() => {
        const cur = sprite.getCurrentState()
        if (cur === 'walk_left' || cur === 'walk_right') sprite.setState('idle')
      }, 250)
    }
  })

  // ── Tauri 事件 ────────────────────────────────────────────

  // AI 开始工作 → Row 7 (active/💻)
  await listen<{ tool: string; session: string }>('bubble:session_start', (e) => {
    bubble.showSession(e.payload.tool, e.payload.session)
    sprite.setState('active')
  })

  await listen<string>('bubble:delta', (e) => {
    bubble.appendDelta(e.payload)
  })

  await listen('bubble:session_end', () => {
    bubble.showComplete()
    sprite.setState('idle')
  })

  // 状态衰减 → 饥饿时 Row 6 (sleeping) / 精力耗尽 Row 9 (deep_sleep)
  await listen<{ hunger: number; energy: number }>('state:update', (e) => {
    const { hunger, energy } = e.payload
    const cur = sprite.getCurrentState()
    if (LOCKED.includes(cur) || cur === 'active') return

    if (energy <= 20) {
      sprite.setState('deep_sleep')
    } else if (hunger >= 80) {
      sprite.setState('sleeping')
    } else if (cur === 'sleeping' || cur === 'deep_sleep') {
      sprite.setState('idle')
    }
  })

  // ── 闲置只保持 Row 1，无随机变体 ─────────────────────────
  // (idle IS Row 1, 没有其他切换逻辑)
}

main().catch(console.error)
