const socket = io();

const usernameInput = document.getElementById("username");
const registerBtn = document.getElementById("registerBtn");

const privateChatList = document.getElementById("privateChatList");
const groupChatList = document.getElementById("groupChatList");
const newGroupNameInput = document.getElementById("newGroupName");
const joinGroupBtn = document.getElementById("joinGroupBtn");
const leaveGroupBtn = document.getElementById("leaveGroupBtn");

const chatTitle = document.getElementById("chatTitle");
const chatMessages = document.getElementById("chatMessages");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");

let currentUsername = null;
let currentChat = null; // { type: 'private'|'group', id: string }
let chats = {
  private: {}, // { username: [messages] }
  group: {},   // { groupName: [messages] }
};
const receivedMessageIds = new Set();

function createChatListItem(id, type) {
  const li = document.createElement("li");
  li.textContent = id;
  li.className = "cursor-pointer rounded-md px-3 py-2 hover:bg-indigo-100 text-gray-700";
  li.addEventListener("click", () => selectChat(type, id));
  return li;
}

function selectChat(type, id) {
  currentChat = { type, id };
  chatTitle.textContent = type === "private" ? `Chat with ${id}` : `Group: ${id}`;
  messageInput.disabled = false;
  sendBtn.disabled = false;
  highlightActiveChat(id, type);
  renderMessages();
}

function highlightActiveChat(id, type) {
  const lists = { private: privateChatList, group: groupChatList };
  Object.entries(lists).forEach(([key, ul]) => {
    [...ul.children].forEach(li => {
      li.classList.toggle("bg-indigo-200", key === type && li.textContent === id);
    });
  });
}

function renderMessages() {
  chatMessages.innerHTML = "";
  if (!currentChat) return;
  const { type, id } = currentChat;
  const msgs = chats[type][id] || [];

  msgs.forEach(({ from, message, isSystem }) => {
    const wrapper = document.createElement("div");
    wrapper.className = `flex ${isSystem ? "justify-center" : from === currentUsername ? "justify-end" : "justify-start"}`;

    const bubble = document.createElement("div");
    bubble.textContent = message;
    bubble.className = "max-w-[70%] px-5 py-3 rounded-lg break-words shadow";

    if (isSystem) {
      bubble.classList.add("bg-gray-300", "text-gray-700", "italic", "text-center", "rounded-md");
    } else if (from === currentUsername) {
      bubble.classList.add("bg-indigo-600", "text-white", "rounded-br-none");
    } else {
      bubble.classList.add("bg-white", "border", "border-gray-300", "rounded-bl-none");
    }

    if (!isSystem && from !== currentUsername) {
      const sender = document.createElement("div");
      sender.textContent = from;
      sender.className = "text-xs text-gray-500 mb-1 select-none";
      wrapper.appendChild(sender);
    }

    wrapper.appendChild(bubble);
    chatMessages.appendChild(wrapper);
  });

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addMessage(type, chatId, from, message, opts = {}) {
  const { isSystem = false, id = null } = opts;
  if (id && receivedMessageIds.has(id)) return; // avoid duplicate
  if (id) receivedMessageIds.add(id);

  if (!chats[type][chatId]) chats[type][chatId] = [];
  chats[type][chatId].push({ from, message, isSystem, id });

  if (currentChat && currentChat.type === type && currentChat.id === chatId) {
    renderMessages();
  }

  if (type === "private") {
    if (![...privateChatList.children].some(li => li.textContent === chatId)) {
      privateChatList.appendChild(createChatListItem(chatId, "private"));
    }
  } else {
    if (![...groupChatList.children].some(li => li.textContent === chatId)) {
      groupChatList.appendChild(createChatListItem(chatId, "group"));
    }
  }
}

// Register user
registerBtn.onclick = () => {
  const username = usernameInput.value.trim();
  if (!username) return alert("Enter a username");
  currentUsername = username;
  socket.emit("register", username);
  alert(`Registered as ${username}`);
};

// Join / leave groups
joinGroupBtn.onclick = () => {
  const group = newGroupNameInput.value.trim();
  if (!group) return alert("Enter a group name");
  socket.emit("joinGroup", group);
};

leaveGroupBtn.onclick = () => {
  const group = newGroupNameInput.value.trim();
  if (!group) return alert("Enter a group name");
  socket.emit("leaveGroup", group);
};

// Send messages
sendBtn.onclick = () => {
  const msg = messageInput.value.trim();
  if (!msg || !currentChat) return;

  if (currentChat.type === "private") {
    socket.emit("privateMessage", { to: currentChat.id, message: msg });
  } else {
    socket.emit("groupMessage", { groupName: currentChat.id, message: msg });
  }
  messageInput.value = "";
};

messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault(); // prevent newline in input if multiline (if applicable)
    sendBtn.click();
  }
});

// Incoming private messages
socket.on("privateMessage", ({ id, from, message }) => {
  addMessage("private", from, from, message, { id });
});

// Incoming group messages
socket.on("groupMessage", ({ groupName, message }) => {
  const isSystem = message.isSystem || false;
  addMessage("group", groupName, message.from, message.message, { isSystem, id: message.id });
});

// Receive group chat history on join
socket.on("groupChatHistory", ({ groupName, history }) => {
  history.forEach(msg => {
    addMessage("group", groupName, msg.from, msg.message, { isSystem: msg.isSystem, id: msg.id });
  });
});
