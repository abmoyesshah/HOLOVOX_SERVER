import express from "express";
import { sendTranscriptEmail } from "../controllers/transcriptController.js";

const router = express.Router();

// POST /api/v1/send-transcript
router.post("/send-transcript", sendTranscriptEmail);

export default router;