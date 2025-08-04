let localStream, remoteStream, peerConnection;
let screenStream;
let isAudioMuted = false;
let isVideoMuted = false;
let isScreenSharing = false;

const micBtn = document.getElementById("mute-audio");
const cameraBtn = document.getElementById("mute-video");
const callBtn = document.getElementById("end-call");
const userVideo1 = document.getElementById("user-1");
const shareScreenBtn = document.getElementById("share-screen");
const roomNameSection = document.getElementById("RoomName-section");
const currentRoomHeader = document.getElementById("curr-room");

const socket = new WebSocket("ws://localhost:8080");
const rtcServers = {
  iceServers: [
    {
      urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
    },
  ],
};

let isInitialized = false;
const roomNameInput = document.getElementById("room-name-input");
const roomNameBtn = document.getElementById("room-name-btn");

let room = null;
let queuedIceCandidates = [];

roomNameBtn.addEventListener("click", () => {
  room = roomNameInput.value;
  roomNameInput.value = "";
  roomNameSection.style.display = "none";
  currentRoomHeader.innerText = `Room: ${room}`;
  joinRoom(room);
});

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

const shareScreenVideo = document.getElementById("screen-share");

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
      audio: false,
    });

    if (userVideo1) {
      userVideo1.srcObject = localStream;
      userVideo1.muted = true;
    }

    console.log("Creating peer connection...");
    peerConnection = new RTCPeerConnection(rtcServers);
    remoteStream = new MediaStream();

    const userVideo2 = document.getElementById("user-2");
    if (userVideo2) {
      userVideo2.srcObject = remoteStream;
      userVideo2.muted = true;
    }

    console.log("Adding local tracks...");
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
      console.log(`Added ${track.kind} track`);
    });

    // Replace your existing peerConnection.ontrack handler with this:
    peerConnection.ontrack = (evt) => {
      console.log("Received remote track:", evt.track.kind);
      const userVideo2 = document.getElementById("user-2");
      const shareScreenVideo = document.getElementById("screen-share");

      if (evt.streams[0]) {
        // Check if this is likely a screen share based on track constraints
        const videoTrack = evt.streams[0].getVideoTracks()[0];

        if (videoTrack) {
          const settings = videoTrack.getSettings();

          // Screen shares typically have larger dimensions
          if (settings.width >= 1920 || settings.height >= 1080) {
            // This is likely a screen share - show in screen-share video
            if (shareScreenVideo) {
              shareScreenVideo.srcObject = evt.streams[0];
              shareScreenVideo.style.display = "block";
            }

            // Keep camera feed in user-2 if available, or hide it
            if (userVideo2) {
              userVideo2.style.display = "none";
            }
          } else {
            // This is regular camera feed
            if (userVideo2) {
              userVideo2.srcObject = evt.streams[0];
              userVideo2.style.display = "block";
            }

            // Hide screen share video if it was showing
            if (shareScreenVideo) {
              shareScreenVideo.style.display = "none";
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

    micBtn.textContent = isAudioMuted ? "Unmute Audio" : "Mute Audio";
    micBtn.classList.toggle("muted", isAudioMuted);
  }
};

const toggleVideo = () => {
  console.log("Get video Tracks", localStream.getVideoTracks());
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.enabled = !videoTrack.enabled;
    isVideoMuted = !videoTrack.enabled;

    cameraBtn.textContent = isVideoMuted ? "Open Camera" : "Close Camera";
    cameraBtn.classList.toggle("muted", isVideoMuted);
  }
};

const endCall = () => {
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

  document.getElementById("user-1").srcObject = null;
  document.getElementById("user-2").srcObject = null;

  isInitialized = false;
  queuedIceCandidates = [];
};

function setupControls() {
  micBtn.addEventListener("click", toggleAudio);
  cameraBtn.addEventListener("click", toggleVideo);
  callBtn.addEventListener("click", endCall);
}
async function startScreenShare() {
  try {
    // Get screen share stream
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

      const shareScreenVideo = document.getElementById("screen-share");
      if (shareScreenVideo) {
        shareScreenVideo.srcObject = screenStream;
        shareScreenVideo.style.display = "block";
      }

      isScreenSharing = true;

      screenTrack.onended = async () => {
        const cameraStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });

        const cameraTrack = cameraStream.getVideoTracks()[0];

        await videoSender.replaceTrack(cameraTrack);

        localStream = cameraStream;

        const userVideo1 = document.getElementById("user-1");
        if (userVideo1) {
          userVideo1.srcObject = localStream;
        }

        if (shareScreenVideo) {
          shareScreenVideo.srcObject = null;
          shareScreenVideo.style.display = "none";
        }

        isScreenSharing = false;
      };
    }
  } catch (error) {
    console.error("Error starting screen share:", error);
    alert("Screen sharing failed: " + error.message);
  }
}
