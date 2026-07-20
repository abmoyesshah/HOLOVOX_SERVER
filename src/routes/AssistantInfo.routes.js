import { Router } from "express";
import { assitantInfo, getAssistantInfo, updateAssistantInfo } from "../controllers/AssistantInfo.controller.js";

const router = Router();
router.post("/send-assistant-info", assitantInfo);
router.get("/get-assistant-info/:userId",  getAssistantInfo);
router.put("/message/:userId", updateAssistantInfo);
export default router;