const peer = new Peer();
let connections = new Map(); // Store multiple connections
let username = "";
let isHost = false; // Add at the top of the file with other global variables

// Add global variables for call management
let localStream = null;
let audioTracks = new Map(); // Store audio tracks for each peer
let isMicMuted = false;
let isAudioMuted = false;
let activeGroupCall = false; // Add new global variable to track active call state
let callHost = null; // Add new variable to track call host
let isPersistentCall = false; // Add new global variable for persistent call state

// Show username screen first
document.getElementById("usernameScreen").style.display = "block";
document.getElementById("chatContainer").style.display = "none";

// Modify startChat function
function startChat() {
  const usernameInput = document.getElementById("usernameInput").value.trim();
  if (!usernameInput) {
    alert("Please enter a username");
    return;
  }

  username = usernameInput;
  document.getElementById("usernameScreen").style.display = "none";
  document.getElementById("chatContainer").style.display = "flex";

  // Enable send button when chat starts
  document.getElementById("sendBtn").disabled = false;

  peer = new Peer();
}

function generateNewId() {
  username = document.getElementById("usernameInput").value.trim();
  if (!username) {
    alert("Please enter a username");
    return;
  }

  document.getElementById("usernameScreen").style.display = "none";
  document.getElementById("chatContainer").style.display = "flex";

  isHost = true; // L'utente è l'host principale

  // Mostra il proprio ID sopra la chat
  document.getElementById("peerId").textContent = peer.id;

  console.log("You are the host.");
}

function showJoinHostInput() {
  username = document.getElementById("usernameInput").value.trim();
  if (!username) {
    alert("Please enter a username");
    return;
  }

  document.getElementById("joinHostInput").classList.remove("hidden");
}

function joinHost() {
  const hostId = document.getElementById("hostIdInput").value.trim();
  if (!hostId) {
    alert("Please enter a valid Host ID");
    return;
  }

  document.getElementById("usernameScreen").style.display = "none";
  document.getElementById("chatContainer").style.display = "flex";

  isHost = false; // L'utente non è l'host principale

  // Mostra l'ID dell'host sopra la chat
  document.getElementById("peerId").textContent = hostId;

  connectToPeer(hostId);
}

peer.on("open", function (id) {
  console.log("My peer ID is: " + id);
  document.getElementById("peerId").textContent = id;

  // Imposta l'utente corrente come host principale se è il primo a connettersi
  if (connections.size === 0) {
    isHost = true;
    console.log("You are the host.");
  }
});

peer.on("error", function (err) {
  console.error(err);
  document.getElementById(
    "status"
  ).innerHTML = `<span class="error">Error: ${err.message}</span>`;
});

function connectToPeer(hostId) {
  const peerId = hostId || document.getElementById("peerInput").value.trim();
  if (!peerId) {
    document.getElementById("status").innerHTML =
      '<span class="error">Please enter a valid Peer ID</span>';
    return;
  }

  if (connections.has(peerId)) {
    document.getElementById("status").innerHTML =
      '<span class="error">Already connected to this peer</span>';
    return;
  }

  const conn = peer.connect(peerId, { reliable: true, serialization: "json" });

  conn.on("open", function () {
    connections.set(peerId, conn);
    document.getElementById(
      "status"
    ).innerHTML = `<span class="success">Connected to: ${peerId}</span>`;
    // Enable send button when connected
    document.getElementById("sendBtn").disabled = false;

    isHost = false; // If we're connecting to someone, we're not the host

    // Send our user info to the host
    conn.send({
      type: "user_info",
      username: username,
      isHost: false,
    });

    // Request host info
    conn.send({ type: "request_host_info" });

    updateConnectedPeers();
  });

  conn.on("data", handleData);
  conn.on("close", () => handleConnectionClose(peerId));
  conn.on("error", (err) => handleConnectionError(peerId, err));
}

