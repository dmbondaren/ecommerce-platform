const test = require('node:test')
const assert = require('node:assert/strict')

const API_URL = process.env.TEST_API_URL || process.env.REACT_APP_API_URL || 'http://localhost:5000/api'

async function fetchWithTimeout(url, timeoutMs = 5000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    })
  } catch (error) {
    throw new Error(
      `Live API is not reachable at ${url}. Start the project with "docker compose up --build" and try again. ` +
      `Original error: ${error.message}`
    )
  } finally {
    clearTimeout(timeout)
  }
}

test('live API: /api/listings responds from the running project', async () => {
  const response = await fetchWithTimeout(`${API_URL}/listings`)

  assert.equal(response.status, 200, `Expected 200 from ${API_URL}/listings, got ${response.status}`)

  const body = await response.json()
  assert.ok(Array.isArray(body), 'Expected /api/listings to return a JSON array')
})
