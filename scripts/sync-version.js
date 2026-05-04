#!/usr/bin/env node
'use strict'
// Single source of truth: root package.json version.
// Run before every build to keep cli/package.json and tauri.conf.json in sync.

const fs   = require('fs')
const path = require('path')
const root = path.join(__dirname, '..')

const rootPkg  = JSON.parse(fs.readFileSync(path.join(root, 'package.json')))
const version  = rootPkg.version

const targets = [
  path.join(root, 'cli', 'package.json'),
  path.join(root, 'src-tauri', 'tauri.conf.json'),
]

let changed = false
for (const file of targets) {
  const obj = JSON.parse(fs.readFileSync(file))
  if (obj.version === version) continue
  obj.version = version
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n')
  console.log(`  synced ${path.relative(root, file)}  →  ${version}`)
  changed = true
}

if (!changed) console.log(`  all versions already at ${version}`)