// Update broadcastPeerUpdate function
function broadcastPeerUpdate() {
  if (!isHost) return;

  const peerList = {
    type: "peer_list_update",
    host: {
      peerId: peer.id,
      username: username,
      isHost: true,
    },
    peers: Array.from(connections.entries()).map(([peerId, conn]) => ({
      peerId: peerId,
      username: conn.username || "Unknown",
      isHost: false,
      inCall: audioTracks.has(peerId),
    })),
    activeGroupCall: activeGroupCall,
  };

  for (let conn of connections.values()) {
    if (conn.open) {
      conn.send(peerList);
    }
  }
}

// Update the peer.on("connection") handler
peer.on("connection", function (connection) {
  const peerId = connection.peer;
  connections.set(peerId, connection);

  // Initialize connection with username field
  connection.username = null;

  // Send immediate host information
  connection.send({
    type: "user_info",
    username: username,
    isHost: isHost,
    hostId: peer.id,
  });

  // Notify new peer about active persistent call
  if (isHost && activeGroupCall && isPersistentCall) {
    setTimeout(() => {
      connection.send({
        type: "call_start",
        username: username,
        origin: peer.id,
        callHost: callHost,
        isPersistent: true,
      });
    }, 1000);
  }

  // Broadcast updated peer list after a short delay
  setTimeout(() => broadcastPeerUpdate(), 100);

  connection.on("data", handleData);
  connection.on("close", () => {
    handleConnectionClose(peerId);
    broadcastPeerUpdate();
  });

  updateConnectedPeers();
});

// Move these functions outside of peer.on("connection") to make them globally accessible
function handleData(data) {
  if (data.type === "delete_message") {
    // Update message locally
    updateDeletedMessage(data.messageId);

    // If we're the host, forward the deletion to all other peers
    if (isHost && data.origin !== peer.id) {
      for (let [peerId, conn] of connections.entries()) {
        if (conn.open && peerId !== data.origin) {
          conn.send(data);
        }
      }
    }
  } else if (data.type === "chat") {
    // Add message ID to chat messages if not present
    if (!data.messageId) {
      data.messageId = Date.now();
    }
    handleIncomingMessage(data);
  } else if (data.type === "peer_list_update") {
    // Store host information
    if (data.host) {
      const hostConn = connections.get(data.host.peerId) || {};
      hostConn.username = data.host.username;
      hostConn.isHost = true;
      connections.set(data.host.peerId, hostConn);
    }

    // Update connected peers
    data.peers.forEach((peer) => {
      if (connections.has(peer.peerId)) {
        const conn = connections.get(peer.peerId);
        conn.username = peer.username;
        conn.isHost = peer.isHost;
      } else {
        // Create connection object for new peers
        connections.set(peer.peerId, {
          username: peer.username,
          isHost: peer.isHost,
          peer: peer.peerId,
        });
      }
    });
    updateConnectedPeers();
  } else if (data.type === "user_info") {
    const connection = Array.from(connections.values()).find(
      (c) => c.peer === this.peer
    );
    if (connection) {
      connection.username = data.username;
      connection.isHost = data.isHost;

      // If we're the host, broadcast the updated list
      if (isHost) {
        setTimeout(() => broadcastPeerUpdate(), 100);
      }
      updateConnectedPeers();
    }
  } else if (data.type === "disconnect") {
    // Mostra un messaggio di disconnessione all'utente
    alert(data.message);

    // Disabilita l'invio di messaggi
    document.getElementById("message").disabled = true;
    document.getElementById("sendBtn").disabled = true;

    // Mostra il pulsante per tornare alla pagina principale
    const mainPageBtn = document.createElement("button");
    mainPageBtn.textContent = "Go to Main Page";
    mainPageBtn.className = "main-page-btn";
    mainPageBtn.onclick = function () {
      // Torna alla schermata principale
      document.getElementById("chatContainer").style.display = "none";
      document.getElementById("usernameScreen").style.display = "block";

      // Ripristina lo stato iniziale
      document.getElementById("message").disabled = false;
      document.getElementById("sendBtn").disabled = false;
      mainPageBtn.remove();
    };

    document.getElementById("chatContainer").appendChild(mainPageBtn);

    // Aggiorna lo stato della chat
    document.getElementById("status").innerHTML =
      '<span class="error">You have been disconnected.</span>';
  } else if (data.type === "request_host_info") {
    if (isHost) {
      const connection = Array.from(connections.values()).find(
        (c) => c.peer === this.peer
      );
      if (connection) {
        connection.send({
          type: "user_info",
          username: username,
          isHost: true,
        });
      }
    }
  } else if (data.type === "call_start") {
    callHost = data.callHost;
    isPersistentCall = data.isPersistent;

    if (!activeGroupCall) {
      // Show notification for new call
      document.getElementById("callNotification").style.display = "block";
      document.getElementById("callerName").textContent = data.username;
      window.currentCallOrigin = data.callHost;
    }
  } else if (data.type === "call_host_changed") {
    callHost = data.newHost;
    // If you're the new host, connect with all participants
    if (callHost === peer.id) {
      for (let [peerId, conn] of connections.entries()) {
        if (audioTracks.has(peerId)) {
          initiateAudioCall(peerId);
        }
      }
    }
  } else if (data.type === "join_call") {
    // Handle new participant joining call
    if (isHost && activeGroupCall) {
      initiateAudioCall(data.origin);
    }
  } else if (data.type === "call_end") {
    activeGroupCall = false;
    endGroupCall();
  } else if (data.type === "incoming_call") {
    // Show call notification popup
    document.getElementById("callNotification").style.display = "block";
    document.getElementById("callerName").textContent = data.username;

    // Store call origin for accept/decline handling
    window.currentCallOrigin = data.origin;
  } else if (data.type === "call_accepted") {
    if (isHost) {
      initiateAudioCall(data.origin);
    }
  } else if (data.type === "call_declined") {
    // Handle declined call if needed
  } else if (data.type === "peer_disconnected") {
    audioTracks.delete(data.peerId);
    handleCallParticipants();
  } else {
    handleIncomingMessage(data);
  }
}

