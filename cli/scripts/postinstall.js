#!/usr/bin/env node
'use strict'
// Runs automatically after `npm install -g bitpet`.
// Downloads the matching BitPet.app DMG from GitHub Releases and installs it.

const https = require('https')
const http  = require('http')
const fs    = require('fs')
const path  = require('path')
const os    = require('os')
const { spawnSync } = require('child_process')

const REPO    = 'qxbyte/bitpet'
const VERSION = require('../package.json').version

// Skip in dev/CI environments where the .app isn't needed.
if (process.env.BITPET_SKIP_APP_INSTALL || process.env.CI) process.exit(0)

if (process.platform !== 'darwin') {
  console.log('ℹ️  BitPet app supports macOS only — CLI installed, app skipped.')
  process.exit(0)
}

const arch    = process.arch === 'arm64' ? 'aarch64' : 'x64'
const dmgName = `BitPet_${VERSION}_${arch}.dmg`
const dmgUrl  = `https://github.com/${REPO}/releases/download/v${VERSION}/${dmgName}`
const tmpDmg  = path.join(os.tmpdir(), dmgName)

// ── Helpers ───────────────────────────────────────────────────

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const follow = (u, depth) => {
      if (depth > 8) return reject(new Error('too many redirects'))
      const mod = u.startsWith('https') ? https : http
      const req = mod.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          res.resume()
          return follow(new URL(res.headers.location, u).toString(), depth + 1)
        }
        if (res.statusCode !== 200) {
          res.resume()
          return reject(new Error(`HTTP ${res.statusCode} — release not found`))
        }
        const total = parseInt(res.headers['content-length'] || '0', 10)
        let received = 0
        const file = fs.createWriteStream(dest)
        res.on('data', chunk => {
          received += chunk.length
          if (total) {
            const pct = Math.round(received / total * 100)
            process.stdout.write(`\r   ${pct}% (${(received / 1024 / 1024).toFixed(1)} MB)`)
          }
        })
        res.pipe(file)
        file.on('finish', () => { process.stdout.write('\n'); file.close(resolve) })
        file.on('error', reject)
        res.on('error', reject)
      }).on('error', reject)
      req.setTimeout(45000, () => {
        req.destroy(new Error('download timeout'))
      })
    }
    follow(url, 0)
  })
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { stdio: 'pipe', ...opts })
}

function cleanUp() {
  try { fs.unlinkSync(tmpDmg) } catch { /* ok */ }
}

function targetHomeDir() {
  const sudoUser = process.env.SUDO_USER
  if (sudoUser && sudoUser !== 'root') {
    const res = run('dscl', ['.', '-read', `/Users/${sudoUser}`, 'NFSHomeDirectory'])
    const match = res.stdout.toString().match(/NFSHomeDirectory:\s*(.+)/)
    if (match?.[1]) return match[1].trim()
    return path.join('/Users', sudoUser)
  }
  return process.env.HOME || os.homedir()
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log(`\n🐾 BitPet v${VERSION} — 正在安装桌面应用`)

  // Download DMG.
  console.log(`⬇️  下载 ${dmgName}`)
  try {
    cleanUp()
    await download(dmgUrl, tmpDmg)
  } catch (e) {
    cleanUp()
    console.log(`\n⚠️  下载失败：${e.message}`)
    console.log(`   请手动下载：https://github.com/${REPO}/releases/tag/v${VERSION}`)
    process.exit(0)
  }

  // Mount DMG.
  const mountRes = run('hdiutil', ['attach', tmpDmg, '-nobrowse', '-quiet', '-mountrandom', os.tmpdir()])
  if (mountRes.status !== 0) {
    console.log('❌ 挂载 DMG 失败，请手动安装')
    cleanUp(); process.exit(0)
  }
  const mountOut   = mountRes.stdout.toString().trim()
  const mountPoint = mountOut.split('\n').pop().split('\t').pop().trim()

  // Stop running instance before replacing the app.
  const cliEntry = path.join(__dirname, '..', 'index.js')
  run(process.execPath, [cliEntry, 'stop'], { stdio: 'ignore' })
  await new Promise(r => setTimeout(r, 800))

  // Copy .app — try /Applications first, fall back to ~/Applications.
  const appSrc   = path.join(mountPoint, 'BitPet.app')
  let installDir = null
  const installErrors = []

  if (!fs.existsSync(appSrc)) {
    const entries = fs.readdirSync(mountPoint).join(', ')
    console.log(`❌ DMG 中找不到 BitPet.app，当前内容：${entries}`)
    run('hdiutil', ['detach', mountPoint, '-quiet'])
    cleanUp()
    process.exit(0)
  }

  for (const dir of ['/Applications', path.join(targetHomeDir(), 'Applications')]) {
    try {
      fs.mkdirSync(dir, { recursive: true })
      run('rm', ['-rf', path.join(dir, 'BitPet.app')])
      const res = run('cp', ['-R', appSrc, dir])
      if (res.status === 0) {
        // Remove macOS quarantine attribute — unsigned apps show as "damaged" without this.
        run('xattr', ['-cr', path.join(dir, 'BitPet.app')])
        installDir = dir
        break
      }
      installErrors.push(`${dir}: ${res.stderr.toString().trim() || `cp exited ${res.status}`}`)
    } catch (e) {
      installErrors.push(`${dir}: ${e.message}`)
    }
  }

  // Unmount and clean up.
  run('hdiutil', ['detach', mountPoint, '-quiet'])
  cleanUp()

  if (!installDir) {
    console.log('❌ 无法写入 /Applications 或 ~/Applications，请手动安装 DMG')
    for (const err of installErrors) console.log(`   ${err}`)
    console.log(`   https://github.com/${REPO}/releases/tag/v${VERSION}`)
    process.exit(0)
  }

  console.log(`✅ BitPet.app 已安装到 ${installDir}`)
  console.log('   运行 `bitpet init` 启动宠物\n')
}

main().catch(e => {
  // Always exit 0 — a failed app install should not break the npm install.
  console.log(`\n⚠️  应用安装出错：${e.message}`)
  console.log('   CLI 已安装，可手动下载 .app 安装。')
  process.exit(0)
})
