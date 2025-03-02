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

const videoBlocks = new Map(); // Stores userId => videoElement mapping


const disconnectBtn = document.getElementById('disconnectBtn');


const toggleMicBtn = document.getElementById('toggleMic');
const micIcon = toggleMicBtn.querySelector('i');
const toggleCamBtn = document.getElementById('toggleCam');
const camIcon = toggleCamBtn.querySelector('i');
const screenShareBtn = document.getElementById('screenShareBtn');
const screenShareIcon = screenShareBtn.querySelector('i');


let micEnabled = true;
let camEnabled = true;
main.style.display = 'none';


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


// Login functionality
loginBtn.addEventListener('click', async () => {
  username = document.getElementById('username').value.trim();
  if (!username) return alert('Enter your name');
  
  ws.send(JSON.stringify({ type: 'login', name: username }));
  login.remove();
  // main.hidden = false;
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
    const payload = { sender: username, message }; // Include sender's name in the payload
    dataChannel.send(JSON.stringify(payload));
    messages.innerHTML += `<p><strong>${username}:</strong> ${message}</p>`;
    messageInput.value = '';
  } else {
    alert('Data channel is not open.');
  }
});


// // Mute/Unmute Mic
// toggleMicBtn.addEventListener('click', () => {
//   micEnabled = !micEnabled;
//   localStream.getAudioTracks()[0].enabled = micEnabled;
//   toggleMicBtn.textContent = micEnabled ? 'Mute Mic' : 'Unmute Mic';
// });

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
    // **Turn OFF Camera**
    videoTrack.stop(); // Stops the camera completely
    localStream.removeTrack(videoTrack); // Remove the track from the stream
    camEnabled = false;
  } else {
    try {
      // **Turn ON Camera**
      const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      const newVideoTrack = newStream.getVideoTracks()[0];

      // Replace the old track with the new one
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


// // Toggle Camera
// toggleCamBtn.addEventListener('click', () => {
//   camEnabled = !camEnabled;
//   localStream.getVideoTracks()[0].enabled = camEnabled;
//   toggleCamBtn.textContent = camEnabled ? 'Turn Camera Off' : 'Turn Camera On';
// });

// WebSocket event handlers
ws.onmessage = (message) => {
  const data = JSON.parse(message.data);
  switch (data.type) {
    case 'userList':
      updateUserList(data.users);
      break;
    case 'userConnected':
      // Create a video block for the newly connected user
      const userId = data.userId;
      const stream = new MediaStream(); // Placeholder, replace with the actual stream
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

// Start Call
function startCall(peerName) {
  peerConnection = new RTCPeerConnection(servers);
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  // Create data channel
  dataChannel = peerConnection.createDataChannel('chat');
  setupDataChannel();

  // Handle tracks from the remote peer
  peerConnection.ontrack = (event) => {
    addVideoBlock(peerName, event.streams[0]); // Dynamically add a video block for the remote peer
  };

  // Handle ICE candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(JSON.stringify({ type: 'candidate', to: peerName, candidate: event.candidate }));
    }
  };

  // Create and send the offer
  peerConnection.createOffer().then(offer => {
    ws.send(JSON.stringify({ type: 'offer', to: peerName, offer })); // Send offer to the peer
    peerConnection.setLocalDescription(offer);
  });
}

// Handle Offer
function handleOffer(offer, from) {
  peerConnection = new RTCPeerConnection(servers);
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  // Set up the data channel when it's opened by the remote peer
  peerConnection.ondatachannel = (event) => {
    dataChannel = event.channel;
    setupDataChannel();
  };

  // Handle tracks from the remote peer
  peerConnection.ontrack = (event) => {
    addVideoBlock(from, event.streams[0]); // Dynamically add a video block for the remote peer
  };

  // Handle ICE candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(JSON.stringify({ type: 'candidate', to: from, candidate: event.candidate }));
    }
  };

  // Set the remote description and create an answer
  peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  peerConnection.createAnswer().then(answer => {
    ws.send(JSON.stringify({ type: 'answer', to: from, answer })); // Send answer to the peer
    peerConnection.setLocalDescription(answer);
  });
}


