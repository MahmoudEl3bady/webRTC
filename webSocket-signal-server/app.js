let localStream, remoteStream, peerConnection;
let screenStream;
let isAudioMuted = false;
let isVideoMuted = false;
let isScreenSharing = false;

const roomEntry = document.getElementById("room-entry");
const conference = document.getElementById("conference");
const roomNameInput = document.getElementById("room-name-input");
const roomNameBtn = document.getElementById("room-name-btn");
const currentRoom = document.getElementById("current-room");

const micBtn = document.getElementById("mute-audio");
const cameraBtn = document.getElementById("mute-video");
const callBtn = document.getElementById("end-call");
const shareScreenBtn = document.getElementById("share-screen");

const userVideo1 = document.getElementById("user-1");
const userVideo2 = document.getElementById("user-2");
const shareScreenVideo = document.getElementById("screen-share");

const socket = new WebSocket("ws://localhost:8080");
const rtcServers = {
  iceServers: [
    {
      urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
    },
  ],
};

let isInitialized = false;
let room = null;
let queuedIceCandidates = [];

roomNameBtn.addEventListener("click", joinRoomHandler);
roomNameInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") joinRoomHandler();
});

function joinRoomHandler() {
  room = roomNameInput.value.trim();
  if (!room) return;

  currentRoom.textContent = room;
  roomEntry.style.display = "none";
  conference.classList.add("active");
  joinRoom(room);
}

function joinRoom(room) {
  if (!room) {
    console.log("Please Enter a Room to continue!!");
    return;
  }
  if (socket.readyState === WebSocket.OPEN) {
    console.log("JOINING ROOM", room);
    socket.send(JSON.stringify({ type: "join", room }));
    console.log(`Joining room: ${room}`);
  } else {
    console.log("WebSocket not ready, waiting...");
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ type: "join", room }));
      console.log(`Joining room: ${room}`);
    });
  }
}

socket.onopen = () => {
  console.log("WebSocket connected");
};

socket.onmessage = async (evt) => {
  try {
    const msg = JSON.parse(evt.data);
    console.log("Received message:", msg);

    if (msg.type === "ready") {
      console.log("Both peers ready, initiating call as caller");
      await initCall(true);
    }

    if (msg.type === "signal") {
      const { type: signalType, data: payload } = msg.payload;
      console.log(`Received signal: ${signalType}`);

      if (signalType === "offer") {
        console.log("Received offer, responding as callee");
        await initCall(false);
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(payload)
        );

        await processQueuedIceCandidates();

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        sendSignal("answer", answer);
      } else if (signalType === "answer") {
        console.log("Received answer");
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(payload)
        );

        await processQueuedIceCandidates();
      } else if (signalType === "candidate") {
        console.log("Received ICE candidate");
        if (peerConnection && peerConnection.remoteDescription) {
          await peerConnection.addIceCandidate(new RTCIceCandidate(payload));
        } else {
          console.log("Queuing ICE candidate until remote description is set");
          queuedIceCandidates.push(payload);
        }
      }
    }
  } catch (error) {
    console.error("Error handling message:", error);
  }
};

socket.onerror = (error) => {
  console.error("WebSocket error:", error);
};

socket.onclose = () => {
  console.log("WebSocket connection closed");
};

// WebRTC Functions
async function processQueuedIceCandidates() {
  for (const candidateData of queuedIceCandidates) {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidateData));
      console.log("Added queued ICE candidate");
    } catch (error) {
      console.error("Error adding queued ICE candidate:", error);
    }
  }
  queuedIceCandidates = [];
}

function sendSignal(type, data) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(
      JSON.stringify({
        type: "signal",
        room,
        payload: { type, data },
      })
    );
    console.log(`Sent signal: ${type}`);
  } else {
    console.error("Cannot send signal, WebSocket not open");
  }
}

async function initCall(isCaller) {
  try {
    if (isInitialized) {
      console.log("Call already initialized");
      return;
    }

    console.log(`Initializing call as ${isCaller ? "caller" : "callee"}`);
    isInitialized = true;

    console.log("Getting user media...");
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    if (userVideo1) {
      userVideo1.srcObject = localStream;
      userVideo1.muted = true;
      document.getElementById("placeholder-1").style.display = "none";
    }

    console.log("Creating peer connection...");
    peerConnection = new RTCPeerConnection(rtcServers);
    remoteStream = new MediaStream();

    if (userVideo2) {
      userVideo2.srcObject = remoteStream;
      userVideo2.muted = true;
    }

    console.log("Adding local tracks...");
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
      console.log(`Added ${track.kind} track`);
    });

    peerConnection.ontrack = (evt) => {
      console.log("Received remote track:", evt.track.kind);

      if (evt.streams[0]) {
        const videoTrack = evt.streams[0].getVideoTracks()[0];

        if (videoTrack) {
          const settings = videoTrack.getSettings();

          if (settings.width >= 1920 || settings.height >= 1080) {
            if (shareScreenVideo) {
              shareScreenVideo.srcObject = evt.streams[0];
              document.getElementById("screen-placeholder").style.display =
                "none";
            }
          } else {
            if (userVideo2) {
              userVideo2.srcObject = evt.streams[0];
              document.getElementById("placeholder-2").style.display = "none";
            }
          }
        }
      }
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("Generated ICE candidate");
        sendSignal("candidate", event.candidate);
      } else {
        console.log("ICE candidate gathering completed");
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      console.log("ICE connection state:", peerConnection.iceConnectionState);
    };

    peerConnection.onconnectionstatechange = () => {
      console.log("Connection state:", peerConnection.connectionState);
    };

    if (isCaller) {
      console.log("Creating offer...");
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      sendSignal("offer", offer);
      console.log("Offer sent");
    }

    setupControls();
  } catch (error) {
    console.error("Error initializing call:", error);
    isInitialized = false;

    if (error.name === "NotAllowedError") {
      alert(
        "Camera/microphone access denied. Please allow permissions and refresh."
      );
    } else if (error.name === "NotFoundError") {
      alert("No camera/microphone found. Please connect a device and refresh.");
    } else {
      alert("Error starting video call: " + error.message);
    }
  }
}

