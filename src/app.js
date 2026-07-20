// app.js
import express, { urlencoded } from "express";
import cors from "cors";
import { connectDB } from "./db/DB.js";
const app = express();

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
  }
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "https://holovox.io",
      "https://www.holovox.io",
    ];

    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(null, true);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  credentials: false,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

import helmet from "helmet";
import rateLimit from "express-rate-limit";
import sendMail from "./utils/Nodemailer.js";

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
const meetingLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,            // ~2 requests/sec sustained, per IP
});
import compression from "compression";
import morgan from "morgan";

connectDB();

// app.js - Add this before your routes
app.get("/debug-env", (req, res) => {
  const apiKey = process.env.BREVO_API_KEY;
  res.json({
    apiKeyExists: !!apiKey,
    apiKeyLength: apiKey?.length || 0,
    apiKeyPrefix: apiKey?.substring(0, 15) || 'Not set',
    apiKeyFormat: apiKey?.startsWith('xkeysib-') ? '✅ Valid format' : '❌ Invalid format',
    emailFrom: process.env.EMAIL_FROM || 'Not set',
  });
});

app.get("/", (req, res) => {
  res.status(200).send("Welcome to Holovox API");
});
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development"
  });
});

app.use(express.json({ limit: '10mb' })); 
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static("public"));
app.use(helmet());
app.use(limiter);
app.use(compression());
app.use(morgan("dev"));

// Import routes
import ProfileRouter from "./routes/Profile.routes.js";
import RequestRouter from "./routes/Request.route.js";
import ChatRouter from "./routes/Chat.route.js";
import TokenRouter from "./routes/Token.route.js";
import MeetingRouter from "./routes/Meeting.routes.js";
import MeetingMxgRouter from "./routes/MeetingMxg.routes.js";
import UploadRecordingRouter from "./routes/uploadRecording.routes.js";
import AssistantInfoRouter from "./routes/AssistantInfo.routes.js";
import VoiceRouter from "./routes/voice.routes.js";
import AiAssistantRouter from "./routes/ai-assistant.routes.js";
import TranscribeLiveRouter from "./routes/transcribe-live.routes.js";
import AnalyticsRouter from "./routes/Analytics.routes.js";
import MigratedNextRouter from "./routes/migrated-next.routes.js";
import TranscriptRouter from "./routes/transcript.js"; // 👈 Import the new route
import EnterpriseRouter from "./routes/Enterprise.routes.js";

console.log("✅ All routes imported!"); // 👈 Add this
// Register routes
console.log("📝 Registering routes..."); // 👈 Add this
app.use("/api/v1/", ProfileRouter);
app.use("/api/v1/", RequestRouter);
app.use("/api/v1/", ChatRouter);
app.use("/api/v1/", TokenRouter);
app.use("/api/v1/", MeetingRouter); // 👈 This is where MeetingRouter is registered
app.use("/api/v1/", MeetingMxgRouter);
app.use("/api/v1/", AssistantInfoRouter);
app.use("/api/v1/", VoiceRouter);
app.use("/api/v1/", AiAssistantRouter);
app.use("/api/v1/", TranscribeLiveRouter);
app.use("/api/v1/", UploadRecordingRouter);
app.use("/api/v1/", AnalyticsRouter);
app.use("/api/v1/", EnterpriseRouter);
app.use("/", MigratedNextRouter);
app.use("/api/v1/", meetingLimiter, TokenRouter);
app.use("/api/v1/", meetingLimiter, MeetingRouter);
app.use("/api/v1/", meetingLimiter, MeetingMxgRouter);
app.use("/api/v1/", TranscriptRouter); // 👈 Register the new route

export default app;
