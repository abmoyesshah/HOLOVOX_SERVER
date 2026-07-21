import express from "express";
import { sendTranscriptEmail, getMeetingTranscript } from "../controllers/transcriptController.js";

const router = express.Router();

// POST /api/v1/send-transcript
router.post("/send-transcript", sendTranscriptEmail);
router.get("/transcript/:roomId", getMeetingTranscript);


export default router;