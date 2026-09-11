import { createServer } from 'vite'
import puppeteer from 'puppeteer'

const server = await createServer({ server: { host: '127.0.0.1', port: 18719, strictPort: true } })
let browser
try {
  await server.listen()
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.goto('http://127.0.0.1:18719/tests/regressions.html')
  await page.waitForFunction(() => window.regressionResult !== undefined, { timeout: 30000 })
  const result = await page.evaluate(() => window.regressionResult)
  for (const name of result.passed) process.stdout.write(`PASS ${name}\n`)
  if (result.error) throw new Error(result.error)
} finally {
  await browser?.close()
  await server.close()
}
