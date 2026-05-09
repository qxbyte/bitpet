#!/usr/bin/env node
'use strict'
// Single source of truth: root package.json version for local builds.
// Release builds pass a tag/version here and it becomes the source of truth for
// every first-party package/app manifest.

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

function replaceFirstPackageVersion(toml, version) {
  const packageHeader = toml.match(/(^|\n)\[package\]\n/)
  if (!packageHeader) throw new Error('Missing [package] section in Cargo.toml')

  const start = packageHeader.index + packageHeader[0].length
  const rest = toml.slice(start)
  const nextSection = rest.search(/\n\[/)
  const end = nextSection === -1 ? toml.length : start + nextSection
  const before = toml.slice(0, start)
  const packageSection = toml.slice(start, end)
  const after = toml.slice(end)

  if (!/^version = ".+"/m.test(packageSection)) {
    throw new Error('Missing package version in Cargo.toml')
  }

  return before + packageSection.replace(/^version = ".+"/m, `version = "${version}"`) + after
}

const cargoTomlFile = path.join(root, 'src-tauri', 'Cargo.toml')
if (fs.existsSync(cargoTomlFile)) {
  const cargoToml = fs.readFileSync(cargoTomlFile, 'utf8')
  const nextCargoToml = replaceFirstPackageVersion(cargoToml, version)
  if (nextCargoToml !== cargoToml) {
    fs.writeFileSync(cargoTomlFile, nextCargoToml)
    console.log(`  synced src-tauri/Cargo.toml  ->  ${version}`)
    changed = true
  }
}

const cargoLockFile = path.join(root, 'src-tauri', 'Cargo.lock')
if (fs.existsSync(cargoLockFile)) {
  const cargoLock = fs.readFileSync(cargoLockFile, 'utf8')
  const nextCargoLock = cargoLock.replace(
    /(\[\[package\]\]\nname = "bitpet"\nversion = )"[^"]+"/,
    `$1"${version}"`,
  )
  if (nextCargoLock !== cargoLock) {
    fs.writeFileSync(cargoLockFile, nextCargoLock)
    console.log(`  synced src-tauri/Cargo.lock  ->  ${version}`)
    changed = true
  }
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
