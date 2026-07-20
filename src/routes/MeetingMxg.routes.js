import { Router } from "express";
import { upload } from "../middlewares/Multer.middleware.js";
import { createMessage, deleteMessage, getMessages, updateMessage } from "../controllers/MeetingMxg.controller.js";

const router = Router();

// 📩 create message (with file)
router.post("/meetingMessages", upload.single("file"), createMessage);

// 📥 get messages
router.get("/getMeetingMessages", getMessages);

// ✏️ edit message
router.put("/updateMeetingMessages", updateMessage);

// 🗑 delete message
router.delete("/deleteMeetingMessages", deleteMessage);

export default router;