// Add new function to join existing call
async function joinExistingCall(hostPeerId) {
  try {
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        track.stop();
        track.enabled = false;
      });
      localStream = null;
    }

    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const call = peer.call(hostPeerId, localStream);
    handleCall(call);

    activeGroupCall = true;
    document.getElementById("startCallBtn").style.display = "none";
    document.getElementById("endCallBtn").style.display = "inline-block";
    document.getElementById("callControls").style.display = "flex";
    updateCallStatus(true);
  } catch (err) {
    console.error("Failed to join call:", err);
  }
}

// Update handleIncomingMessage function
function handleIncomingMessage(data) {
  console.log("Received:", data);
  const received = document.getElementById("received");
  const now = new Date();
  const timeString = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  let messageObj = typeof data === "string" ? JSON.parse(data) : data;

  // Only add message if it's not already displayed
  const existingMessage = document.querySelector(
    `.message[data-message-id="${messageObj.messageId}"]`
  );

  if (!existingMessage) {
    // Add message to chat
    received.innerHTML += `
      <div class="message ${
        messageObj.origin === peer.id ? "sent" : "received"
      }" 
           data-message-id="${messageObj.messageId}">
          <div class="message-header">
              <div class="sender-name">${
                messageObj.origin === peer.id ? "You" : messageObj.username
              }</div>
              ${
                messageObj.origin === peer.id
                  ? `
                  <button class="delete-btn" onclick="deleteMessage(this.parentElement.parentElement)">
                      <i class="fa-solid fa-trash"></i>
                  </button>
              `
                  : ""
              }
          </div>
          <div class="text">${messageObj.text}</div>
          <div class="timestamp">${timeString}</div>
      </div>
    `;
    received.scrollTop = received.scrollHeight;

    // If we're the host, forward the message to all other peers
    if (isHost && messageObj.origin !== peer.id) {
      for (let [peerId, conn] of connections.entries()) {
        if (conn.open && peerId !== messageObj.origin) {
          conn.send(messageObj);
        }
      }
    }
  }
}

