#!/usr/bin/env node
'use strict'
// Runs automatically after `npm install -g bitpet`.
// Downloads the matching BitPet.app bundle from GitHub Releases and installs it.

const https = require('https')
const http  = require('http')
const fs    = require('fs')
const path  = require('path')
const os    = require('os')
const { spawnSync } = require('child_process')

const REPO    = 'qxbyte/bitpet'
const VERSION = require('../package.json').version
const ALLOW_CLI_ONLY = process.env.BITPET_ALLOW_CLI_ONLY

// Skip in dev/CI environments where the .app isn't needed.
if (process.env.BITPET_SKIP_APP_INSTALL || process.env.CI) process.exit(0)

if (process.platform !== 'darwin') {
  console.log('ℹ️  BitPet app supports macOS only — CLI installed, app skipped.')
  process.exit(0)
}

const releaseArch = 'aarch64'
const releaseBaseUrl = `https://github.com/${REPO}/releases/download/v${VERSION}`
const bundledAppArchive = path.join(__dirname, '..', 'assets', `BitPet_${releaseArch}.app.tar.gz`)
const tmpRoot = path.join(os.tmpdir(), `bitpet-install-${process.pid}`)
const tmpExtract = path.join(tmpRoot, 'extract')
const assets = [
  {
    type: 'tar',
    name: `BitPet_${releaseArch}.app.tar.gz`,
    url: `${releaseBaseUrl}/BitPet_${releaseArch}.app.tar.gz`,
    path: path.join(tmpRoot, `BitPet_${releaseArch}.app.tar.gz`),
  },
  {
    type: 'dmg',
    name: `BitPet_${VERSION}_${releaseArch}.dmg`,
    url: `${releaseBaseUrl}/BitPet_${VERSION}_${releaseArch}.dmg`,
    path: path.join(tmpRoot, `BitPet_${VERSION}_${releaseArch}.dmg`),
  },
]

// ── Helpers ───────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function downloadOnce(url, dest) {
  return new Promise((resolve, reject) => {
    const follow = (u, depth) => {
      if (depth > 8) return reject(new Error('too many redirects'))
      const mod = u.startsWith('https') ? https : http
      const req = mod.get(u, {
        headers: {
          'user-agent': `bitpet-installer/${VERSION}`,
          'accept': 'application/octet-stream',
        },
      }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          res.resume()
          if (!res.headers.location) return reject(new Error(`HTTP ${res.statusCode} without Location`))
          return follow(new URL(res.headers.location, u).toString(), depth + 1)
        }
        if (res.statusCode !== 200) {
          res.resume()
          return reject(new Error(`HTTP ${res.statusCode}`))
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
        file.on('error', (e) => {
          try { fs.unlinkSync(dest) } catch { /* ok */ }
          reject(e)
        })
        res.on('error', reject)
      }).on('error', reject)
      req.setTimeout(180000, () => {
        req.destroy(new Error('download timeout'))
      })
    }
    follow(url, 0)
  })
}

async function download(url, dest) {
  let lastError = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      if (attempt > 1) console.log(`   重试下载（${attempt}/3）...`)
      await downloadOnce(url, dest)
      return
    } catch (e) {
      lastError = e
      try { fs.unlinkSync(dest) } catch { /* ok */ }
      if (attempt < 3) await sleep(1000 * attempt)
    }
  }
  throw lastError
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { stdio: 'pipe', ...opts })
}

function cleanUp() {
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }) } catch { /* ok */ }
}

