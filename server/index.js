require('dotenv').config()
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const path = require('path')
const router = require('./router/index')
const errorMiddleware = require('./middlewares/error-middleware')
const { initDb } = require('./db')
const listingService = require('./service/listing-service')
const wsHub = require('./ws-hub')
let WebSocketServer = null
try { ({ WebSocketServer } = require('ws')) } catch (_) { console.warn('Пакет ws не встановлено; чат через websocket вимкнено') }

const PORT = process.env.PORT || 5000
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000'
const app = express()

app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser())
app.use(cors({ credentials: true, origin: CLIENT_URL }))
app.use('/uploads', express.static(path.resolve(__dirname, 'uploads')))
app.use('/api', router)
app.use(errorMiddleware)

const start = async () => {
  try {
    await initDb()
    const server = app.listen(PORT, () => console.log(`Сервер запущено на порту: ${PORT}`))
    if (!WebSocketServer) return
    const wss = new WebSocketServer({ server, path: '/ws' })
    const rooms = new Map()
    wss.on('connection', (ws) => {
      wsHub.register(ws)
      ws.roomId = 'buy-general'
      ws.on('message', async (raw) => {
        try {
          const data = JSON.parse(String(raw || '{}'))
          if (data.type === 'join') {
            if (rooms.has(ws.roomId)) rooms.get(ws.roomId).delete(ws)
            ws.roomId = data.roomId || 'buy-general'
            if (!rooms.has(ws.roomId)) rooms.set(ws.roomId, new Set())
            rooms.get(ws.roomId).add(ws)
          }
          if (data.type === 'message') {
            const text = String(data.text || '')
            if (text.length > 400) return
            const now = Date.now()
            ws.chatRateLog = (ws.chatRateLog || []).filter((entry) => now - entry.time < 5 * 60 * 1000)
            const usedChars = ws.chatRateLog.reduce((sum, entry) => sum + entry.chars, 0)
            if (usedChars + text.length > 10000) return
            ws.chatRateLog.push({ time: now, chars: text.length })
            const saved = await listingService.saveChatMessage(data.roomId || ws.roomId, data.nickname || 'Користувач', text, data.senderUserId || null, data.attachmentUrl || '', data.attachmentName || '', data.selectionJson || '')
            const payload = JSON.stringify({ type: 'message', id: saved?.id ? String(saved.id) : '', roomId: data.roomId || ws.roomId, text, nickname: data.nickname || 'Користувач', senderId: data.senderId || '', senderUserId: data.senderUserId || null, senderIsAdmin: !!data.senderIsAdmin, senderIsActivated: !!data.senderIsActivated, attachmentUrl: data.attachmentUrl || '', attachmentName: data.attachmentName || '', selectionJson: data.selectionJson || '', createdAt: saved?.created_at || new Date().toISOString() })
            if (!rooms.has(ws.roomId)) rooms.set(ws.roomId, new Set())
            const set = rooms.get(data.roomId || ws.roomId) || new Set()
            set.forEach((client) => client.readyState === 1 && client.send(payload))
          }
        } catch (_) {}
      })
      ws.on('close', () => { rooms.forEach((set) => set.delete(ws)) })
      if (!rooms.has(ws.roomId)) rooms.set(ws.roomId, new Set())
      rooms.get(ws.roomId).add(ws)

    })
  } catch (e) {
    console.error(e)
    process.exit(1)
  }
}

start()