// Update sendMessage function
function sendMessage() {
  const messageText = document.getElementById("message").value.trim();

  if (!messageText) {
    document.getElementById("status").innerHTML =
      '<span class="error">Please enter a message</span>';
    return;
  }

  try {
    const messageId = Date.now();
    const messageObj = {
      type: "chat",
      username: username,
      text: messageText,
      origin: peer.id,
      messageId: messageId,
    };

    // If we're the host, send to all peers
    if (isHost) {
      for (let conn of connections.values()) {
        if (conn.open) {
          conn.send(messageObj);
        }
      }
    } else {
      // If we're not the host, only send to the host
      const hostConn = Array.from(connections.values()).find(
        (conn) => conn.isHost
      );
      if (hostConn && hostConn.open) {
        hostConn.send(messageObj);
      }
    }

    // Add our own message to the chat
    handleIncomingMessage(messageObj);

    // Clear input and update status
    document.getElementById("message").value = "";
    document.getElementById("status").innerHTML =
      '<span class="success">Message sent!</span>';
  } catch (err) {
    console.error("Send failed:", err);
    document.getElementById(
      "status"
    ).innerHTML = `<span class="error">Failed to send: ${err.message}</span>`;
  }
}

// Update updateConnectedPeers function
function updateConnectedPeers() {
  const connectedPeersDiv = document.getElementById("connectedPeers");
  let peersHtml = "";

  // Find host info
  let hostConn;
  if (isHost) {
    hostConn = { username: username, peerId: peer.id };
  } else {
    hostConn = Array.from(connections.entries()).find(
      ([_, conn]) => conn.isHost
    )?.[1] || { username: "Unknown Host" };
  }

  // Add host first with appropriate highlighting
  peersHtml += `
        <div class="peer-item host ${
          hostConn.username === username ? "self" : ""
        }">
            <div class="peer-content">
                <span class="peer-id">${hostConn.username} (host)</span>
            </div>
        </div>
    `;

  // Add other connected peers
  for (let [peerId, conn] of connections.entries()) {
    if (conn.isHost) continue; // Skip host as already added
    const displayName = conn.username || "Connecting...";

    peersHtml += `
            <div class="peer-item ${displayName === username ? "self" : ""}">
                <div class="peer-content">
                    <span class="peer-id">${displayName}</span>
                    ${
                      isHost
                        ? `
                        <button onclick="disconnectPeer('${peerId}')" class="disconnect-btn" title="Disconnect user">
                            disconnect
                        </button>
                    `
                        : ""
                    }
                </div>
            </div>
        `;
  }

  connectedPeersDiv.innerHTML =
    peersHtml || '<div class="no-peers">No connected peers</div>';
}

function disconnectPeer(peerId) {
  if (!isHost) {
    document.getElementById("status").innerHTML =
      '<span class="error">Only the host can disconnect peers</span>';
    return;
  }

  if (connections.has(peerId)) {
    const conn = connections.get(peerId);

    // Invia un messaggio di disconnessione al peer
    conn.send({
      type: "disconnect",
      message: "You have been disconnected by the host.",
    });

    // Chiudi la connessione e rimuovila dalla mappa
    conn.close();
    connections.delete(peerId);

    // Aggiorna la lista dei peer connessi
    updateConnectedPeers();

    document.getElementById(
      "status"
    ).innerHTML = `<span class="success">Disconnected peer: ${peerId}</span>`;
  }
}

// Update the deleteMessage function
function deleteMessage(messageElement) {
  const messageId = messageElement.dataset.messageId;

  // Create delete notification
  const deleteNotification = {
    type: "delete_message",
    messageId: messageId,
    username: username,
    origin: peer.id,
    timestamp: Date.now(),
  };

  // If we're the host, broadcast to all peers
  if (isHost) {
    for (let conn of connections.values()) {
      if (conn.open) {
        conn.send(deleteNotification);
      }
    }
  } else {
    // If we're not the host, send to the host for broadcasting
    const hostConn = Array.from(connections.values()).find(
      (conn) => conn.isHost
    );
    if (hostConn && hostConn.open) {
      hostConn.send(deleteNotification);
    }
  }

  // Update message locally
  updateDeletedMessage(messageId);
}

