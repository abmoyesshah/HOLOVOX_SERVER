// src/routes/mic-audio.routes.js
import { Router } from "express";
import { upload } from "../middlewares/Multer.middleware.js";
import { uploadMicrophoneAudio, deleteMicrophoneAudio } from "../controllers/mic-audio.controller.js";
import { MicAudio } from "../models/dashboard-assist/MicAudio.js"; // 👈 import the model

const router = Router();

// POST – upload audio
router.post("/microphone-audio", upload.single("audio"), uploadMicrophoneAudio);

router.delete("/microphone-audio/:userId",deleteMicrophoneAudio)

// GET – fetch all saved audio entries (debugging only)
router.get("/microphone-audio", async (req, res) => {
  try {
    const all = await MicAudio.find();
    res.json(all);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;