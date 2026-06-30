import { Router } from "express";
import { exchangeToken } from "../controllers/Token.controller.js";


const router = Router();

router.route("/token").post(exchangeToken);
export default router;