// Add new function to handle message deletion updates
function updateDeletedMessage(messageId) {
  const messageElement = document.querySelector(
    `.message[data-message-id="${messageId}"]`
  );
  if (messageElement) {
    // Update the message text
    const textDiv = messageElement.querySelector(".text");
    textDiv.innerHTML = "<em>Message deleted</em>";

    // Remove delete button if present
    const deleteBtn = messageElement.querySelector(".delete-btn");
    if (deleteBtn) {
      deleteBtn.remove();
    }

    // Update message styling
    messageElement.classList.add("deleted");
  }
}

// Allow sending message with Enter key
document.getElementById("message").addEventListener("keypress", function (e) {
  if (e.key === "Enter") {
    sendMessage();
  }
});

// Also allow submitting username with Enter
document
  .getElementById("usernameInput")
  .addEventListener("keypress", function (e) {
    if (e.key === "Enter") {
      startChat();
    }
  });

function syncPeers(connection) {
  const peersData = Array.from(connections.entries()).map(([peerId, conn]) => ({
    peerId,
    username: conn.username || peerId,
  }));

  connection.send({ type: "sync", peers: peersData, host: peer.id });
}

function handleSync(data) {
  const { peers, host } = data;

  peers.forEach(({ peerId, username }) => {
    if (!connections.has(peerId)) {
      // Crea una connessione fittizia per visualizzare i peer
      connections.set(peerId, { username });
    } else {
      // Aggiorna l'username se già connesso
      connections.get(peerId).username = username;
    }
  });

  // Aggiorna lo stato dell'host
  isHost = peer.id === host;

  updateConnectedPeers();
}

// Update call status UI
function updateCallStatus(isInCall) {
  const callStatusDiv = document.createElement("div");
  callStatusDiv.id = "callStatus";
  callStatusDiv.className = "call-status";

  if (isInCall) {
    const participants = Array.from(audioTracks.keys()).map((peerId) => {
      const conn = connections.get(peerId);
      return conn?.username || "Unknown";
    });

    callStatusDiv.innerHTML = `
            <div class="call-header">
                <span class="active-call">
                    <i class="fa-solid fa-phone"></i> Voice Call
                </span>
                <span class="participant-count">
                    ${participants.length + 1} participants
                </span>
            </div>
            <div class="call-participants">
                <div class="participant">
                    <i class="fa-solid fa-circle"></i>
                    ${username} (You)
                </div>
                ${participants
                  .map(
                    (name) => `
                    <div class="participant">
                        <i class="fa-solid fa-circle"></i>
                        ${name}
                    </div>
                `
                  )
                  .join("")}
            </div>
        `;
  }

  const chatHeader = document.querySelector(".chat-header");
  const existingStatus = document.getElementById("callStatus");
  if (existingStatus) {
    existingStatus.remove();
  }
  chatHeader.appendChild(callStatusDiv);
}

// Replace startGroupCall function
async function startGroupCall() {
  try {
    // Force cleanup if there's an existing call
    if (activeGroupCall || localStream) {
      await endGroupCall();
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Reset and initialize call state
    activeGroupCall = false;
    callHost = null;
    audioTracks.clear();
    isPersistentCall = true; // Mark as persistent call

    // Get fresh audio stream
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        track.stop();
        track.enabled = false;
      });
      localStream = null;
    }

    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Set new call states
    activeGroupCall = true;
    callHost = peer.id;

    // Update UI
    document.getElementById("startCallBtn").style.display = "none";
    document.getElementById("endCallBtn").style.display = "inline-block";
    document.getElementById("callControls").style.display = "flex";
    updateCallStatus(true);

    // Notify peers about persistent call
    for (let conn of connections.values()) {
      if (conn.open) {
        conn.send({
          type: "call_start",
          username: username,
          origin: peer.id,
          callHost: peer.id,
          isPersistent: true,
        });
      }
    }

    showCallStartNotification(username);
  } catch (err) {
    console.error("Failed to start call:", err);
    await endGroupCall();
  }
}

