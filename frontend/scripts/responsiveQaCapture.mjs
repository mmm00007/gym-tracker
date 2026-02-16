#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const VIEWPORTS = [
  { key: 'phone', width: 360, height: 800 },
  { key: 'tablet', width: 768, height: 1024 },
  { key: 'desktop', width: 1440, height: 900 },
]

const SCREENS = [
  { key: 'home', label: 'Home' },
  { key: 'library', label: 'Library' },
  { key: 'history', label: 'History' },
  { key: 'plans', label: 'Plans' },
  { key: 'analysis', label: 'Analysis' },
]

const BASE_URL = process.env.QA_BASE_URL || 'http://127.0.0.1:4173'
const QA_USERNAME = process.env.QA_USERNAME || ''
const QA_PASSWORD = process.env.QA_PASSWORD || ''

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const artifactRoot = path.join(projectRoot, 'docs', 'qa-artifacts', 'responsive-ui-v2')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function ensureAuthenticated(page) {
  const signInButton = page.getByRole('button', { name: 'Sign In' })
  const authVisible = await signInButton.isVisible().catch(() => false)

  if (!authVisible) return

  if (!QA_USERNAME || !QA_PASSWORD) {
    throw new Error(
      'Authentication is required but QA_USERNAME/QA_PASSWORD were not provided. ' +
      'Set these env vars so the QA harness can sign in before capturing screenshots.',
    )
  }

  await page.getByPlaceholder('Username').fill(QA_USERNAME)
  await page.getByPlaceholder('Password').fill(QA_PASSWORD)
  await signInButton.click()

  await sleep(600)

  const navVisibleAfterSignIn = await page.locator('nav[aria-label="Primary"]').isVisible().catch(() => false)
  if (navVisibleAfterSignIn) return

  const usernameTakenMessage = page.getByText('Wrong username or password')
  const signUpToggle = page.getByRole('button', { name: "Don't have an account? Sign up" })

  if (await usernameTakenMessage.isVisible().catch(() => false)) {
    await signUpToggle.click()
    await page.getByPlaceholder('Username').fill(QA_USERNAME)
    await page.getByPlaceholder('Password').fill(QA_PASSWORD)
    await page.getByRole('button', { name: 'Create Account' }).click()
  }

  await page.locator('nav[aria-label="Primary"]').waitFor({ timeout: 15_000 })
}

async function navigateToScreen(page, screen) {
  const navButton = page.getByRole('button', { name: `Go to ${screen.label}` })
  await navButton.waitFor({ timeout: 15_000 })
  await navButton.click()
  await sleep(450)
}

async function captureViewport(browser, viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } })
  const page = await context.newPage()

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  await ensureAuthenticated(page)
  await page.locator('nav[aria-label="Primary"]').waitFor({ timeout: 15_000 })

  for (const screen of SCREENS) {
    const screenDir = path.join(artifactRoot, screen.key)
    await fs.mkdir(screenDir, { recursive: true })

    await navigateToScreen(page, screen)

    const outputPath = path.join(screenDir, `${viewport.key}.png`)
    await page.screenshot({ path: outputPath, fullPage: true })
    console.log(`[responsive-qa] captured ${screen.key}/${viewport.key}.png`)
  }

  await context.close()
}

async function main() {
  if (!(await pathExists(artifactRoot))) {
    await fs.mkdir(artifactRoot, { recursive: true })
  }

  let chromium
  try {
    ({ chromium } = await import('playwright'))
  } catch {
    throw new Error('Missing dependency: playwright. Install it in frontend with `npm install --save-dev playwright`, then rerun this command.')
  }

  const browser = await chromium.launch({ headless: true })

  try {
    for (const viewport of VIEWPORTS) {
      await captureViewport(browser, viewport)
    }
  } finally {
    await browser.close()
  }

  console.log(`[responsive-qa] done. Artifacts saved under ${path.relative(projectRoot, artifactRoot)}`)
}

main().catch((error) => {
  console.error('[responsive-qa] failed:', error.message)
  process.exitCode = 1
})
