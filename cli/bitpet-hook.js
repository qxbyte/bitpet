#!/usr/bin/env node
'use strict'
/**
 * bitpet-hook — bridge between CLI tool hooks and BitPet daemon.
 *
 * Usage:
 *   bitpet-hook session-start <tool> <session-name>
 *   bitpet-hook message <tool> <text>
 *   bitpet-hook session-end <tool>
 */

const net = require('net')
const os = require('os')
const path = require('path')

const SOCKET = path.join(os.tmpdir(), 'bitpet.sock')
const MAX_DELTA = 500  // truncate hook payloads to 500 chars

function send(msg) {
  return new Promise((resolve) => {
    const client = net.createConnection(SOCKET, () => {
      client.write(JSON.stringify(msg) + '\n')
      client.end()
      resolve()
    })
    client.on('error', () => resolve())  // silent fail — pet not running
    client.setTimeout(800, () => { client.destroy(); resolve() })
  })
}

async function main() {
  const [, , type, tool, ...rest] = process.argv

  if (!type || !tool) process.exit(0)

  if (type === 'session-start') {
    const session = rest.join(' ').slice(0, 80) || 'unknown'
    await send({ type: 'session_start', tool, session })

  } else if (type === 'message') {
    let delta = rest.join(' ')
    if (!delta) {
      // Read from stdin if no arg provided
      delta = await readStdin()
    }
    delta = delta.replace(/\s+/g, ' ').trim().slice(0, MAX_DELTA)
    if (delta) await send({ type: 'message', tool, delta })

  } else if (type === 'session-end') {
    await send({ type: 'session_end', tool })
  }

  process.exit(0)
}

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) { resolve(''); return }
    let buf = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (d) => { buf += d; if (buf.length > 1000) resolve(buf) })
    process.stdin.on('end', () => resolve(buf))
    setTimeout(() => resolve(buf), 500)
  })
}

main().catch(() => process.exit(0))