// Add function to handle host migration
function migrateCallHost() {
  // Find the next available peer to be host
  const nextHost = Array.from(connections.entries()).find(([_, conn]) =>
    audioTracks.has(conn.peer)
  )?.[1];

  if (nextHost) {
    callHost = nextHost.peer;
    // Notify all peers about the new call host
    for (let conn of connections.values()) {
      if (conn.open) {
        conn.send({
          type: "call_host_changed",
          newHost: callHost,
          username: nextHost.username,
        });
      }
    }
  } else {
    // No other participants, end call
    endGroupCall();
  }
}

// Update endGroupCall function to handle persistent calls
async function endGroupCall() {
  try {
    if (!isPersistentCall || isHost) {
      // Only the host can end a persistent call
      // Or anyone can end a non-persistent call
      // Regular cleanup code...
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          track.stop();
          track.enabled = false;
        });
        localStream = null;
      }

      audioTracks.forEach((stream) => {
        if (stream && stream.getTracks) {
          stream.getTracks().forEach((track) => {
            track.stop();
            track.enabled = false;
          });
        }
      });
      audioTracks.clear();

      document.querySelectorAll("audio").forEach((audio) => {
        if (audio.srcObject) {
          audio.srcObject.getTracks().forEach((track) => track.stop());
          audio.srcObject = null;
        }
        audio.remove();
      });

      activeGroupCall = false;
      isPersistentCall = false;
      callHost = null;
      window.currentCall = null;

      // Update UI
      document.getElementById("startCallBtn").style.display = "inline-block";
      document.getElementById("endCallBtn").style.display = "none";
      document.getElementById("callControls").style.display = "none";
      updateCallStatus(false);

      // Notify others
      for (let conn of connections.values()) {
        if (conn.open) {
          conn.send({
            type: "call_end",
            origin: peer.id,
            isHost: isHost,
          });
        }
      }
    } else {
      // Just leave the call without ending it
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          track.stop();
          track.enabled = false;
        });
        localStream = null;
      }

      activeGroupCall = false;
      document.getElementById("startCallBtn").style.display = "inline-block";
      document.getElementById("endCallBtn").style.display = "none";
      document.getElementById("callControls").style.display = "none";
    }

    return new Promise((resolve) => setTimeout(resolve, 1000));
  } catch (err) {
    console.error("Error ending call:", err);
  }
}

// Remove the duplicate peer.on("call") handler and keep just this one
peer.on("call", async function (call) {
  try {
    // Clean up old stream if exists
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        track.stop();
        track.enabled = false;
      });
      localStream = null;
    }

    // Get fresh stream
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const callerConn = Array.from(connections.values()).find(
      (conn) => conn.peer === call.peer
    );
    const callerName = callerConn ? callerConn.username : "Someone";

    if (activeGroupCall) {
      call.answer(localStream);
      handleCall(call);
      document.getElementById("callControls").style.display = "flex";
      document.getElementById("startCallBtn").style.display = "none";
      document.getElementById("endCallBtn").style.display = "inline-block";
    } else {
      document.getElementById("callerName").textContent = callerName;
      document.getElementById("callNotification").style.display = "block";
      window.currentCall = call;
    }
  } catch (err) {
    console.error("Failed to handle incoming call:", err);
  }
});

// Update handleCall function
function handleCall(call) {
  call.on("stream", function (remoteStream) {
    const audio = new Audio();
    audio.srcObject = remoteStream;
    audio.muted = isAudioMuted; // Apply current mute state
    audio.play().catch((err) => console.error("Audio playback failed:", err));
    audioTracks.set(call.peer, remoteStream);
    updateCallStatus(true);
  });

  call.on("close", function () {
    audioTracks.delete(call.peer);
    handleCallParticipants();
  });
}

