class PeerClient {
  constructor(serverUrl, peerPath = '/peers', peerKey = 'peerjs') {
    this.serverUrl = serverUrl;
    this.peerPath = peerPath;
    this.peerKey = peerKey;

    this.socket = null;
    this.peer = null;
    this.myPeerId = null;

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
    this.peer = new Peer(undefined, {
      host: 'localhost', // Ensure this matches your server host
      port: 1445,
      path: this.peerPath,
      key: this.peerKey,
      debug: 1 // Errors only
    });

    return new Promise((resolve, reject) => {
      this.peer.on('open', (id) => {
        this.myPeerId = id;
        this.updateStatus(`Connected as ${id}`);

        // 2. Initialize Socket.io signaling
        this.socket = io(this.serverUrl);
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
      if (this.onPeerListUpdate) this.onPeerListUpdate(peerIds);
    });

    // Handle single new peer joining
    this.socket.on('peer-joined', (newPeerId) => {
      console.log(`Peer ${newPeerId} joined.`);
      // The server will usually broadcast a new list or you can just add to UI
    });

    // Listen for incoming chat messages
    this.socket.on('receive-chat', (data) => {
      if (this.onChatMessage) this.onChatMessage(data);
    });
  }

  sendMessage(message) {
    if (this.socket) {
      this.socket.emit('send-chat', message);
    }
  }

  updateStatus(msg) {
    if (this.onStatusChange) this.onStatusChange(msg);
  }
}