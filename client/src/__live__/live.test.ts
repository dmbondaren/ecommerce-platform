const CLIENT_URL = process.env.TEST_CLIENT_URL || process.env.CLIENT_URL || 'http://localhost:3000'

async function fetchWithTimeout(url: string, timeoutMs = 5000) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'text/html' }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Live client is not reachable at ${url}. Start the project with "docker compose up --build" and try again. ` +
      `Original error: ${message}`
    )
  } finally {
    window.clearTimeout(timeout)
  }
}

test('live client: React app is served by the running project', async () => {
  const response = await fetchWithTimeout(CLIENT_URL)

  expect(response.status).toBe(200)

  const html = await response.text()
  expect(html).toMatch(/<div id="root"><\/div>/)
})

export {}