// Update toggleAudio function to properly handle audio muting
function toggleAudio() {
  isAudioMuted = !isAudioMuted;

  // Mute all remote audio tracks
  audioTracks.forEach((stream) => {
    if (stream && stream.getAudioTracks) {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !isAudioMuted;
      });
    }
  });

  // Update all audio elements
  document.querySelectorAll("audio").forEach((audio) => {
    audio.muted = isAudioMuted;
  });

  const audioBtn = document.getElementById("toggleAudioBtn");
  audioBtn.innerHTML = isAudioMuted
    ? '<i class="fa-solid fa-volume-xmark"></i>'
    : '<i class="fa-solid fa-volume-high"></i>';
  audioBtn.classList.toggle("muted", isAudioMuted);
}

// Function to initiate audio call with a peer
function initiateAudioCall(peerId) {
  if (!localStream) return;

  const call = peer.call(peerId, localStream);
  handleCall(call);
}

// Update acceptCall function
async function acceptCall() {
  try {
    if (!localStream) {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }

    if (window.currentCall) {
      window.currentCall.answer(localStream);
      handleCall(window.currentCall);
    }

    document.getElementById("callNotification").style.display = "none";
    document.getElementById("callControls").style.display = "flex";
    document.getElementById("startCallBtn").style.display = "none";
    document.getElementById("endCallBtn").style.display = "inline-block";

    activeGroupCall = true;

    // Connect to call host
    if (callHost && callHost !== peer.id) {
      const call = peer.call(callHost, localStream);
      handleCall(call);
    }

    // Notify others that you joined
    for (let conn of connections.values()) {
      if (conn.open) {
        conn.send({
          type: "joined_call",
          username: username,
          origin: peer.id,
        });
      }
    }

    updateCallStatus(true);
  } catch (err) {
    console.error("Failed to get local stream:", err);
  }
}

// Function to decline call
function declineCall() {
  const hostConn = Array.from(connections.values()).find((conn) => conn.isHost);
  if (hostConn?.open) {
    hostConn.send({
      type: "call_declined",
      username: username,
      origin: peer.id,
    });
  }

  document.getElementById("callNotification").style.display = "none";
}

// Audio control functions
function toggleMicrophone() {
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    isMicMuted = !audioTrack.enabled;

    const micBtn = document.getElementById("toggleMicBtn");
    micBtn.innerHTML = isMicMuted
      ? '<i class="fa-solid fa-microphone-slash"></i>'
      : '<i class="fa-solid fa-microphone"></i>';
    micBtn.classList.toggle("muted", isMicMuted);
  }
}

// Add this new function for call notifications
function showCallStartNotification(callerName) {
  const notification = document.createElement("div");
  notification.className = "call-start-notification";
  notification.innerHTML = `
        <div class="notification-content">
            <i class="fa-solid fa-phone"></i>
            <span>${callerName} started a voice call</span>
        </div>
    `;

  document.body.appendChild(notification);

  // Remove notification after 5 seconds
  setTimeout(() => {
    notification.classList.add("fade-out");
    setTimeout(() => notification.remove(), 500);
  }, 5000);
}

// Add function to handle call participant count
function handleCallParticipants() {
  const participantCount = audioTracks.size + 1; // +1 for self

  if (participantCount <= 2) {
    // If only two participants and one leaves, end call for remaining user
    endGroupCall();
    for (let conn of connections.values()) {
      if (conn.open) {
        conn.send({ type: "call_end" });
      }
    }
  } else {
    // Update call status with new participant count
    updateCallStatus(true);
  }
}

// Update handleConnectionClose function
function handleConnectionClose(peerId) {
  connections.delete(peerId);

  if (activeGroupCall) {
    audioTracks.delete(peerId);

    // If call host disconnects, migrate to new host
    if (peerId === callHost) {
      migrateCallHost();
    }

    handleCallParticipants();
    broadcastPeerUpdate();
  }

  updateConnectedPeers();
}
