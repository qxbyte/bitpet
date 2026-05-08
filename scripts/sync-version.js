#!/usr/bin/env node
'use strict'
// Single source of truth: root package.json version.
// Pass a release version/tag to update the root version first, then sync every
// package/app manifest used by the desktop app and npm CLI package.

const fs   = require('fs')
const path = require('path')
const root = path.join(__dirname, '..')

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n')
}

function normalizeVersion(input) {
  if (!input) return null
  const version = input.trim().replace(/^v/, '')
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid release version: ${input}`)
  }
  return version
}

const rootPkgFile = path.join(root, 'package.json')
const rootPkg = readJson(rootPkgFile)
const requestedVersion = normalizeVersion(process.argv[2])

if (requestedVersion && rootPkg.version !== requestedVersion) {
  rootPkg.version = requestedVersion
  writeJson(rootPkgFile, rootPkg)
  console.log(`  synced package.json  ->  ${requestedVersion}`)
}

const version = requestedVersion || rootPkg.version

const targets = [
  path.join(root, 'cli', 'package.json'),
  path.join(root, 'src-tauri', 'tauri.conf.json'),
]

let changed = Boolean(requestedVersion)
for (const file of targets) {
  const obj = readJson(file)
  if (obj.version === version) continue
  obj.version = version
  writeJson(file, obj)
  console.log(`  synced ${path.relative(root, file)}  ->  ${version}`)
  changed = true
}

const lockFile = path.join(root, 'package-lock.json')
if (fs.existsSync(lockFile)) {
  const lock = readJson(lockFile)
  let lockChanged = false
  if (lock.version !== version) {
    lock.version = version
    lockChanged = true
  }
  if (lock.packages?.[''] && lock.packages[''].version !== version) {
    lock.packages[''].version = version
    lockChanged = true
  }
  if (lockChanged) {
    writeJson(lockFile, lock)
    console.log(`  synced package-lock.json  ->  ${version}`)
    changed = true
  }
}

if (!changed) console.log(`  all versions already at ${version}`)
