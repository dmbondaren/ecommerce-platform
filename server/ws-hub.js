const clients = new Set()

function register(ws) {
  clients.add(ws)
  ws.on('close', () => clients.delete(ws))
}

function broadcast(payload) {
  const data = JSON.stringify(payload)
  clients.forEach((client) => {
    if (client.readyState === 1) client.send(data)
  })
}

module.exports = {
  register,
  broadcast
}
