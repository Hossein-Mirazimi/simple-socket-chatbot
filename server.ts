import express from "express";
import http from "http";
import { Server, Socket } from "socket.io";

interface ChatMessage {
  id: string;
  from: string;
  message: string;
  isSystem?: boolean;
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

// Serve static files from 'public'
app.use(express.static("public"));

const users = new Map<string, string>(); // username -> socket.id
const groups = new Map<string, Set<string>>(); // groupName -> usernames
const groupChatHistory = new Map<string, ChatMessage[]>(); // groupName -> messages

io.on("connection", (socket: Socket) => {
  console.log("User connected:", socket.id);

  socket.on("register", (username: string) => {
    users.set(username, socket.id);
    socket.data.username = username;
    console.log(`Registered user: ${username}`);
  });

  socket.on("joinGroup", (groupName: string) => {
    socket.join(groupName);
    if (!groups.has(groupName)) {
      groups.set(groupName, new Set());
      groupChatHistory.set(groupName, []);
    }
    groups.get(groupName)?.add(socket.data.username);

    // Send history to joining user
    const history = groupChatHistory.get(groupName) || [];
    socket.emit("groupChatHistory", { groupName, history });

    // System join message
    const joinMsg: ChatMessage = {
      id: `sys-join-${socket.id}-${Date.now()}`,
      from: "system",
      message: `${socket.data.username} joined the group.`,
      isSystem: true,
    };
    groupChatHistory.set(groupName, [...history, joinMsg]);

    io.to(groupName).emit("groupMessage", { groupName, message: joinMsg });
  });

  socket.on("leaveGroup", (groupName: string) => {
    socket.leave(groupName);
    groups.get(groupName)?.delete(socket.data.username);

    const leaveMsg: ChatMessage = {
      id: `sys-leave-${socket.id}-${Date.now()}`,
      from: "system",
      message: `${socket.data.username} left the group.`,
      isSystem: true,
    };
    const history = groupChatHistory.get(groupName) || [];
    groupChatHistory.set(groupName, [...history, leaveMsg]);

    io.to(groupName).emit("groupMessage", { groupName, message: leaveMsg });
  });

  socket.on("groupMessage", ({ groupName, message }: { groupName: string; message: string }) => {
    if (!groupChatHistory.has(groupName)) groupChatHistory.set(groupName, []);

    const msg: ChatMessage = {
      id: `msg-${socket.id}-${Date.now()}`,
      from: socket.data.username,
      message,
    };
    groupChatHistory.get(groupName)!.push(msg);

    io.to(groupName).emit("groupMessage", { groupName, message: msg });
  });

  socket.on("privateMessage", ({ to, message }: { to: string; message: string }) => {
    const toSocketId = users.get(to);
    if (toSocketId) {
      const msgId = `pm-${socket.id}-${Date.now()}`;
      io.to(toSocketId).emit("privateMessage", {
        id: msgId,
        from: socket.data.username,
        message,
      });
      // Also emit to sender for consistency
      socket.emit("privateMessage", {
        id: msgId,
        from: socket.data.username,
        message,
      });
    }
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.data.username}`);
    users.delete(socket.data.username);
    groups.forEach((members, groupName) => {
      if (members.delete(socket.data.username)) {
        const disconnectMsg: ChatMessage = {
          id: `sys-disconnect-${socket.id}-${Date.now()}`,
          from: "system",
          message: `${socket.data.username} disconnected.`,
          isSystem: true,
        };
        const history = groupChatHistory.get(groupName) || [];
        groupChatHistory.set(groupName, [...history, disconnectMsg]);
        io.to(groupName).emit("groupMessage", { groupName, message: disconnectMsg });
      }
    });
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
