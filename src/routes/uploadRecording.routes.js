import { Router } from "express";
import { createRecording, deleteRecording, getRecordings } from "../controllers/UploadRecording.controller.js";


const router = Router();

router.post("/createRecording", createRecording);
router.get("/getRecording/:userId", getRecordings);
router.delete("/delRecording", deleteRecording);
export default router;
