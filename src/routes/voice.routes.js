import { Router } from "express";
import { textToSpeech } from "../controllers/voice.controller.js";

const router = Router();
router.post("/voice", textToSpeech);
export default router;