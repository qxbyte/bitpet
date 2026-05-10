'use strict'

const net = require('net')
const os = require('os')
const path = require('path')

function ipcPath() {
  if (process.platform === 'win32') return '\\\\.\\pipe\\bitpet'
  return path.join(os.tmpdir(), 'bitpet.sock')
}

function sendMessage(message, options = {}) {
  const timeoutMs = options.timeoutMs ?? 3000
  const expectResponse = options.expectResponse ?? false

  return new Promise((resolve, reject) => {
    const client = net.createConnection({ path: ipcPath() }, () => {
      client.write(JSON.stringify(message) + '\n')
      if (!expectResponse) {
        client.end()
        resolve()
      }
    })

    let buf = ''
    client.on('data', (d) => {
      if (!expectResponse) return
      buf += d.toString()
      const line = buf.split('\n').find(l => l.trim())
      if (line) {
        client.destroy()
        try { resolve(JSON.parse(line.trim())) }
        catch { resolve({ ok: true }) }
      }
    })
    client.on('error', (e) => {
      if (expectResponse) reject(e)
      else resolve()
    })
    client.setTimeout(timeoutMs, () => {
      client.destroy()
      if (expectResponse) reject(new Error('timeout'))
      else resolve()
    })
  })
}

function isDaemonRunning(timeoutMs = 500) {
  return new Promise((resolve) => {
    const client = net.createConnection({ path: ipcPath() }, () => {
      client.destroy()
      resolve(true)
    })
    client.on('error', () => resolve(false))
    client.setTimeout(timeoutMs, () => { client.destroy(); resolve(false) })
  })
}

module.exports = {
  ipcPath,
  sendMessage,
  isDaemonRunning,
}
