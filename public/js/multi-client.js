let localStream, peerConnection, dataChannel, username;
let connectedUsers = [];

const host = window.location.hostname; // Gets the hostname from the current URL
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
const disconnectBtn = document.getElementById('disconnectBtn');
const toggleMicBtn = document.getElementById('toggleMic');
const micIcon = toggleMicBtn.querySelector('i');
const toggleCamBtn = document.getElementById('toggleCam');
const camIcon = toggleCamBtn.querySelector('i');
const screenShareBtn = document.getElementById('screenShareBtn');
const screenShareIcon = screenShareBtn.querySelector('i');

let micEnabled = true;
let camEnabled = true;
let isSharingScreen = false;
let originalVideoTrack;

main.style.display = 'none';

const videoBlocks = new Map(); // Stores userId => videoElement mapping

const servers = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

const videoContainer = document.getElementById('videoContainer');

function addVideoBlock(userId, stream, isScreenShare = false) {
  const blockId = userId + (isScreenShare ? '-screen' : '-video');
  if (videoBlocks.has(blockId)) return; // Prevent duplicate blocks

  const videoElement = document.createElement('video');
  videoElement.id = blockId;
  videoElement.autoplay = true;
  videoElement.playsInline = true;
  videoElement.srcObject = stream;
  videoElement.classList.add('m-2');
  videoElement.style.width = isScreenShare ? '100%' : '48%'; // Adjust width for screen share
  videoElement.style.borderRadius = '10px';
  videoElement.style.objectFit = 'cover';

  videoContainer.appendChild(videoElement);
  videoBlocks.set(blockId, videoElement); // Track the video block
}

function removeVideoBlock(userId, isScreenShare = false) {
  const blockId = userId + (isScreenShare ? '-screen' : '-video');
  const videoElement = videoBlocks.get(blockId);
  if (videoElement) {
    videoElement.remove();
    videoBlocks.delete(blockId); // Remove from the map
  }
}

// WebSocket event handlers
ws.onmessage = (message) => {
  const data = JSON.parse(message.data);
  switch (data.type) {
    case 'userList':
      updateUserList(data.users);
      break;
    case 'userConnected':
      const userId = data.userId;
      const stream = new MediaStream(); // Placeholder, replace with actual stream
      addVideoBlock(userId, stream);
      break;
    case 'userDisconnected':
      removeVideoBlock(data.userId);
      removeVideoBlock(data.userId, true); // Remove screen share block if any
      break;
    case 'screenShareStart':
      if (data.userId !== username) {
        const screenStream = new MediaStream(); // Replace this with the received screen stream
        addVideoBlock(data.userId, screenStream, true);
      }
      break;
    case 'screenShareStop':
      if (data.userId !== username) {
        removeVideoBlock(data.userId, true);
      }
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
    default:
      console.warn('Unknown message type:', data.type);
  }
};

// Update user list
function updateUserList(users) {
  connectedUsers = users.filter((user) => user !== username);
}

// Login functionality
loginBtn.addEventListener('click', async () => {
  username = document.getElementById('username').value.trim();
  if (!username) return alert('Enter your name');
  
  ws.send(JSON.stringify({ type: 'login', name: username }));
  login.remove();
  main.style.display = 'block';
  main.classList.add('d-flex');

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
    addVideoBlock(username, localStream); // Use addVideoBlock for local video
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
    const payload = { sender: username, message };
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

  // Toggle icon class
  micIcon.classList.toggle('bi-mic', micEnabled);
  micIcon.classList.toggle('bi-mic-mute', !micEnabled);
});

// Toggle Camera
toggleCamBtn.addEventListener('click', async () => {
  const videoTrack = localStream.getVideoTracks()[0];

  if (camEnabled) {
    videoTrack.stop();
    localStream.removeTrack(videoTrack);
    camEnabled = false;
  } else {
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
      const newVideoTrack = newStream.getVideoTracks()[0];

      localStream.addTrack(newVideoTrack);
      const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(newVideoTrack);

      camEnabled = true;
    } catch (error) {
      console.error('Error accessing camera:', error);
      alert('Could not access the camera.');
    }
  }

  // Toggle icon class
  camIcon.classList.toggle('bi-camera-video', camEnabled);
  camIcon.classList.toggle('bi-camera-video-off', !camEnabled);
});

// WebRTC Call Handling
function startCall(peerName) {
  peerConnection = new RTCPeerConnection(servers);
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  // Create data channel
  dataChannel = peerConnection.createDataChannel('chat');
  setupDataChannel();

  peerConnection.ontrack = (event) => {
    addVideoBlock(peerName, event.streams[0]);
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

function handleOffer(offer, from) {
  peerConnection = new RTCPeerConnection(servers);
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  peerConnection.ondatachannel = (event) => {
    dataChannel = event.channel;
    setupDataChannel();
  };

  peerConnection.ontrack = (event) => {
    addVideoBlock(from, event.streams[0]);
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
  dataChannel.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    messages.innerHTML += `<p><strong>${payload.sender}:</strong> ${payload.message}</p>`;
  };
}

// Screen Sharing
screenShareBtn.addEventListener('click', () => {
  if (isSharingScreen) {
    stopScreenShare();
  } else {
    startScreenShare();
  }
});

function startScreenShare() {
  navigator.mediaDevices.getDisplayMedia({ video: true })
    .then((screenStream) => {
      originalVideoTrack = localStream.getVideoTracks()[0];
      localStream.removeTrack(originalVideoTrack);
      localStream.addTrack(screenStream.getTracks()[0]);

      isSharingScreen = true;
      screenShareIcon.classList.replace('bi-screen', 'bi-stop-screen');
      ws.send(JSON.stringify({ type: 'screenShareStart', screenStream }));
    })
    .catch(error => {
      alert('Error sharing screen: ' + error);
    });
}

function stopScreenShare() {
  localStream.removeTrack(localStream.getVideoTracks()[0]);
  localStream.addTrack(originalVideoTrack);

  isSharingScreen = false;
  screenShareIcon.classList.replace('bi-stop-screen', 'bi-screen');
  ws.send(JSON.stringify({ type: 'screenShareStop' }));
}
