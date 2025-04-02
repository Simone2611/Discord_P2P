const peer = new Peer();
let connections = new Map(); // Store multiple connections
let username = "";
let isHost = false; // Add at the top of the file with other global variables

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

  // Include host information and all connected peers
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
    })),
  };

  // Broadcast to all connected peers
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
  if (data.type === "peer_list_update") {
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
  } else if (data.type === "delete_message") {
    // Gestisci la cancellazione del messaggio
    const messageElement = document.querySelector(
      `.message[data-message-id="${data.messageId}"]`
    );
    if (messageElement) {
      const textDiv = messageElement.querySelector(".text");
      textDiv.innerHTML = "<em>Message deleted</em>";

      // Rimuovi il pulsante di cancellazione se presente
      const deleteBtn = messageElement.querySelector(".delete-btn");
      if (deleteBtn) {
        deleteBtn.remove();
      }
    }
  } else {
    handleIncomingMessage(data);
  }
}

// Update handleConnectionClose function
function handleConnectionClose(peerId) {
  console.log("Connection closed with:", peerId);
  connections.delete(peerId);

  // Update UI immediately
  updateConnectedPeers();

  // If we're the host, broadcast the updated peer list
  if (isHost) {
    setTimeout(() => broadcastPeerUpdate(), 100);
  }

  document.getElementById(
    "status"
  ).innerHTML = `<span class="info">User disconnected</span>`;
}

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

  if (messageObj.type === "chat" || messageObj.deleted) {
    received.innerHTML += `
      <div class="message ${
        messageObj.origin === peer.id ? "sent" : "received"
      }" data-message-id="${messageObj.messageId || Date.now()}">
          <div class="sender-name">${messageObj.username || "Unknown"}</div>
          <div class="text">${
            messageObj.deleted ? "<em>Message deleted</em>" : messageObj.text
          }</div>
          <div class="timestamp">${timeString}</div>
      </div>
    `;
    received.scrollTop = received.scrollHeight;

    // Forward message to other peers if needed
    for (let [peerId, conn] of connections.entries()) {
      if (conn.open && conn.peer !== messageObj.origin) {
        conn.send({ ...messageObj, origin: peer.id });
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

    // Send to all peers
    for (let conn of connections.values()) {
      if (conn.open) {
        conn.send(messageObj);
      }
    }

    // Add your own message to the chat
    const received = document.getElementById("received");
    const now = new Date();
    const timeString = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    received.innerHTML += `
      <div class="message sent" data-message-id="${messageId}">
          <div class="message-header">
              <div class="sender-name">You</div>
              <button class="delete-btn" onclick="deleteMessage(this.parentElement.parentElement)">
                <i class="fa-solid fa-trash"></i>
              </button>
          </div>
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

// Update updateConnectedPeers function
function updateConnectedPeers() {
  const connectedPeersDiv = document.getElementById("connectedPeers");
  let peersHtml = '<div class="peers-title">Connected Users:</div>';

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
            <span class="peer-id">${hostConn.username} (host)</span>
        </div>
    `;

  // Add other connected peers
  for (let [peerId, conn] of connections.entries()) {
    if (conn.isHost) continue; // Skip host as already added
    const displayName = conn.username || "Connecting...";

    peersHtml += `
            <div class="peer-item ${displayName === username ? "self" : ""}">
                <span class="peer-id">${displayName}</span>
                ${
                  isHost
                    ? `
                    <button onclick="disconnectPeer('${peerId}')" class="disconnect-btn">
                        Disconnect
                    </button>
                `
                    : ""
                }
            </div>
        `;
  }

  connectedPeersDiv.innerHTML = peersHtml;
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

// Update the deleteMessage function to include the type
function deleteMessage(messageElement) {
  const messageId = messageElement.dataset.messageId;

  // Aggiorna il messaggio localmente
  const textDiv = messageElement.querySelector(".text");
  textDiv.innerHTML = "<em>Message deleted</em>";

  // Rimuovi il pulsante di cancellazione
  const deleteBtn = messageElement.querySelector(".delete-btn");
  if (deleteBtn) {
    deleteBtn.remove();
  }

  // Invia una notifica di cancellazione agli altri peer
  const deleteNotification = {
    type: "delete_message",
    messageId: messageId,
  };

  for (let conn of connections.values()) {
    if (conn.open) {
      conn.send(deleteNotification);
    }
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
