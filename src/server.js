const express = require('express');
const { PeerServer } = require('peer');
const http = require('http');
const https = require('https');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Server } = require("socket.io");
require('dotenv').config();

const app = express();
const port = process.env.PORT || 1444;

app.use(cors());

// Serve static files (like index.html) from the current directory
app.use(express.static(__dirname));

let server;
let sslOptions = {};
let isSSL = false;

// Check for SSL configuration
const sslKeyPath = process.env.SSL_KEY_PATH;
const sslCertPath = process.env.SSL_CERT_PATH;

if (sslKeyPath && sslCertPath) {
  try {
    // Resolve paths relative to cwd or use absolute
    const key = fs.readFileSync(path.resolve(sslKeyPath));
    const cert = fs.readFileSync(path.resolve(sslCertPath));

    sslOptions = { key, cert };
    server = https.createServer(sslOptions, app);
    isSSL = true;
    console.log('SSL configuration found and loaded. Starting in HTTPS mode.');
  } catch (error) {
    console.error('SSL paths provided but failed to load certificates:', error.message);
    console.log('Falling back to HTTP...');
    server = http.createServer(app);
  }
} else {
  console.log('No SSL configuration found. Starting in HTTP mode.');
  server = http.createServer(app);
}

const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for simplicity
  },
});

// --- Dedicated PeerJS server ---
const peerOptions = {
  port: 1445,
  path: '/peers',
  allow_discovery: false,
  debug: true,
};

if (isSSL) {
  peerOptions.ssl = sslOptions;
}

const peerServer = PeerServer(peerOptions);

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

    // Store peerId and roomId on the socket object for later retrieval
    socket.peerId = peerId;
    socket.roomId = roomId;
  });

  socket.on('disconnect', () => {
    console.log('user disconnected:', socket.id);
    
    // Emit room-left event to notify other peers
    if (socket.roomId && socket.peerId) {
      io.to(socket.roomId).emit('room-left', socket.peerId);
    }
  });
});


// --- API Endpoints ---
// Serve the app on root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

server.listen(port, () => {
  const protocol = isSSL ? 'https' : 'http';
  console.log(`Chat App running at ${protocol}://localhost:${port}`);
  console.log(`PeerJS endpoint: ${protocol}://localhost:1445/peers`);
  if (isSSL) {
    console.log('NOTE: Ensure your PeerClient connects using secure: true and correct port/protocol.');
  }
});