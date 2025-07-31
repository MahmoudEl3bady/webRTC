let peerConnection = new RTCPeerConnection();
let localStream;
let remoteStream;

const hostVideo = document.getElementById("user-1");
const guestVideo = document.getElementById("user-2");
const createOfferBtn = document.getElementById("create-offer");
const createAnswerBtn = document.getElementById("create-answer");
const offerArea = document.getElementById("offer-sdp");
const answerArea = document.getElementById("answer-sdp");
const callBtn = document.getElementById("call");

const initCall = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });

  remoteStream = new MediaStream();

  hostVideo.srcObject = localStream;
  guestVideo.srcObject = remoteStream;
  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };
};

const createOffer = async () => {
  peerConnection.onicecandidate = async (evt) => {
    if (evt.candidate) {
      offerArea.value = JSON.stringify(peerConnection.localDescription);
    }
  };

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
};

const createAnswer = async () => {
  let offer = JSON.parse(offerArea.value);
  peerConnection.onicecandidate = async (evt) => {
    console.log("Adding answer candidate...:", event.candidate);
    answerArea.value = JSON.stringify(peerConnection.localDescription);
  };
  await peerConnection.setRemoteDescription(offer);

  let answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
};

let addAnswer = async () => {
  console.log("Add answer triggerd");
  let answer = JSON.parse(document.getElementById("answer-sdp").value);
  console.log("answer:", answer);
  if (!peerConnection.currentRemoteDescription) {
    peerConnection.setRemoteDescription(answer);
  }
};

initCall();

document.getElementById("create-offer").addEventListener("click", createOffer);
document
  .getElementById("create-answer")
  .addEventListener("click", createAnswer);
document.getElementById("call").addEventListener("click", addAnswer);
