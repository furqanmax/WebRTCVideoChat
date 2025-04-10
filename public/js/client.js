// WebSocket configuration
let localStream, peerConnection, dataChannel, username;
let connectedUsers = [];

const host = window.location.hostname; // Gets the hostname from the current URL
const isLocal = window.location.hostname === "localhost";
const config = {
  local: {
    wsProtocol: "ws",
    wsHost: "localhost",
    wsPort: 3333, // Ensure this matches the server
  },
  production: {
    wsProtocol: "wss",
    wsHost: window.location.hostname,
    wsPort: 443,
  },
};
const { wsProtocol, wsHost, wsPort } = isLocal
  ? config.local
  : config.production;
const ws = new WebSocket(`${wsProtocol}://${wsHost}:${wsPort}`);

// Element references
const login = document.getElementById("login");
const main = document.getElementById("main");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const loginBtn = document.getElementById("loginBtn");
const startCallBtn = document.getElementById("startCallBtn");
const peerNameInput = document.getElementById("peerName");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const messages = document.getElementById("messages");
const disconnectBtn = document.getElementById("disconnectBtn");
const toggleMicBtn = document.getElementById("toggleMic");
const micIcon = toggleMicBtn.querySelector("i");
const toggleCamBtn = document.getElementById("toggleCam");
const camIcon = toggleCamBtn.querySelector("i");
const screenShareBtn = document.getElementById("screenShareBtn");
const screenShareIcon = screenShareBtn.querySelector("i");

const videoBlocks = new Map(); // Stores userId => videoElement mapping
const videoContainer = document.getElementById("videoContainer");

let micEnabled = true;
let camEnabled = true;
let isSharingScreen = false;
let originalVideoTrack;

main.style.display = "none";

const servers = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

// Add video block with local audio muted
function addVideoBlock(userId, stream, isScreenShare = false) {
  const blockId = userId + (isScreenShare ? "-screen" : "-video");

  if (videoBlocks.has(blockId)) return; // Prevent duplicate blocks

  const videoElement = document.createElement("video");
  videoElement.id = blockId;
  videoElement.autoplay = true;
  videoElement.playsInline = true;
  videoElement.srcObject = stream;
  videoElement.classList.add("m-2");
  videoElement.style.width = isScreenShare ? "100%" : "48%"; // Adjust width for screen share
  videoElement.style.borderRadius = "10px";
  videoElement.style.objectFit = "cover";

  // Mute the audio for the local user only (prevents feedback)
  if (userId === username && !isScreenShare) {
    videoElement.muted = true;
  }

  videoContainer.appendChild(videoElement);
  videoBlocks.set(blockId, videoElement); // Track the video block
}

// Remove video block
function removeVideoBlock(userId, isScreenShare = false) {
  const blockId = userId + (isScreenShare ? "-screen" : "-video");
  const videoElement = videoBlocks.get(blockId);
  if (videoElement) {
    videoElement.remove();
    videoBlocks.delete(blockId); // Remove from the map
  }
}

// Login functionality
loginBtn.addEventListener("click", async () => {
  username = document.getElementById("username").value.trim();
  if (!username) return alert("Enter your name");

  ws.send(JSON.stringify({ type: "login", name: username }));
  login.remove();
  main.style.display = "block";
  main.classList.add("d-flex");

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: true,
    });
    addVideoBlock(username, localStream); // Local video block (muted locally)
  } catch (error) {
    alert("Could not access camera or microphone.");
    console.error("Media access error:", error);
  }
});

// Start Call
startCallBtn.addEventListener("click", () => {
  const peerName = peerNameInput.value.trim();
  if (!peerName) return alert("Enter a peer name");
  startCall(peerName);
});

// Send message
sendBtn.addEventListener("click", () => {
  const message = messageInput.value;
  if (dataChannel && dataChannel.readyState === "open") {
    const payload = { sender: username, message };
    dataChannel.send(JSON.stringify(payload));
    messages.innerHTML += `<p><strong>${username}:</strong> ${message}</p>`;
    messageInput.value = "";
  } else {
    alert("Data channel is not open.");
  }
});

// Toggle Mic
toggleMicBtn.addEventListener("click", () => {
  micEnabled = !micEnabled;
  localStream.getAudioTracks()[0].enabled = micEnabled;
  micIcon.classList.toggle("bi-mic", micEnabled);
  micIcon.classList.toggle("bi-mic-mute", !micEnabled);
});

// Toggle Camera
toggleCamBtn.addEventListener("click", async () => {
  const videoTrack = localStream.getVideoTracks()[0];

  if (camEnabled) {
    videoTrack.stop();
    localStream.removeTrack(videoTrack);
    camEnabled = false;
  } else {
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
      });
      const newVideoTrack = newStream.getVideoTracks()[0];
      localStream.addTrack(newVideoTrack);
      const sender = peerConnection
        ?.getSenders()
        .find((s) => s.track?.kind === "video");
      if (sender) await sender.replaceTrack(newVideoTrack);
      camEnabled = true;
    } catch (error) {
      console.error("Error accessing camera:", error);
      alert("Could not access the camera.");
    }
  }
  camIcon.classList.toggle("bi-camera-video", camEnabled);
  camIcon.classList.toggle("bi-camera-video-off", !camEnabled);
});

