const peer = new Peer();
let conn = null;
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

  if (conn) {
    conn.close();
  }

  conn = peer.connect(peerId, { reliable: true, serialization: "json" });

  conn.on("open", function () {
    console.log("Connected to:", peerId);
    document.getElementById(
      "status"
    ).innerHTML = `<span class="success">Connected to: ${peerId}</span>`;
    document.getElementById("sendBtn").disabled = false;
  });

  conn.on("data", handleIncomingMessage);
  conn.on("close", handleConnectionClose);
  conn.on("error", handleConnectionError);
}

peer.on("connection", function (connection) {
  if (conn) {
    conn.close();
  }

  conn = connection;
  console.log("Incoming connection from:", conn.peer);
  document.getElementById(
    "status"
  ).innerHTML = `<span class="success">Connected from: ${conn.peer}</span>`;
  document.getElementById("sendBtn").disabled = false;

  conn.on("data", handleIncomingMessage);
  conn.on("close", handleConnectionClose);
});

function handleIncomingMessage(data) {
  console.log("Received:", data);
  const received = document.getElementById("received");
  const now = new Date();
  const timeString = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Parse the incoming message (should be an object with username and message)
  let messageObj;
  try {
    messageObj = typeof data === "string" ? JSON.parse(data) : data;
  } catch (e) {
    // Fallback if message isn't properly formatted
    messageObj = {
      username: "Unknown",
      text: data,
    };
  }

  received.innerHTML += `
          <div class="message received">
            <div class="sender-name">${messageObj.username || "Unknown"}</div>
            <div class="text">${messageObj.text || messageObj}</div>
            <div class="timestamp">${timeString}</div>
          </div>
        `;
  received.scrollTop = received.scrollHeight;
}

function handleConnectionClose() {
  console.log("Connection closed");
  document.getElementById("status").innerHTML =
    '<span class="error">Connection closed</span>';
  document.getElementById("sendBtn").disabled = true;
  conn = null;
}

function handleConnectionError(err) {
  console.error("Connection error:", err);
  document.getElementById(
    "status"
  ).innerHTML = `<span class="error">Connection error: ${err.message}</span>`;
  document.getElementById("sendBtn").disabled = true;
  conn = null;
}

function sendMessage() {
  if (!conn || !conn.open) {
    document.getElementById("status").innerHTML =
      '<span class="error">No active connection</span>';
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
    // Send both username and message as an object
    const messageObj = {
      username: username,
      text: messageText,
    };

    conn.send(messageObj);
    console.log("Message sent:", messageObj);

    const received = document.getElementById("received");
    const now = new Date();
    const timeString = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    // Display sent message with username
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
