class PeerClient {
  constructor(serverUrl, peerPath = '/peers', peerKey = 'peerjs', peerServerUrl = null) {
    this.serverUrl = serverUrl;
    this.peerServerUrl = peerServerUrl || serverUrl;
    this.peerPath = peerPath;
    this.peerKey = peerKey;

    this.socket = null;
    this.peer = null;
    this.myPeerId = null;
    this.connections = {}; // Store PeerJS data connections

    // Callbacks for UI updates
    this.onPeerListUpdate = null;
    this.onChatMessage = null;
    this.onStatusChange = null;
  }

  /**
   * Connects to PeerJS and Socket.io
   */
  async initialize(roomId) {
    this.updateStatus("Connecting to Peer server...");

    // 1. Initialize PeerJS (to get a unique ID)
    const peerUrl = new URL(this.peerServerUrl);
    const peerPort = peerUrl.port
      ? Number(peerUrl.port)
      : (peerUrl.protocol === 'https:' ? 443 : 80);
    this.peer = new Peer(undefined, {
      host: peerUrl.hostname,
      port: peerPort,
      path: this.peerPath,
      key: this.peerKey,
      secure: peerUrl.protocol === 'https:',
      debug: 1 // Errors only
    });

    return new Promise((resolve, reject) => {
      this.peer.on('open', (id) => {
        this.myPeerId = id;
        this.updateStatus(`Connected as ${id}`);

        // 2. Initialize Socket.io signaling
        this.socket = io(this.serverUrl, { path: '/rooms' });
        this.setupSocketEvents(roomId);
        resolve(id);
      });

      this.peer.on('error', (err) => {
        this.updateStatus(`PeerJS Error: ${err.type}`);
        reject(err);
      });
    });
  }

  setupSocketEvents(roomId) {
    // Join the specific room
    this.socket.emit('join-room', roomId, this.myPeerId);

    // Update list when server sends existing peers
    this.socket.on('room-peers', (peerIds) => {
      // Connect to all existing peers in the room
      peerIds.forEach(peerId => this.connectToNewPeer(peerId));
      if (this.onPeerListUpdate) this.onPeerListUpdate(peerIds);
    });

    // Handle single new peer joining
    this.socket.on('peer-joined', (newPeerId) => {
      console.log(`Peer ${newPeerId} joined.`);
      this.connectToNewPeer(newPeerId);
      // The server will usually broadcast a new list or you can just add to UI
      if (this.onPeerListUpdate) this.onPeerListUpdate(Object.keys(this.connections));
    });

    // Handle incoming peer connections
    this.peer.on('connection', (conn) => {
      console.log('Incoming peer connection:', conn.peer);
      this.setupDataChannelEvents(conn);
      this.handleConnection(conn);
    });

  }

  // New method to connect to a peer and set up data channel
  connectToNewPeer(peerId) {
    if (this.connections[peerId]) return; // Prevent duplicate connections
    const conn = this.peer.connect(peerId, { reliable: true });
    this.connections[peerId] = conn;
    console.log('Attempting to connect to peer:', peerId);
    this.handleConnection(conn);
  }

  // New method to set up data channel event listeners
  handleConnection(conn) {
    this.connections[conn.peer] = conn;
    this.setupDataChannelEvents(conn);

    conn.on('open', () => {
      console.log('Connected to peer:', conn.peer);
    });

    conn.on('error', (err) => {
      console.error('Peer connection error:', err);
    });

    conn.on('close', () => {
      console.log('Peer connection closed:', conn.peer);
      delete this.connections[conn.peer];
    });
  }

  // New method to set up data channel event listeners
  setupDataChannelEvents(conn) {
    conn.on('data', (data) => {
      this.handleNewMessage(data);
    });
    conn.on('error', (err) => {
      console.error('Peer connection error:', err);
    });
  }

  handleNewMessage(data) {
    // Assuming data is a chat message
    if (this.onChatMessage) this.onChatMessage(data);
  }


  sendMessage(message, metadata = {}) {
    // Send message to all connected peers via data channels
    const payload = {
      ...metadata,
      body: message,
      timestamp: new Date().toISOString()
    };

    for (const peerId in this.connections) {
      const conn = this.connections[peerId];
      if (conn.open) {
        conn.send(payload);
      } else {
        console.warn(`Connection to peer ${peerId} is not open, cannot send message.`);
      }
    }

    // Also display the message locally
    this.handleNewMessage({ ...payload, isLocal: true });
  }

  disconnect() {
    this.updateStatus("Disconnecting...");
    if (this.socket) {
      this.socket.disconnect();
    }
    if (this.peer) {
      this.peer.destroy();
    }
    this.connections = {};
    this.updateStatus("Disconnected");
    console.log("Disconnected from all services.");
  }

  updateStatus(msg) {
    if (this.onStatusChange) this.onStatusChange(msg);
  }
}
