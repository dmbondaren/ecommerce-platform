import type { Server } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { logger } from '../lib/logger'
import { resolveAccessToken } from '../middleware/auth'
import { hub } from './hub'

const HEARTBEAT_MS = 30_000

/**
 * Attaches the WebSocket endpoint at /ws. Browsers cannot set headers on a
 * WebSocket handshake, so the short-lived access token travels in the query
 * string. Without a token the socket is a guest and only gets public events;
 * with an invalid token the handshake is rejected.
 */
export function attachWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 })
  const alive = new WeakMap<WebSocket, boolean>()

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname !== '/ws') {
      socket.destroy()
      return
    }
    const token = url.searchParams.get('token')
    const authenticate = token ? resolveAccessToken(token) : Promise.resolve(null)
    authenticate
      .then((auth) => {
        if (token && !auth) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
          socket.destroy()
          return
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
          alive.set(ws, true)
          ws.on('pong', () => alive.set(ws, true))
          hub.add(ws, auth)
        })
      })
      .catch((err: unknown) => {
        logger.error({ err }, 'WebSocket handshake failed')
        socket.destroy()
      })
  })

  // Drop connections that stopped answering pings (closed laptops, lost Wi-Fi).
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.get(ws)) {
        ws.terminate()
        continue
      }
      alive.set(ws, false)
      ws.ping()
    }
  }, HEARTBEAT_MS)

  return {
    close() {
      clearInterval(heartbeat)
      for (const ws of wss.clients) ws.close(1001, 'Server shutting down')
      wss.close()
    },
  }
}
