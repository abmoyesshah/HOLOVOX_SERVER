import { Router } from "express";
import {
  exchangeToken,
  removeParticipant,
  getWaitingList,
  admitParticipant,
  admitAllParticipants,
  denyParticipant,
  getWaitingStatus,
  setMeetingLock
} from "../controllers/Token.controller.js";

const router = Router();

router.route("/token").post(exchangeToken);
router.post("/remove-participant", removeParticipant);
router.get("/waiting-list/:roomId", getWaitingList);
router.get("/waiting-status/:roomId/:userId", getWaitingStatus);
router.post("/admit-participant", admitParticipant);
router.post("/admit-all", admitAllParticipants);
router.post("/deny-participant", denyParticipant);
router.post("/set-meeting-lock", setMeetingLock);


export default router;