// Handle Offer
function handleOffer(offer, from) {
  peerConnection = new RTCPeerConnection(servers);
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  // Set up the data channel when it's opened by the remote peer
  peerConnection.ondatachannel = (event) => {
    dataChannel = event.channel;
    setupDataChannel();
  };

  // Handle tracks from the remote peer
  peerConnection.ontrack = (event) => {
    addVideoBlock(from, event.streams[0]); // Dynamically add a video block for the remote peer
  };

  // Handle ICE candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(JSON.stringify({ type: 'candidate', to: from, candidate: event.candidate }));
    }
  };

  // Set the remote description and create an answer
  peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  peerConnection.createAnswer().then(answer => {
    ws.send(JSON.stringify({ type: 'answer', to: from, answer })); // Send answer to the peer
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


// Disconnect Button Functionality
disconnectBtn.addEventListener('click', () => {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
  }
  videoBlocks.forEach((_, blockId) => removeVideoBlock(blockId));
  ws.close();
  location.reload(); // Reload the page to reset to the login state
});


// Ensure cleanup on page reload or exit
window.addEventListener('beforeunload', () => {
  if (peerConnection) peerConnection.close();
  if (localStream) localStream.getTracks().forEach((track) => track.stop());
});


let isSharingScreen = false;
let originalVideoTrack;

// Toggle Screen Sharing
screenShareBtn.addEventListener('click', async () => {
  screenShareBtn.disabled = true; // Disable the button while processing

  if (isSharingScreen) {
    stopScreenSharing();
  } else {
    await startScreenSharing();
  }

  screenShareBtn.disabled = false; // Re-enable the button after action is completed
});

async function startScreenSharing() {
  try {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const screenTrack = screenStream.getVideoTracks()[0];

    // Replace the local video track
    const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
    originalVideoTrack = sender.track;
    sender.replaceTrack(screenTrack);

    addVideoBlock(username, screenStream, true); // Add screen share block for the local user

    ws.send(JSON.stringify({ type: 'screenShareStart', userId: username })); // Notify other users

    screenTrack.onended = stopScreenSharing;

    isSharingScreen = true;
    screenShareIcon.classList.replace('bi-display', 'bi-display-fill');
    screenShareBtn.title = 'Stop Sharing';
    // screenShareBtn.textContent = 'Stop Sharing';
  } catch (error) {
    console.error('Screen sharing failed:', error);
  }
}


function stopScreenSharing() {
  if (!originalVideoTrack) return;

  // Replace the screen track with the original track
  const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
  sender.replaceTrack(originalVideoTrack);

  removeVideoBlock(username, true); // Remove the screen sharing block for the local user

  ws.send(JSON.stringify({ type: 'screenShareStop', userId: username })); // Notify other users

  isSharingScreen = false;

  screenShareIcon.classList.replace('bi-display-fill', 'bi-display'); // Restore icon
  screenShareBtn.title = 'Share Screen';

  screenShareBtn.disabled = false;
  // screenShareBtn.textContent = 'Share Screen';
}



document.addEventListener('DOMContentLoaded', () => {
    // Mic button toggle functionality
  toggleMic.addEventListener('click', () => {
    toggleMic.classList.toggle('active');
    const micIcon = toggleMic.querySelector('i');
    if (toggleMic.classList.contains('active')) {
      micIcon.classList.replace('bi-mic', 'bi-mic-mute');
    } else {
      micIcon.classList.replace('bi-mic-mute', 'bi-mic');
    }
  });

  // Camera button toggle functionality
  toggleCam.addEventListener('click', () => {
    toggleCam.classList.toggle('active');
    const camIcon = toggleCam.querySelector('i');
    if (toggleCam.classList.contains('active')) {
      camIcon.classList.replace('bi-camera-video', 'bi-camera-video-off');
    } else {
      camIcon.classList.replace('bi-camera-video-off', 'bi-camera-video');
    }
  });

  // Screen Share button (dummy functionality for now)
  screenShareBtn.addEventListener('click', () => {
    screenShareBtn.classList.toggle('active');
  });

  // Disconnect button functionality (dummy functionality for now)
  disconnectBtn.addEventListener('click', () => {
    alert('Disconnecting...');
  });
});