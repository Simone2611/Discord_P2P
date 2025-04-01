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

    // Invia il nome utente al peer remoto
    conn.send({ type: "username", username: username });

    // Invia il proprio username a tutti i peer connessi
    for (let [id, connection] of connections.entries()) {
      if (connection.open) {
        connection.send({ type: "username", username });
      }
    }

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

  // Invia l'elenco dei peer connessi al nuovo peer
  syncPeers(connection);

  connection.on("data", function (data) {
    if (data.type === "username") {
      console.log(`Peer ${peerId} username: ${data.username}`);
      connection.username = data.username; // Salva l'username del peer remoto
      updateConnectedPeers();
    } else if (data.type === "sync") {
      handleSync(data.peers);
    } else {
      handleIncomingMessage(data);
    }
  });

  connection.on("close", () => handleConnectionClose(peerId));
  updateConnectedPeers();
});

function handleIncomingMessage(data) {
  console.log("Received:", data);
  let messageObj = typeof data === "string" ? JSON.parse(data) : data;

  if (messageObj.deleted) {
    // Find and update existing message
    const existingMessage = document.querySelector(
      `[data-message-id="${messageObj.messageId}"]`
    );
    if (existingMessage) {
      const textDiv = existingMessage.querySelector(".text");
      textDiv.innerHTML = "<em>Message deleted</em>";
      return;
    }
  }

  const received = document.getElementById("received");
  const now = new Date();
  const timeString = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

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
    <div class="message received" data-message-id="${
      messageObj.messageId || Date.now()
    }">
        <div class="sender-name">${messageObj.username || "Unknown"}</div>
        <div class="text">${
          messageObj.deleted
            ? "<em>Message deleted</em>"
            : messageObj.text || messageObj
        }</div>
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
    const messageId = Date.now();
    const messageObj = {
      username: username,
      text: messageText,
      origin: peer.id,
      messageId: messageId,
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
        <div class="message sent" data-message-id="${messageId}">
            <div class="message-header">
                <div class="sender-name">You</div>
                <button class="delete-btn" onclick="deleteMessage(this.parentElement.parentElement)"><i class="fa-solid fa-trash"></i></button>
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

function updateConnectedPeers() {
  const connectedPeersDiv = document.getElementById("connectedPeers");
  if (connections.size === 0) {
    connectedPeersDiv.innerHTML =
      '<div class="no-peers">No connected peers</div>';
    return;
  }

  // Mostra il proprio username come primo elemento
  let peersHtml = `
    <div class="peer-item self">
      You (${username})
    </div>
  `;

  // Mostra gli altri peer connessi
  for (let [peerId, conn] of connections.entries()) {
    const peerUsername = conn.username || peerId; // Usa l'username se disponibile, altrimenti l'ID
    peersHtml += `
      <div class="peer-item">
        ${peerUsername}
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

function deleteMessage(messageElement) {
  const messageId = messageElement.dataset.messageId;

  // Update the message display
  const textDiv = messageElement.querySelector(".text");
  textDiv.innerHTML = "<em>Message deleted</em>";

  // Remove the delete button
  const deleteBtn = messageElement.querySelector(".delete-btn");
  if (deleteBtn) {
    deleteBtn.remove();
  }

  // Send delete notification to all peers
  const deleteNotification = {
    username: username,
    deleted: true,
    origin: peer.id,
    messageId: messageId,
  };

  for (let conn of connections.values()) {
    conn.send(deleteNotification);
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

  connection.send({ type: "sync", peers: peersData });
}

function handleSync(peers) {
  peers.forEach(({ peerId, username }) => {
    if (!connections.has(peerId)) {
      // Crea una connessione fittizia per visualizzare i peer
      connections.set(peerId, { username });
    } else {
      // Aggiorna l'username se già connesso
      connections.get(peerId).username = username;
    }
  });

  updateConnectedPeers();
}
