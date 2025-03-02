// Simple WebSocket Signaling Server
const WebSocket = require('ws');
const port = 8334;
const server = new WebSocket.Server({ port });

// Store connected clients
const clients = new Set();

console.log(`Signaling server is running on ws://localhost:${port}`);

server.on('connection', (socket) => {
  console.log('New client connected');
  clients.add(socket);

  // Handle incoming messages
  socket.on('message', (message) => {
    console.log('Received message:', message);
    // Broadcast the message to all other clients
    clients.forEach((client) => {
      if (client !== socket && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  });

  // Remove disconnected clients
  socket.on('close', () => {
    console.log('Client disconnected');
    clients.delete(socket);
  });

  socket.on('error', (err) => {
    console.error('Socket error:', err);
    clients.delete(socket);
  }); 
});