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
const CLAUDE_SETTINGS = path.join(os.homedir(), '.claude', 'settings.json')

const PET_CMD_CONTENT = `---
description: 控制 BitPet 桌面宠物（init/feed/play/status/stop）
---
!bitpet $ARGUMENTS
`

// Hooks to inject into ~/.claude/settings.json.
// Each hook reads tool/session info from stdin (Claude Code passes JSON for all hook types).
const BITPET_HOOK_ENTRIES = [
  { hookType: 'UserPromptSubmit', command: 'bitpet-hook session-start claude-code' },
  { hookType: 'PreToolUse',       command: 'bitpet-hook session-start claude-code' },
  { hookType: 'PostToolUse',      command: 'bitpet-hook message claude-code' },
  { hookType: 'Stop',             command: 'bitpet-hook session-end claude-code' },
]

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

// ── Install CLI symlinks from .app bundle ─────────────────────
// After updating BitPet.app, run `bitpet install-cli` to update the
// CLI in sync — symlinks point inside the bundle so future app updates
// are automatically picked up with no extra step.

function cmdInstallCli() {
  // Locate the Resources/cli directory inside the running .app bundle.
  // __filename when called from inside the bundle:
  //   /Applications/BitPet.app/Contents/Resources/cli/index.js
  const bundleCli = path.resolve(__dirname)
  const bundleIndex    = path.join(bundleCli, 'index.js')
  const bundleHook     = path.join(bundleCli, 'bitpet-hook.js')
  const isInsideBundle = bundleCli.includes('.app/Contents/Resources')

  if (!isInsideBundle) {
    console.log('⚠️  此命令需要从 .app bundle 内运行')
    console.log('   请先安装 BitPet.app，然后执行：')
    console.log('   node /Applications/BitPet.app/Contents/Resources/cli/index.js install-cli')
    return
  }

  // Try /usr/local/bin first; fall back to ~/.local/bin (no sudo needed).
  const dirs = ['/usr/local/bin', path.join(os.homedir(), '.local', 'bin')]
  let binDir = null
  for (const d of dirs) {
    try {
      fs.mkdirSync(d, { recursive: true })
      fs.accessSync(d, fs.constants.W_OK)
      binDir = d
      break
    } catch { /* not writable */ }
  }

  if (!binDir) {
    console.log('❌ 无法写入 /usr/local/bin 或 ~/.local/bin')
    console.log('   请手动运行：sudo ln -sf ' + bundleIndex + ' /usr/local/bin/bitpet')
    return
  }

  const links = [
    { src: bundleIndex, dst: path.join(binDir, 'bitpet') },
    { src: bundleHook,  dst: path.join(binDir, 'bitpet-hook') },
  ]

  for (const { src, dst } of links) {
    try {
      if (fs.existsSync(dst)) fs.unlinkSync(dst)
      fs.symlinkSync(src, dst)
      console.log(`✅ ${dst} → ${src}`)
    } catch (e) {
      console.log(`❌ 创建符号链接失败：${e.message}`)
    }
  }

  if (binDir === path.join(os.homedir(), '.local', 'bin')) {
    console.log('\n提示：~/.local/bin 需要在 PATH 中，将以下行加入 ~/.zshrc 或 ~/.bashrc：')
    console.log('  export PATH="$HOME/.local/bin:$PATH"')
  }

  console.log('\n✅ CLI 安装完成，后续更新 BitPet.app 即可自动同步 CLI。')
}

