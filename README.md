# WebRTC Demo Project

A comprehensive WebRTC implementation demonstrating peer-to-peer video communication with two different approaches: automated WebSocket signaling and manual SDP exchange.

## Setup

### WebSocket Signaling Server Setup

1. Navigate to the WebSocket signaling server directory:

   ```bash
   cd webSocket-signal-server
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the WebSocket server:

   ```bash
   node wsServer.js
   ```

   The server will run on `ws://localhost:8080`

4. Open `index.html` in two different browser tabs or windows
5. Enter the same room name in both instances
6. Allow camera/microphone permissions when prompted

## How It Works

### WebSocket Signaling Approach

1. **Room Creation**: Users join a room by entering a room name
2. **Peer Discovery**: When two users join the same room, the server notifies both to start the connection
3. **SDP Exchange**: Offer and answer are automatically exchanged through the WebSocket server
4. **ICE Candidates**: ICE candidates are shared for NAT traversal
5. **Connection Established**: Direct peer-to-peer video/audio stream begins

### Manual Handshake Approach

1. **Step 1**: Peer 1 creates an SDP offer and copies it
2. **Step 2**: Peer 2 pastes the offer, creates an SDP answer, and copies it
3. **Step 3**: Peer 1 pastes the answer to establish the connection