function failInstall(message, details = []) {
  console.log(message)
  for (const detail of details) console.log(`   ${detail}`)
  if (ALLOW_CLI_ONLY) {
    console.log('   已按 BITPET_ALLOW_CLI_ONLY=1 仅保留 CLI。')
    process.exit(0)
  }
  process.exit(1)
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

function installAppFrom(appSrc) {
  // Stop running instance before replacing the app.
  const cliEntry = path.join(__dirname, '..', 'index.js')
  run(process.execPath, [cliEntry, 'stop'], { stdio: 'ignore' })

  // Copy .app — try /Applications first, fall back to ~/Applications.
  let installDir = null
  const installErrors = []

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

  if (!installDir) {
    failInstall('❌ 无法写入 /Applications 或 ~/Applications', [
      ...installErrors,
      `请修复权限后重试：bitpet install-app`,
      `Release: https://github.com/${REPO}/releases/tag/v${VERSION}`,
    ])
  }

  console.log(`✅ BitPet.app 已安装到 ${installDir}`)
  console.log('   运行 `bitpet init` 启动宠物\n')
}

function findExtractedApp(dir) {
  const stack = [dir]
  while (stack.length > 0) {
    const current = stack.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory() && entry.name === 'BitPet.app') return fullPath
      if (entry.isDirectory()) stack.push(fullPath)
    }
  }
  return null
}

async function installFromTar(asset) {
  fs.mkdirSync(tmpExtract, { recursive: true })
  const res = run('tar', ['-xzf', asset.path, '-C', tmpExtract])
  if (res.status !== 0) {
    throw new Error(res.stderr.toString().trim() || `tar exited ${res.status}`)
  }
  const appSrc = findExtractedApp(tmpExtract)
  if (!appSrc) throw new Error('archive does not contain BitPet.app')
  installAppFrom(appSrc)
}

async function installFromDmg(asset) {
  const mountRes = run('hdiutil', ['attach', asset.path, '-nobrowse', '-mountrandom', os.tmpdir()])
  if (mountRes.status !== 0) {
    throw new Error(mountRes.stderr.toString().trim() || `hdiutil exited ${mountRes.status}`)
  }
  const mountOut = mountRes.stdout.toString().trim()
  const mountPoint = mountOut.split('\n').pop().split('\t').pop().trim()
  try {
    const appSrc = path.join(mountPoint, 'BitPet.app')
    if (!fs.existsSync(appSrc)) {
      const entries = fs.readdirSync(mountPoint).join(', ')
      throw new Error(`DMG 中找不到 BitPet.app，当前内容：${entries}`)
    }
    installAppFrom(appSrc)
  } finally {
    run('hdiutil', ['detach', mountPoint, '-quiet'])
  }
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log(`\n🐾 BitPet v${VERSION} — 正在安装桌面应用`)
  cleanUp()
  fs.mkdirSync(tmpRoot, { recursive: true })

  const errors = []
  if (fs.existsSync(bundledAppArchive)) {
    console.log(`📦 使用 npm 包内置 ${path.basename(bundledAppArchive)}`)
    try {
      await installFromTar({
        type: 'tar',
        name: path.basename(bundledAppArchive),
        path: bundledAppArchive,
      })
      cleanUp()
      return
    } catch (e) {
      errors.push(`${path.basename(bundledAppArchive)}: ${e.message}`)
      console.log(`   内置 app 安装失败：${e.message}`)
    }
  }

  for (const asset of assets) {
    console.log(`⬇️  下载 ${asset.name}`)
    try {
      await download(asset.url, asset.path)
      await sleep(800)
      if (asset.type === 'tar') await installFromTar(asset)
      else await installFromDmg(asset)
      cleanUp()
      return
    } catch (e) {
      errors.push(`${asset.name}: ${e.message}`)
      console.log(`   ${asset.name} 安装失败：${e.message}`)
    }
  }

  cleanUp()
  failInstall('\n❌ 自动安装 BitPet.app 失败', [
    ...errors,
    `请检查网络后重试：bitpet install-app`,
    `Release: https://github.com/${REPO}/releases/tag/v${VERSION}`,
  ])
}

main().catch(e => {
  cleanUp()
  failInstall(`\n❌ 应用安装出错：${e.message}`, [
    '请检查网络和安装目录权限后重试：bitpet install-app',
  ])
})
