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
const fs = require('fs')

const SOCKET = path.join(os.tmpdir(), 'bitpet.sock')
const MAX_DELTA = 500  // truncate hook payloads to 500 chars

// Per-session skip flags: written when /pet command detected, prevents
// thinking/output animations from firing during /pet command execution.
function skipFlagPath(sid) {
  return path.join(os.tmpdir(), `bitpet-skip-${sid.slice(0, 32).replace(/[^a-zA-Z0-9_-]/g, '_')}`)
}
function isSkipped(sid) {
  if (!sid) return false
  try { return fs.existsSync(skipFlagPath(sid)) } catch { return false }
}
function markSkip(sid) {
  if (!sid) return
  try { fs.writeFileSync(skipFlagPath(sid), '1') } catch {}
}
function clearSkip(sid) {
  if (!sid) return
  try { if (fs.existsSync(skipFlagPath(sid))) fs.unlinkSync(skipFlagPath(sid)) } catch {}
}

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
    let session = rest.join(' ').trim().slice(0, 80)
    if (!session) {
      // Claude Code passes JSON via stdin for all hook types.
      // PreToolUse       → { tool_name, tool_input, session_id }
      // UserPromptSubmit → { prompt, session_id }
      const raw = await readStdin()
      try {
        const obj = JSON.parse(raw.trim())
        const sid = obj.session_id || ''
        // UserPromptSubmit has obj.prompt: detect /pet slash command and skip animations.
        if (obj.prompt !== undefined) {
          if (/^\/pet\b/.test(obj.prompt.trim())) {
            markSkip(sid)
            process.exit(0)
          }
        }
        // PreToolUse following a /pet command: session already flagged, skip.
        if (isSkipped(sid)) process.exit(0)
        session = obj.tool_name || (sid ? sid.slice(0, 8) : '') || 'thinking'
      } catch {
        session = 'thinking'
      }
    }
    await send({ type: 'session_start', tool, session })

  } else if (type === 'message') {
    const raw = await readStdin()
    let sid = ''
    try { sid = JSON.parse(raw.trim()).session_id || '' } catch {}
    if (isSkipped(sid)) process.exit(0)
    let delta = rest.join(' ').trim()
    if (!delta) delta = extractDeltaFromHookJson(raw)
    delta = delta.replace(/\s+/g, ' ').trim().slice(0, MAX_DELTA)
    if (delta) await send({ type: 'message', tool, delta })

  } else if (type === 'session-end') {
    const raw = await readStdin()
    let sid = ''
    try { sid = JSON.parse(raw.trim()).session_id || '' } catch {}
    if (isSkipped(sid)) {
      clearSkip(sid)
      process.exit(0)
    }
    await send({ type: 'session_end', tool })
  }

  process.exit(0)
}

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) { resolve(''); return }
    let buf = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (d) => { buf += d; if (buf.length > 4000) resolve(buf) })
    process.stdin.on('end', () => resolve(buf))
    setTimeout(() => resolve(buf), 500)
  })
}

// Extract readable text from the JSON that Claude Code hooks pass via stdin.
function extractDeltaFromHookJson(raw) {
  try {
    const obj = JSON.parse(raw.trim())
    // PostToolUse: { tool_name, tool_input, tool_response: string | object }
    if (obj.tool_response !== undefined) {
      const resp = obj.tool_response
      if (typeof resp === 'string') return resp
      if (typeof resp === 'object') {
        return resp.output || resp.content || resp.result || JSON.stringify(resp)
      }
    }
    // Fallback: stringify the whole object
    return raw
  } catch {
    return raw
  }
}

main().catch(() => process.exit(0))
