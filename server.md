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
const express = require('express');
const { PeerServer } = require('peer');
const http = require('http');
const cors = require('cors');
const path = require('path');
const { Server } = require("socket.io");

const app = express();
const port = process.env.PORT || 1444;

app.use(cors());

// Serve static files (like index.html) from the current directory
app.use(express.static(__dirname));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for simplicity
  },
});

// --- Dedicated PeerJS server ---
const peerServer = PeerServer({
  port: 1445,
  path: '/peers',
  allow_discovery: true,
  debug: true,
});

// --- Real Room Logic ---
const rooms = {};

// --- Socket.IO Signaling Logic ---
io.on('connection', (socket) => {
  console.log('a user connected:', socket.id);

  socket.on('join-room', (roomId, peerId) => {
    socket.join(roomId);
    socket.to(roomId).emit('peer-joined', peerId); // Inform others in the room
    
    // Send the list of existing peers to the new user
    const room = io.sockets.adapter.rooms.get(roomId);
    if (room) {
      const peers = Array.from(room).map(id => io.sockets.sockets.get(id).peerId).filter(Boolean);
      socket.emit('room-peers', peers);
    }
    
    // Store peerId on the socket object for later retrieval
    socket.peerId = peerId; 
  });

  socket.on('disconnect', () => {
    console.log('user disconnected:', socket.id);
  });
});


// --- API Endpoints ---
app.get('/api/rooms/:roomId/peers', (req, res) => {
    const { roomId } = req.params;
    const peers = rooms[roomId] ? Array.from(rooms[roomId]) : [];
    res.json(peers);
});

// Serve the app on root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

server.listen(port, () => {
    console.log(`Chat App running at http://localhost:${port}`);
    console.log(`PeerJS endpoint: http://localhost:${port}/peers`);
});
```

## Client Usage

```javascript
// Connect to servers
// Connect to servers
// Port 1444: Main App Server + Socket.IO
const socket = io('http://localhost:1444');

// Port 1445: Dedicated PeerJS Server
const peer = new Peer(undefined, {
  host: 'localhost',
  port: 1445,
  path: '/peers'
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