const toggleAudio = () => {
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    audioTrack.enabled = !audioTrack.enabled;
    isAudioMuted = !audioTrack.enabled;

    micBtn.textContent = isAudioMuted ? "🎤 Unmute Audio" : "🎤 Mute Audio";
    micBtn.className = `control-btn ${isAudioMuted ? "active" : "secondary"}`;
  }
};

const toggleVideo = () => {
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.enabled = !videoTrack.enabled;
    isVideoMuted = !videoTrack.enabled;

    cameraBtn.textContent = isVideoMuted ? "📹 Turn On Video" : "📹 Mute Video";
    cameraBtn.className = `control-btn ${
      isVideoMuted ? "active" : "secondary"
    }`;
  }
};

async function startScreenShare() {
  try {
    if (isScreenSharing) {
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      const cameraTrack = cameraStream.getVideoTracks()[0];
      const videoSender = peerConnection
        .getSenders()
        .find((sender) => sender.track && sender.track.kind === "video");

      if (videoSender) {
        await videoSender.replaceTrack(cameraTrack);
      }

      localStream = cameraStream;
      if (userVideo1) {
        userVideo1.srcObject = localStream;
      }

      document.getElementById("screen-placeholder").style.display = "flex";
      isScreenSharing = false;
      shareScreenBtn.textContent = "🖥️ Share Screen";
      shareScreenBtn.className = "control-btn primary";
    } else {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      const screenTrack = screenStream.getVideoTracks()[0];
      const videoSender = peerConnection
        .getSenders()
        .find((sender) => sender.track && sender.track.kind === "video");

      if (videoSender) {
        await videoSender.replaceTrack(screenTrack);
      }

      if (shareScreenVideo) {
        shareScreenVideo.srcObject = screenStream;
        document.getElementById("screen-placeholder").style.display = "none";
        shareScreenVideo.style.display = "block";
        shareScreenVideo.style.width = "100%";
      }

      isScreenSharing = true;
      shareScreenBtn.textContent = "🖥️ Stop Sharing";
      shareScreenBtn.className = "control-btn active";

      screenTrack.onended = async () => {
        const cameraStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        const cameraTrack = cameraStream.getVideoTracks()[0];
        await videoSender.replaceTrack(cameraTrack);

        localStream = cameraStream;
        if (userVideo1) {
          userVideo1.srcObject = localStream;
        }

        document.getElementById("screen-placeholder").style.display = "flex";
        isScreenSharing = false;
        shareScreenBtn.textContent = "🖥️ Share Screen";
        shareScreenBtn.className = "control-btn primary";
      };
    }
  } catch (error) {
    console.error("Error with screen share:", error);
    alert("Screen sharing failed: " + error.message);
  }
}

const endCall = () => {
  if (confirm("Are you sure you want to end the call?")) {
    if (localStream) {
      localStream.getTracks().forEach((tr) => tr.stop());
    }
    if (remoteStream) {
      remoteStream.getTracks().forEach((tr) => tr.stop());
    }
    if (peerConnection) {
      peerConnection.close();
    }

    if (socket.readyState === WebSocket.OPEN) {
      socket.close();
    }

    userVideo1.srcObject = null;
    userVideo2.srcObject = null;
    shareScreenVideo.srcObject = null;

    document.getElementById("placeholder-1").style.display = "flex";
    document.getElementById("placeholder-2").style.display = "flex";
    document.getElementById("screen-placeholder").style.display = "flex";

    isInitialized = false;
    queuedIceCandidates = [];
    isAudioMuted = false;
    isVideoMuted = false;
    isScreenSharing = false;

    conference.classList.remove("active");
    roomEntry.style.display = "block";
    roomNameInput.value = "";

    micBtn.textContent = "🎤 Mute Audio";
    micBtn.className = "control-btn secondary";
    cameraBtn.textContent = "📹 Mute Video";
    cameraBtn.className = "control-btn secondary";
    shareScreenBtn.textContent = "🖥️ Share Screen";
    shareScreenBtn.className = "control-btn primary";
  }
};

function setupControls() {
  micBtn.addEventListener("click", toggleAudio);
  cameraBtn.addEventListener("click", toggleVideo);
  callBtn.addEventListener("click", endCall);
  shareScreenBtn.addEventListener("click", startScreenShare);
}
