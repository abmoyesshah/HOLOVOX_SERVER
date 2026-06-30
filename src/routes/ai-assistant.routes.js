
import { holoAgent } from "../controllers/ai-assisant.controller.js";
import { upload } from "../middlewares/Multer.middleware.js";
import { Router } from "express";
const router = Router();
router.post("/ai-assistant", upload.single("file"), holoAgent);

export default router;