import type { WebSocket } from 'ws'
import type { AuthContext } from '../middleware/auth'
import { isAdminRole } from '../middleware/auth'

/** Events pushed from the server. Clients never send data over the socket. */
export type ServerEvent =
  | { type: 'message.created'; conversationId: string; message: unknown }
  | { type: 'message.updated'; conversationId: string; message: unknown }
  | { type: 'conversation.read'; conversationId: string; userId: string; lastReadAt: Date }
  | { type: 'listing.changed'; listingId: string; status: string }
  | { type: 'notification.created'; notification: unknown }
  | { type: 'account.suspended' }

interface Client {
  socket: WebSocket
  auth: AuthContext | null
}

const OPEN = 1

/**
 * In-memory registry of open sockets. It lives in one process, so running
 * several API instances would need a shared bus (e.g. Redis pub/sub) behind
 * the same interface.
 */
class RealtimeHub {
  private readonly clients = new Set<Client>()

  add(socket: WebSocket, auth: AuthContext | null) {
    const client: Client = { socket, auth }
    this.clients.add(client)
    socket.on('close', () => this.clients.delete(client))
    socket.on('error', () => this.clients.delete(client))
  }

  private deliver(event: ServerEvent, predicate: (client: Client) => boolean) {
    const data = JSON.stringify(event)
    for (const client of this.clients) {
      if (client.socket.readyState === OPEN && predicate(client)) client.socket.send(data)
    }
  }

  /** Public events (e.g. a listing was sold) go to every visitor, signed in or not. */
  broadcast(event: ServerEvent) {
    this.deliver(event, () => true)
  }

  toUsers(userIds: Iterable<string | null | undefined>, event: ServerEvent, options = { includeStaff: false }) {
    const ids = new Set<string>()
    for (const id of userIds) if (id) ids.add(id)
    this.deliver(event, ({ auth }) => {
      if (!auth) return false
      return ids.has(auth.userId) || (options.includeStaff && isAdminRole(auth.role))
    })
  }

  /** Closes every socket of a user, e.g. right after a ban. */
  disconnectUser(userId: string) {
    for (const client of this.clients) {
      if (client.auth?.userId === userId) client.socket.close(4001, 'Session ended')
    }
  }

  get size() {
    return this.clients.size
  }
}

export const hub = new RealtimeHub()
