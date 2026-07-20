import { createRequest, getRequests, updateRequest } from "../controllers/Request.controller.js";
// import { deleteMessage, getMessages, sendMessage } from "../controllers/RequestChat.controller.js";
import { Router } from "express";
import { upload } from "../middlewares/Multer.middleware.js";

const router = Router();
router.post("/createRequest", upload.single("file"), createRequest);
// router.get("/getRequest", getRequests);
router.put("/updateRequest", updateRequest);
export default router;