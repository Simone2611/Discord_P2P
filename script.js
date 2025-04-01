const peer = new Peer();
let connections = new Map(); // Store multiple connections
let username = "";

// Show username screen first
document.getElementById("usernameScreen").style.display = "block";
document.getElementById("chatContainer").style.display = "none";

function startChat() {
  username = document.getElementById("usernameInput").value.trim();
  if (!username) {
    alert("Please enter a username");
    return;
  }

  document.getElementById("usernameScreen").style.display = "none";
  document.getElementById("chatContainer").style.display = "flex";
}

peer.on("open", function (id) {
  console.log("My peer ID is: " + id);
  document.getElementById("peerId").textContent = id;
});

peer.on("error", function (err) {
  console.error(err);
  document.getElementById(
    "status"
  ).innerHTML = `<span class="error">Error: ${err.message}</span>`;
});

function connectToPeer() {
  const peerId = document.getElementById("peerInput").value.trim();
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
    console.log("Connected to:", peerId);
    document.getElementById(
      "status"
    ).innerHTML = `<span class="success">Connected to: ${peerId}</span>`;
    document.getElementById("sendBtn").disabled = false;
    updateConnectedPeers();
  });

  conn.on("data", handleIncomingMessage);
  conn.on("close", () => handleConnectionClose(peerId));
  conn.on("error", (err) => handleConnectionError(peerId, err));
}

peer.on("connection", function (connection) {
  const peerId = connection.peer;

  if (connections.has(peerId)) {
    connections.get(peerId).close();
  }

  connections.set(peerId, connection);
  console.log("Incoming connection from:", peerId);
  document.getElementById(
    "status"
  ).innerHTML = `<span class="success">Connected from: ${peerId}</span>`;
  document.getElementById("sendBtn").disabled = false;

  connection.on("data", handleIncomingMessage);
  connection.on("close", () => handleConnectionClose(peerId));
  updateConnectedPeers();
});

function handleIncomingMessage(data) {
  console.log("Received:", data);
  const received = document.getElementById("received");
  const now = new Date();
  const timeString = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  let messageObj;
  try {
    messageObj = typeof data === "string" ? JSON.parse(data) : data;
  } catch (e) {
    messageObj = {
      username: "Unknown",
      text: data,
    };
  }

  // Mostra il messaggio nella chat
  received.innerHTML += `
          <div class="message received">
            <div class="sender-name">${messageObj.username || "Unknown"}</div>
            <div class="text">${messageObj.text || messageObj}</div>
            <div class="timestamp">${timeString}</div>
          </div>
        `;
  received.scrollTop = received.scrollHeight;

  // Inoltra il messaggio agli altri peer connessi
  for (let [peerId, conn] of connections.entries()) {
    if (conn.open && conn.peer !== messageObj.origin) {
      conn.send({ ...messageObj, origin: peer.id });
    }
  }
}

function handleConnectionClose(peerId) {
  console.log("Connection closed with:", peerId);
  connections.delete(peerId);
  document.getElementById(
    "status"
  ).innerHTML = `<span class="error">Connection closed with: ${peerId}</span>`;
  document.getElementById("sendBtn").disabled = connections.size === 0;
  updateConnectedPeers();
}

function handleConnectionError(peerId, err) {
  console.error("Connection error:", err);
  connections.delete(peerId);
  document.getElementById(
    "status"
  ).innerHTML = `<span class="error">Connection error with ${peerId}: ${err.message}</span>`;
  document.getElementById("sendBtn").disabled = connections.size === 0;
  updateConnectedPeers();
}

function sendMessage() {
  if (connections.size === 0) {
    document.getElementById("status").innerHTML =
      '<span class="error">No active connections</span>';
    document.getElementById("sendBtn").disabled = true;
    return;
  }

  const messageText = document.getElementById("message").value.trim();
  if (!messageText) {
    document.getElementById("status").innerHTML =
      '<span class="error">Please enter a message</span>';
    return;
  }

  try {
    const messageObj = {
      username: username,
      text: messageText,
      origin: peer.id, // Aggiungi l'ID del peer che ha originato il messaggio
    };

    for (let conn of connections.values()) {
      conn.send(messageObj);
    }
    console.log("Message sent to all peers:", messageObj);

    const received = document.getElementById("received");
    const now = new Date();
    const timeString = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    received.innerHTML += `
            <div class="message sent">
              <div class="sender-name">You</div>
              <div class="text">${messageText}</div>
              <div class="timestamp">${timeString}</div>
            </div>
          `;
    received.scrollTop = received.scrollHeight;

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

function updateConnectedPeers() {
  const connectedPeersDiv = document.getElementById("connectedPeers");
  if (connections.size === 0) {
    connectedPeersDiv.innerHTML =
      '<div class="no-peers">No connected peers</div>';
    return;
  }

  let peersHtml = '<div class="peers-title">Connected Peers:</div>';
  for (let peerId of connections.keys()) {
    peersHtml += `
      <div class="peer-item">
        <span class="peer-id">${peerId}</span>
        <button onclick="disconnectPeer('${peerId}')" class="disconnect-btn">
          Disconnect
        </button>
      </div>
    `;
  }
  connectedPeersDiv.innerHTML = peersHtml;
}

function disconnectPeer(peerId) {
  if (connections.has(peerId)) {
    connections.get(peerId).close();
    connections.delete(peerId);
    updateConnectedPeers();
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
