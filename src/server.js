const http = require('http');
const https = require('https');
const express = require('express');
const cors = require('cors');
const { PeerServer } = require('peer');
const { Server } = require('socket.io');
const config = require('./config');

const app = express();

app.use(cors({ origin: config.corsOrigin, methods: ['GET', 'POST'] }));

// Simple health endpoint for uptime checks
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

const nodeServer = config.ssl
  ? https.createServer(config.ssl, app)
  : http.createServer(app);

const io = new Server(nodeServer, {
  cors: { origin: config.corsOrigin, methods: ['GET', 'POST'] },
});

PeerServer({
  server: nodeServer,
  path: config.peerPath,
  key: config.peerKey,
});

const rooms = new Map();

io.on('connection', (socket) => {
  let currentRoom = null;
  let currentPeerId = null;

  socket.on('join-room', (roomId, peerId) => {
    socket.join(roomId);
    currentRoom = roomId;
    currentPeerId = peerId;

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }

    const roomPeers = rooms.get(roomId);
    const existingPeers = Array.from(roomPeers)
      .filter((p) => p.socketId !== socket.id)
      .map((p) => p.peerId);

    roomPeers.add({ socketId: socket.id, peerId });

    socket.emit('room-peers', existingPeers);
    socket.to(roomId).emit('peer-joined', peerId);
  });

  socket.on('disconnect', () => {
    if (currentRoom && currentPeerId) {
      socket.to(currentRoom).emit('peer-left', currentPeerId);

      const room = rooms.get(currentRoom);
      if (room) {
        room.forEach((p) => {
          if (p.socketId === socket.id) {
            room.delete(p);
          }
        });

        if (room.size === 0) {
          rooms.delete(currentRoom);
        }
      }
    }
  });
});

nodeServer.listen(config.port, config.host, () => {
  const protocol = config.ssl ? 'https' : 'http';
  console.log(
    `Server running on ${protocol}://${config.domain}:${config.port}${config.peerPath}`
  );
});

module.exports = nodeServer;
