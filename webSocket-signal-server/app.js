let localStream, remoteStream, peerConnection;
const socket = new WebSocket("ws://localhost:8080");
const rtcServers = {
  iceServers: [
    {
      urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
    },
  ],
};

let room = null;
let isInitialized = false;

function joinRoom() {
  room = prompt("Enter room name:");
  if (!room) {
    alert("Room name is required!");
    return;
  }

  if (socket.readyState === WebSocket.OPEN) {
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
  joinRoom();
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
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        sendSignal("answer", answer);
      } else if (signalType === "answer") {
        console.log("Received answer");
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(payload)
        );
      } else if (signalType === "candidate") {
        console.log("Received ICE candidate");
        if (peerConnection && peerConnection.remoteDescription) {
          await peerConnection.addIceCandidate(new RTCIceCandidate(payload));
        } else {
          console.log(
            "Peer connection not ready for ICE candidate, queuing..."
          );
          // Store candidate for later if peer connection isn't ready
          setTimeout(() => {
            if (peerConnection && peerConnection.remoteDescription) {
              peerConnection.addIceCandidate(new RTCIceCandidate(payload));
            }
          }, 1000);
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

    const userVideo1 = document.getElementById("user-1");
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
    }

    console.log("Adding local tracks...");
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
      console.log(`Added ${track.kind} track`);
    });

    peerConnection.ontrack = (evt) => {
      console.log("Received remote track:", evt.track.kind);
      evt.streams[0].getTracks().forEach((track) => {
        remoteStream.addTrack(track);
      });
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

initCall(true);