function cmdInstallApp() {
  const script = path.join(__dirname, 'scripts', 'postinstall.js')
  const child = spawn(process.execPath, [script], { stdio: 'inherit' })
  child.on('exit', (code) => process.exit(code || 0))
  child.on('error', (e) => {
    console.error(`❌ 安装 BitPet.app 失败：${e.message}`)
    process.exit(1)
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

// ── Auto-inject hooks into ~/.claude/settings.json ───────────
// Claude Code passes JSON via stdin for every hook type:
//   UserPromptSubmit → { session_id, prompt }
//   PreToolUse       → { session_id, tool_name, tool_input }
//   PostToolUse      → { session_id, tool_name, tool_input, tool_response }
//   Stop             → { session_id }

function installClaudeHooks() {
  let settings = {}
  try {
    if (fs.existsSync(CLAUDE_SETTINGS)) {
      settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS, 'utf8'))
    }
  } catch {
    console.log('  ⚠️  无法解析 ~/.claude/settings.json，请手动运行：bitpet setup-hooks --tool claude')
    return false
  }

  if (!settings.hooks) settings.hooks = {}

  const added = []
  for (const { hookType, command } of BITPET_HOOK_ENTRIES) {
    if (!settings.hooks[hookType]) settings.hooks[hookType] = []
    const exists = settings.hooks[hookType].some(group =>
      group.hooks?.some(h => h.command?.includes('bitpet-hook'))
    )
    if (!exists) {
      settings.hooks[hookType].push({ matcher: '', hooks: [{ type: 'command', command }] })
      added.push(hookType)
    }
  }

  if (added.length === 0) {
    console.log('✅ Claude Code hooks 已是最新，无需更新')
    return true
  }

  try {
    fs.mkdirSync(path.dirname(CLAUDE_SETTINGS), { recursive: true })
    fs.writeFileSync(CLAUDE_SETTINGS, JSON.stringify(settings, null, 2) + '\n')
    console.log(`✅ 已写入 Claude Code hooks：${added.join(', ')}`)
    console.log(`   文件：${CLAUDE_SETTINGS}`)
    console.log('   ⚡ 重新打开一个 Claude Code 会话即可生效')
    return true
  } catch (e) {
    console.log(`  ⚠️  写入失败：${e.message}`)
    console.log('  请手动运行：bitpet setup-hooks --tool claude')
    return false
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
  const installedApps = [
    '/Applications/BitPet.app',
    path.join(os.homedir(), 'Applications', 'BitPet.app'),
  ]
  const installedApp = installedApps.find(app => fs.existsSync(app))

  let child
  if (installedApp) {
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
    console.error('   请运行：bitpet install-app')
    console.error('   开发环境可运行：cd ' + projectRoot + ' && npm run build')
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
    installClaudeHooks()
    console.log('\n提示：在 Claude Code 中用 /pet <命令> 控制宠物')
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
      await cmdWithDaemon('play', () => console.log('🎮 玩耍成功！心情 +15，精力 -10'))
      break

    case 'status':
      await cmdWithDaemon('status', (data) => {
        if (data) formatStatus(data)
      })
      break

    case 'sleep':
      await cmdWithDaemon('sleep', () => console.log('😴 宠物去睡觉了，喂食可以唤醒它'))
      break

    case 'stop':
      await cmdWithDaemon('stop', () => console.log('👋 BitPet 已关闭'))
      break

    case 'install-cli':
      cmdInstallCli()
      break

    case 'install-app':
      cmdInstallApp()
      break

    case 'hooks':
      installClaudeHooks()
      break

    case 'setup-hooks': {
      const toolFlag = args.indexOf('--tool')
      const tool = toolFlag >= 0 ? args[toolFlag + 1] : args[0]
      cmdSetupHooks(tool || '')
      break
    }

    case '--version':
    case '-v':
      console.log(`bitpet ${require('./package.json').version}`)
      break

    default:
      console.log(`
BitPet CLI — 桌面宠物控制工具

用法：
  bitpet init                         启动宠物（首次使用，自动配置 Claude Code hooks）
  bitpet feed                         喂食（唤醒睡眠中的宠物）
  bitpet play                         玩耍（心情 +15，精力 -10）
  bitpet sleep                        让宠物进入睡眠
  bitpet status                       查看状态
  bitpet stop                         关闭宠物
  bitpet install-app                  下载并安装同版本 BitPet.app
  bitpet install-cli                  从 .app bundle 安装/更新 CLI 符号链接
  bitpet hooks                        重新写入 Claude Code hooks（修复动画不触发问题）
  bitpet setup-hooks --tool <name>    显示 hooks 配置指引（其他工具）
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
