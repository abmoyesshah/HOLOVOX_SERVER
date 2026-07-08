import { Router } from "express";
import { exchangeToken, removeParticipant} from "../controllers/Token.controller.js";


const router = Router();

router.route("/token").post(exchangeToken);
router.post("/remove-participant", removeParticipant);

export default router;
