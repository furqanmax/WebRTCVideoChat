// const ws = new WebSocket('ws://localhost:3000');
let localStream, peerConnection, dataChannel, username;
let connectedUsers = [];

const host = window.location.hostname; // Gets the hostname from the current URL
// const port = '3333'; // Specify your WebSocket server port here

const isLocal = window.location.hostname === 'localhost';
const config = {
  local: {
    wsProtocol: 'ws',
    wsHost: 'localhost',
    wsPort: 3333, // Ensure this matches the server
  },
  production: {
    wsProtocol: 'wss',
    wsHost: window.location.hostname,
    wsPort: 443,
  },
};
const { wsProtocol, wsHost, wsPort } = isLocal ? config.local : config.production;
const ws = new WebSocket(`${wsProtocol}://${wsHost}:${wsPort}`);

// Construct the WebSocket URL
// const ws = new WebSocket(`ws://${host}:${port}`);

// Element references
const login = document.getElementById('login');
const main = document.getElementById('main');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const loginBtn = document.getElementById('loginBtn');
const startCallBtn = document.getElementById('startCallBtn');
const peerNameInput = document.getElementById('peerName');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const messages = document.getElementById('messages');
const toggleMicBtn = document.getElementById('toggleMic');
const toggleCamBtn = document.getElementById('toggleCam');

let micEnabled = true;
let camEnabled = true;

const servers = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// Login functionality
loginBtn.addEventListener('click', async () => {
  username = document.getElementById('username').value.trim();
  if (!username) return alert('Enter your name');
  
  ws.send(JSON.stringify({ type: 'login', name: username })); // Notify server of login
  login.remove(); // Hide login screen
  main.hidden = false; // Show main video section

  // Access user media
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
    localVideo.setAttribute('playsinline', 'true');
    localVideo.srcObject = localStream;
    localVideo.play(); // Ensure the video plays automatically
  } catch (error) {
    alert('Could not access camera or microphone.');
    console.error('Media access error:', error);
  }
});

// Start Call
startCallBtn.addEventListener('click', () => {
  const peerName = peerNameInput.value.trim();
  if (!peerName) return alert('Enter a peer name');
  startCall(peerName);
});

// Send message
sendBtn.addEventListener('click', () => {
  const message = messageInput.value;
  if (dataChannel && dataChannel.readyState === 'open') {
    const payload = { sender: username, message }; // Include sender's name in the payload
    dataChannel.send(JSON.stringify(payload));
    messages.innerHTML += `<p><strong>${username}:</strong> ${message}</p>`;
    messageInput.value = '';
  } else {
    alert('Data channel is not open.');
  }
});


// Mute/Unmute Mic
toggleMicBtn.addEventListener('click', () => {
  micEnabled = !micEnabled;
  localStream.getAudioTracks()[0].enabled = micEnabled;
  toggleMicBtn.textContent = micEnabled ? 'Mute Mic' : 'Unmute Mic';
});

// Toggle Camera
toggleCamBtn.addEventListener('click', () => {
  camEnabled = !camEnabled;
  localStream.getVideoTracks()[0].enabled = camEnabled;
  toggleCamBtn.textContent = camEnabled ? 'Turn Camera Off' : 'Turn Camera On';
});

// WebSocket event handlers
ws.onmessage = (message) => {
  const data = JSON.parse(message.data);
  switch (data.type) {
    case 'userList':
      updateUserList(data.users);
      break;
    case 'offer':
      handleOffer(data.offer, data.from);
      break;
    case 'answer':
      peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
      break;
    case 'candidate':
      peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      break;
  }
};

// Update user list
function updateUserList(users) {
  connectedUsers = users.filter((user) => user !== username);
}

// Start Call
function startCall(peerName) {
  peerConnection = new RTCPeerConnection(servers);
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  dataChannel = peerConnection.createDataChannel('chat');
  setupDataChannel();

  peerConnection.ontrack = (event) => {
    remoteVideo.setAttribute('playsinline', 'true');
    remoteVideo.srcObject = event.streams[0];
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(JSON.stringify({ type: 'candidate', to: peerName, candidate: event.candidate }));
    }
  };

  peerConnection.createOffer().then(offer => {
    ws.send(JSON.stringify({ type: 'offer', to: peerName, offer }));
    peerConnection.setLocalDescription(offer);
  });
}

// Handle offer
function handleOffer(offer, from) {
  peerConnection = new RTCPeerConnection(servers);
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  peerConnection.ondatachannel = (event) => {
    dataChannel = event.channel;
    setupDataChannel();
  };

  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(JSON.stringify({ type: 'candidate', to: from, candidate: event.candidate }));
    }
  };

  peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  peerConnection.createAnswer().then(answer => {
    ws.send(JSON.stringify({ type: 'answer', to: from, answer }));
    peerConnection.setLocalDescription(answer);
  });
}

// Setup data channel
function setupDataChannel() {
  dataChannel.onopen = () => console.log('Data channel opened');
  dataChannel.onclose = () => console.log('Data channel closed');
  dataChannel.onmessage = (event) => {
    const { sender, message } = JSON.parse(event.data); // Parse the sender and message
    messages.innerHTML += `<p><strong>${sender}:</strong> ${message}</p>`;
  };
  
}
