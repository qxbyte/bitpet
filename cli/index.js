#!/usr/bin/env node
'use strict'

const net = require('net')
const os = require('os')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const { GUIDES } = require('./hooks-guide')

const SOCKET = path.join(os.tmpdir(), 'bitpet.sock')  // macOS: /var/folders/.../T/bitpet.sock
const COMMANDS_DIR = path.join(os.homedir(), '.claude', 'commands')
const CMD_FILE = path.join(COMMANDS_DIR, 'pet.md')

const PET_CMD_CONTENT = `---
description: 控制 BitPet 桌面宠物（init/feed/play/status/stop）
---
!bitpet $ARGUMENTS
`

// ── Socket helpers ────────────────────────────────────────────

function sendCmd(action) {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(SOCKET, () => {
      client.write(JSON.stringify({ type: 'cmd', action }) + '\n')
    })
    let buf = ''
    client.on('data', (d) => {
      buf += d.toString()
      // Resolve as soon as we receive a complete newline-terminated JSON line.
      const line = buf.split('\n').find(l => l.trim())
      if (line) {
        client.destroy()
        try { resolve(JSON.parse(line.trim())) }
        catch { resolve({ ok: true }) }
      }
    })
    client.on('error', reject)
    client.setTimeout(3000, () => { client.destroy(); reject(new Error('timeout')) })
  })
}

function isDaemonRunning() {
  return new Promise((resolve) => {
    const client = net.createConnection(SOCKET, () => {
      client.destroy()
      resolve(true)
    })
    client.on('error', () => resolve(false))
    client.setTimeout(500, () => { client.destroy(); resolve(false) })
  })
}

// ── Install Claude Code slash command ────────────────────────

function installClaudeCommand() {
  try {
    fs.mkdirSync(COMMANDS_DIR, { recursive: true })
    if (!fs.existsSync(CMD_FILE)) {
      fs.writeFileSync(CMD_FILE, PET_CMD_CONTENT)
      console.log(`✅ 已安装 Claude Code 命令：/pet`)
      console.log(`   文件：${CMD_FILE}`)
    }
  } catch {
    // non-fatal
  }
}

// ── Status formatter ─────────────────────────────────────────

function formatStatus(data) {
  const { hunger, mood, energy } = data

  const hungerLabel = hunger >= 80 ? '😫 极度饥饿' : hunger >= 50 ? '🍖 有点饿' : hunger >= 20 ? '😊 微饿' : '🍽️  吃饱了'
  const moodLabel   = mood >= 80   ? '😄 心情极好'  : mood >= 50   ? '🙂 还不错'  : mood >= 20   ? '😐 一般'   : '😢 不开心'
  const energyLabel = energy >= 80 ? '⚡ 精力充沛' : energy >= 50 ? '💪 状态不错' : energy >= 20 ? '😪 有点累'  : '💤 精疲力竭'

  console.log('')
  console.log('  🐾 BitPet 状态')
  console.log('  ─────────────────')
  console.log(`  ${hungerLabel.padEnd(14)}  饥饿度 ${hunger}/100`)
  console.log(`  ${moodLabel.padEnd(14)}  心情   ${mood}/100`)
  console.log(`  ${energyLabel.padEnd(14)}  精力   ${energy}/100`)
  console.log('')
}

// ── Commands ─────────────────────────────────────────────────

async function startViteIfNeeded(projectRoot) {
  // Check if Vite is already listening on port 1420.
  return new Promise((resolve) => {
    const probe = require('net').createConnection({ port: 1420, host: '127.0.0.1' }, () => {
      probe.destroy()
      resolve(false) // already running
    })
    probe.on('error', () => {
      // Not running — start Vite in background.
      const vite = spawn('npm', ['run', 'vite:dev'], {
        cwd: projectRoot,
        detached: true,
        stdio: ['ignore', require('fs').openSync('/tmp/bitpet-vite.log', 'w'), 'ignore'],
      })
      vite.unref()
      resolve(true) // started
    })
    probe.setTimeout(300, () => { probe.destroy() })
  })
}

