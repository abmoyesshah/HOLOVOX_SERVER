// src/index.js
import app from "./app.js";
import dotenv from "dotenv";
import http from "http";
import { connectDB } from "./db/DB.js";

dotenv.config({
  path: "./env",
});

const server = http.createServer(app);

// ✅ IMPORTANT: Use PORT from environment
const PORT = process.env.PORT || 5000;

console.log(`🚀 Starting server on port ${PORT}...`);

connectDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`✅ Server is running on port ${PORT}`);
      console.log(`🔗 Local: http://localhost:${PORT}`);
      console.log(`🔗 Health: http://localhost:${PORT}/health`);
      console.log(`🔗 Test: http://localhost:${PORT}/api/v1/test-meeting`);
    });
  })
  .catch((error) => {
    console.log("❌ MongoDB connection failed:", error);
    process.exit(1);
  });

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, closing server...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});