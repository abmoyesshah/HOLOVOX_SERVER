import { Router } from "express";
import { getAnalytics } from "../controllers/Analytics.controller.js";

const router = Router();

router.get("/analytics/:hostId", getAnalytics);

export default router;
