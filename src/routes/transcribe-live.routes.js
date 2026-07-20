import { Router } from "express";
import { transcribeAudio } from "../controllers/transcribe-live.controller.js";
// import { assitantInfo, getAssistantInfo, updateAssistantInfo } from "../controllers/AssistantInfo.controller.js";

const router = Router();
router.post("/transcribe-live", transcribeAudio);

export default router;