async function cmdInit() {
  const running = await isDaemonRunning()
  if (running) {
    console.log('🐾 BitPet 已在运行中！')
    return
  }

  // Locate runnable binary or .app bundle.
  const projectRoot = path.join(__dirname, '..')
  const appBundle   = path.join(projectRoot, 'src-tauri', 'target', 'release', 'bundle', 'macos', 'BitPet.app')
  const debugBin    = path.join(projectRoot, 'src-tauri', 'target', 'debug', 'bitpet')
  const releaseBin  = path.join(projectRoot, 'src-tauri', 'target', 'release', 'bitpet')
  const installedApp = '/Applications/BitPet.app'

  let child
  if (fs.existsSync(installedApp)) {
    child = spawn('open', [installedApp], { detached: true, stdio: 'ignore' })
  } else if (fs.existsSync(appBundle)) {
    child = spawn('open', [appBundle], { detached: true, stdio: 'ignore' })
  } else if (fs.existsSync(releaseBin)) {
    child = spawn(releaseBin, [], { detached: true, stdio: 'ignore' })
  } else if (fs.existsSync(debugBin)) {
    // Debug binary needs Vite dev server on port 1420.
    const started = await startViteIfNeeded(projectRoot)
    if (started) {
      process.stdout.write('⚡ 启动 Vite 开发服务器')
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 400))
        process.stdout.write('.')
        const ready = await new Promise(r => {
          const p = require('net').createConnection({ port: 1420 }, () => { p.destroy(); r(true) })
          p.on('error', () => r(false))
          p.setTimeout(200, () => { p.destroy(); r(false) })
        })
        if (ready) break
      }
      console.log('')
    }
    child = spawn(debugBin, [], { detached: true, stdio: 'ignore' })
  } else {
    console.error('❌ 找不到 BitPet 可执行文件')
    console.error('   请先构建项目：cd ' + projectRoot + ' && npm run build')
    process.exit(1)
  }
  child.unref()

  // Wait for socket to appear (max 6s)
  process.stdout.write('🐾 正在启动 BitPet')
  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 500))
    process.stdout.write('.')
    if (await isDaemonRunning()) break
  }
  console.log('')

  if (await isDaemonRunning()) {
    console.log('✅ BitPet 已启动！')
    installClaudeCommand()
    console.log('\n提示：在 Claude Code 中用 /pet <命令> 控制宠物')
    console.log('      运行 bitpet setup-hooks --tool claude 配置 AI 集成')
  } else {
    console.error('❌ 启动超时，请手动运行应用')
    process.exit(1)
  }
}

async function cmdWithDaemon(action, onSuccess) {
  const running = await isDaemonRunning()
  if (!running) {
    console.error('❌ BitPet 未运行，请先执行：bitpet init  或  /pet init')
    process.exit(1)
  }
  try {
    const res = await sendCmd(action)
    if (res.ok) {
      onSuccess(res.data)
    } else {
      console.error(`❌ ${res.error || '未知错误'}`)
    }
  } catch (e) {
    console.error(`❌ 通信失败：${e.message}`)
  }
}

function cmdSetupHooks(tool) {
  const validTools = ['claude', 'codex', 'opencode']
  if (!validTools.includes(tool)) {
    console.log('用法：bitpet setup-hooks --tool <claude|codex|opencode>')
    process.exit(1)
  }
  console.log(GUIDES[tool])
}

// ── Entry point ───────────────────────────────────────────────

async function main() {
  const [, , cmd, ...args] = process.argv

  switch (cmd) {
    case 'init':
      await cmdInit()
      break

    case 'feed':
      await cmdWithDaemon('feed', () => console.log('🍖 喂食成功！宠物吃得很开心～'))
      break

    case 'play':
      await cmdWithDaemon('play', () => console.log('🎮 玩耍中！宠物跳起来了～'))
      break

    case 'status':
      await cmdWithDaemon('status', (data) => {
        if (data) formatStatus(data)
      })
      break

    case 'stop':
      await cmdWithDaemon('stop', () => console.log('👋 BitPet 已关闭'))
      break

    case 'setup-hooks': {
      const toolFlag = args.indexOf('--tool')
      const tool = toolFlag >= 0 ? args[toolFlag + 1] : args[0]
      cmdSetupHooks(tool || '')
      break
    }

    case '--version':
    case '-v':
      console.log('bitpet 0.1.0')
      break

    default:
      console.log(`
BitPet CLI — 桌面宠物控制工具

用法：
  bitpet init                         启动宠物（首次使用）
  bitpet feed                         喂食
  bitpet play                         玩耍
  bitpet status                       查看状态
  bitpet stop                         关闭宠物
  bitpet setup-hooks --tool <name>    显示 hooks 配置指引
                      claude | codex | opencode

在 Claude Code 中使用：
  /pet init | feed | play | status | stop
`)
  }
}

main().catch(e => {
  console.error('❌', e.message)
  process.exit(1)
})
