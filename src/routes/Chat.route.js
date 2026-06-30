import { deleteMessage, getMessages, sendMessage } from "../controllers/Chat.controller.js";
import { upload } from "../middlewares/Multer.middleware.js";
import { Router } from "express";
const router = Router();
router.post("/message", upload.single("file"), sendMessage);
router.get("/message", getMessages);
router.delete("/message", deleteMessage);
export default router;