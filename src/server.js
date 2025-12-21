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
    // You might want to emit a 'peer-left' event to the room
    // The logic to find which room the peer was in would be needed here
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