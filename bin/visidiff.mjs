#!/usr/bin/env node
import { spawn } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = resolve(__dirname, '..')
const appUrl = 'http://visidiff.localhost:3000/'
const cliArgs = process.argv.slice(2)

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

async function isRunning() {
  try {
    const response = await fetch(appUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(1500)
    })
    return response.ok
  } catch {
    return false
  }
}

function openBrowser() {
  const child = process.platform === 'win32'
    ? spawn(`start "" "${appUrl}"`, {
        detached: true,
        stdio: 'ignore',
        shell: true
      })
    : spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [appUrl], {
        detached: true,
        stdio: 'ignore',
        shell: false
      })
  child.unref()
}

async function waitForServer(maxAttempts = 120) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (await isRunning()) return true
    await sleep(1000)
  }
  return false
}

async function main() {
  if (await isRunning()) {
    openBrowser()
    return
  }

  const child = process.platform === 'win32'
    ? spawn(`npm run dev -- ${cliArgs.join(' ')}`.trim(), {
        cwd: projectRoot,
        stdio: 'inherit',
        shell: true,
        env: process.env
      })
    : spawn('npm', ['run', 'dev', '--', ...cliArgs], {
        cwd: projectRoot,
        stdio: 'inherit',
        shell: false,
        env: process.env
      })

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code ?? 0)
  })

  child.on('error', (error) => {
    console.error('[visidiff] Failed to start dev server:', error)
    process.exit(1)
  })

  const ready = await waitForServer()
  if (ready) {
    openBrowser()
    return
  }

  console.error(`[visidiff] Timed out waiting for ${appUrl}`)
}

main().catch((error) => {
  console.error('[visidiff] Launcher failed:', error)
  process.exit(1)
})
