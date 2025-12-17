# PeerJS + Socket.IO Room Server

## Quick Setup

```bash
# 1. Create project
mkdir peerjs-server && cd peerjs-server
npm init -y

# 2. Install dependencies
npm install peer express socket.io dotenv cors

# 3. Copy env template
cp .env.example .env

# 4. Create folders for certificates
mkdir ssl
```

### `src/server.js`
```javascript
const http = require('http');
const https = require('https');
const express = require('express');
const cors = require('cors');
const { PeerServer } = require('peer');
const { Server } = require('socket.io');
const config = require('./config');

const app = express();

app.use(cors({ origin: config.corsOrigin, methods: ['GET', 'POST'] }));

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

const nodeServer = config.ssl
  ? https.createServer(config.ssl, app)
  : http.createServer(app);

const io = new Server(nodeServer, {
  cors: { origin: config.corsOrigin, methods: ['GET', 'POST'] }
});

PeerServer({
  server: nodeServer,
  path: config.peerPath,
  key: config.peerKey
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
      .filter(p => p.socketId !== socket.id)
      .map(p => p.peerId);

    roomPeers.add({ socketId: socket.id, peerId });

    socket.emit('room-peers', existingPeers);
    socket.to(roomId).emit('peer-joined', peerId);
  });

  socket.on('disconnect', () => {
    if (currentRoom && currentPeerId) {
      socket.to(currentRoom).emit('peer-left', currentPeerId);

      const room = rooms.get(currentRoom);
      if (room) {
        room.forEach(p => {
          if (p.socketId === socket.id) room.delete(p);
        });
        if (room.size === 0) rooms.delete(currentRoom);
      }
    }
  });
});

nodeServer.listen(config.port, config.host, () => {
  const protocol = config.ssl ? 'https' : 'http';
  console.log(`Server running on ${protocol}://${config.domain}:${config.port}`);
});
```

## Client Usage

```javascript
// Connect to servers
const socket = io('https://lessontime.ai');
const peer = new Peer(undefined, {
  host: 'lessontime.ai',
  port: 1445,
  path: '/peers',
  secure: true
});

const connections = new Map();

// When peer is ready
peer.on('open', (myPeerId) => {
  // Join room
  socket.emit('join-room', 'my-room-id', myPeerId);
});

// Get existing peers in room
socket.on('room-peers', (peerIds) => {
  peerIds.forEach(remotePeerId => {
    const conn = peer.connect(remotePeerId);
    setupConnection(conn);
  });
});

// New peer joined
socket.on('peer-joined', (remotePeerId) => {
  const conn = peer.connect(remotePeerId);
  setupConnection(conn);
});

// Peer left
socket.on('peer-left', (peerId) => {
  connections.get(peerId)?.close();
  connections.delete(peerId);
});

// Handle incoming connections
peer.on('connection', (conn) => {
  setupConnection(conn);
});

function setupConnection(conn) {
  connections.set(conn.peer, conn);
  
  conn.on('data', (data) => {
    console.log('Received:', data);
  });
  
  conn.on('close', () => {
    connections.delete(conn.peer);
  });
}

// Send to all peers in room
function broadcast(message) {
  connections.forEach(conn => {
    if (conn.open) conn.send(message);
  });
}
```

## Run It

```bash
# Copy SSL certificates to ssl/ folder
cp /path/to/privkey.pem ssl/
cp /path/to/fullchain.pem ssl/

# Start server
npm run server
```

That's it! Peers in the same room will automatically connect to each other.
