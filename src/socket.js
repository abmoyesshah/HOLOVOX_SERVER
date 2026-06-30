import { Server } from "socket.io";

let io;

export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*",
    },
  });

  io.on("connection", (socket) => {
    console.log("🟢 User connected:", socket.id);

    const userId = socket.handshake.query.userId;

    if (userId) {
      socket.join(userId);
      console.log(`User ${userId} joined room`);
    }

    socket.on("disconnect", () => {
      console.log("🔴 User disconnected");
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) throw new Error("Socket not initialized");
  return io;
};