const express = require('express');
const { WebSocketServer } = require('ws');
const app = express();
const PORT = 443;

// Serve static files
app.use(express.static('public'));

// Start HTTP Server
const server = app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// WebSocket signaling server
const wss = new WebSocketServer({ server });

let clients = {};



const bodyParser = require('body-parser');



console.log(`WebSocket server started on ws://localhost:${PORT}`);

const connections = {};



app.use(bodyParser.json());
app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(express.json());

app.get('/', (req, res) => {
    res.render("index");
  });

  const PORTUI = process.env.PORTUI || 8000;
app.listen(PORTUI, async () => {
  try {
    // await redisClient.ping(); // Test Redis connection
    console.log(`Server running on portUI ${PORTUI}`);
  } catch (err) {
    console.error('Could not connect to Redis:', err.message);
    process.exit(1);
  }
});


function broadcastUsers() {
    const userList = Object.keys(clients);
    const payload = JSON.stringify({ type: 'userList', users: userList });
    Object.values(clients).forEach((client) => client.send(payload));
  }
  
wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    const data = JSON.parse(message);

    switch (data.type) {
        case 'login':
            clients[data.name] = ws;
            ws.name = data.name;
            broadcastUsers(); // Notify all clients of the updated user list
            break;

      case 'offer':
        if (clients[data.to]) {
          clients[data.to].send(JSON.stringify({ type: 'offer', from: ws.name, offer: data.offer }));
        }
        break;

      case 'answer':
        if (clients[data.to]) {
          clients[data.to].send(JSON.stringify({ type: 'answer', from: ws.name, answer: data.answer }));
        }
        break;

      case 'candidate':
        if (clients[data.to]) {
          clients[data.to].send(JSON.stringify({ type: 'candidate', from: ws.name, candidate: data.candidate }));
        }
        break;

    case 'message':
        if (clients[data.to]) {
            clients[data.to].send(JSON.stringify(data));
        }
        break;

      default:
        break;
    }
  });

  ws.on('close', () => {
    delete clients[ws.name];
    broadcastUsers();
  });
});