// WebSocket event handlers
ws.onmessage = (message) => {
  const data = JSON.parse(message.data);
  switch (data.type) {
    case "userList":
      updateUserList(data.users);
      break;
    case "userConnected":
      const userId = data.userId;
      const stream = new MediaStream();
      addVideoBlock(userId, stream);
      break;
    case "userDisconnected":
      removeVideoBlock(data.userId);
      removeVideoBlock(data.userId, true);
      break;
    case "screenShareStart":
      if (data.userId !== username) {
        const screenStream = new MediaStream();
        addVideoBlock(data.userId, screenStream, true);
      }
      break;
    case "screenShareStop":
      if (data.userId !== username) {
        removeVideoBlock(data.userId, true);
      }
      break;
    case "offer":
      handleOffer(data.offer, data.from);
      break;
    case "answer":
      peerConnection.setRemoteDescription(
        new RTCSessionDescription(data.answer)
      );
      break;
    case "candidate":
      peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      break;
    default:
      console.warn("Unknown message type:", data.type);
  }
};

// Update user list
function updateUserList(users) {
  connectedUsers = users.filter((user) => user !== username);
}

// Start Call
function startCall(peerName) {
  peerConnection = new RTCPeerConnection(servers);
  localStream
    .getTracks()
    .forEach((track) => peerConnection.addTrack(track, localStream));

  dataChannel = peerConnection.createDataChannel("chat");
  setupDataChannel();

  peerConnection.ontrack = (event) => {
    addVideoBlock(peerName, event.streams[0]);
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(
        JSON.stringify({
          type: "candidate",
          to: peerName,
          candidate: event.candidate,
        })
      );
    }
  };

  peerConnection.createOffer().then((offer) => {
    ws.send(JSON.stringify({ type: "offer", to: peerName, offer }));
    peerConnection.setLocalDescription(offer);
  });
}

// Handle Offer
function handleOffer(offer, from) {
  peerConnection = new RTCPeerConnection(servers);
  localStream
    .getTracks()
    .forEach((track) => peerConnection.addTrack(track, localStream));

  peerConnection.ondatachannel = (event) => {
    dataChannel = event.channel;
    setupDataChannel();
  };

  peerConnection.ontrack = (event) => {
    addVideoBlock(from, event.streams[0]);
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(
        JSON.stringify({
          type: "candidate",
          to: from,
          candidate: event.candidate,
        })
      );
    }
  };

  peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  peerConnection.createAnswer().then((answer) => {
    ws.send(JSON.stringify({ type: "answer", to: from, answer }));
    peerConnection.setLocalDescription(answer);
  });
}

// Setup data channel
function setupDataChannel() {
  dataChannel.onopen = () => console.log("Data channel opened");
  dataChannel.onclose = () => console.log("Data channel closed");
  dataChannel.onmessage = (event) => {
    const { sender, message } = JSON.parse(event.data);
    messages.innerHTML += `<p><strong>${sender}:</strong> ${message}</p>`;
  };
}

// Disconnect Button Functionality
disconnectBtn.addEventListener("click", () => {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
  }
  videoBlocks.forEach((_, blockId) => removeVideoBlock(blockId));
  ws.close();
  location.reload();
});

// Screen Sharing
screenShareBtn.addEventListener("click", async () => {
  screenShareBtn.disabled = true;

  if (isSharingScreen) {
    stopScreenSharing();
  } else {
    await startScreenSharing();
  }

  screenShareBtn.disabled = false;
});

async function startScreenSharing() {
  try {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
    });
    const screenTrack = screenStream.getVideoTracks()[0];

    const sender = peerConnection
      .getSenders()
      .find((s) => s.track.kind === "video");
    originalVideoTrack = sender.track;
    sender.replaceTrack(screenTrack);

    addVideoBlock(username, screenStream, true);
    ws.send(JSON.stringify({ type: "screenShareStart", userId: username }));

    screenTrack.onended = stopScreenSharing;

    isSharingScreen = true;
    screenShareIcon.classList.replace("bi-display", "bi-display-fill");
    screenShareBtn.title = "Stop Sharing";
  } catch (error) {
    console.error("Screen sharing failed:", error);
  }
}

function stopScreenSharing() {
  if (!originalVideoTrack) return;

  const sender = peerConnection
    .getSenders()
    .find((s) => s.track.kind === "video");
  sender.replaceTrack(originalVideoTrack);

  removeVideoBlock(username, true);
  ws.send(JSON.stringify({ type: "screenShareStop", userId: username }));

  isSharingScreen = false;
  screenShareIcon.classList.replace("bi-display-fill", "bi-display");
  screenShareBtn.title = "Share Screen";
}

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
  if (peerConnection) peerConnection.close();
  if (localStream) localStream.getTracks().forEach((track) => track.stop());
});

// DOMContentLoaded event for button toggles
document.addEventListener("DOMContentLoaded", () => {
  toggleMic.addEventListener("click", () => {
    toggleMic.classList.toggle("active");
    const micIcon = toggleMic.querySelector("i");
    if (toggleMic.classList.contains("active")) {
      micIcon.classList.replace("bi-mic", "bi-mic-mute");
    } else {
      micIcon.classList.replace("bi-mic-mute", "bi-mic");
    }
  });

  toggleCam.addEventListener("click", () => {
    toggleCam.classList.toggle("active");
    const camIcon = toggleCam.querySelector("i");
    if (toggleCam.classList.contains("active")) {
      camIcon.classList.replace("bi-camera-video", "bi-camera-video-off");
    } else {
      camIcon.classList.replace("bi-camera-video-off", "bi-camera-video");
    }
  });

  screenShareBtn.addEventListener("click", () => {
    screenShareBtn.classList.toggle("active");
  });

  disconnectBtn.addEventListener("click", () => {
    alert("Disconnecting...");
  });
});
