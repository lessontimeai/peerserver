const express = require('express');
const { ExpressPeerServer } = require('peer');
const http = require('http');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 9000;

app.use(cors());

// Serve static files (like index.html) from the current directory
app.use(express.static(__dirname));

const server = http.createServer(app);

// Initialize PeerJS Server
// We use ExpressPeerServer to attach to the existing 'server' instance
// This prevents the "EADDRINUSE" error because we don't try to bind the port twice.
const peerServer = ExpressPeerServer(server, {
    path: '/', // We mount this on '/peers' below, so internal path is root
    proxied: true,
    allow_discovery: true,
    debug: true
});

// Mount the PeerJS middleware on the '/peers' route
app.use('/peers', peerServer);

// --- Real Room Logic ---
const rooms = {};

function addToRoom(roomId, peerId) {
    if (!rooms[roomId]) rooms[roomId] = new Set();
    rooms[roomId].add(peerId);
    console.log(`[Room] ${peerId} joined ${roomId}`);
}

function removeFromRoom(peerId) {
    for (const [roomId, peers] of Object.entries(rooms)) {
        if (peers.has(peerId)) {
            peers.delete(peerId);
            console.log(`[Room] ${peerId} left ${roomId}`);
            if (peers.size === 0) delete rooms[roomId];
        }
    }
}

// Access the internal realm events
peerServer.on('connection', (client) => {
    // Client token is passed via query params during connection
    const roomId = client.token;
    const peerId = client.getId();
    if (roomId) addToRoom(roomId, peerId);
});

peerServer.on('disconnect', (client) => {
    const peerId = client.getId();
    removeFromRoom(peerId);
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