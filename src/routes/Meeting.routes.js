// src/routes/Meeting.routes.js
import { Router } from "express";
// ✅ Import controllers from the controller file
import { 
  createMeeting, 
  endMeeting, 
  getMeetings, 
  getUniqueParticipants, 
  joinMeeting, 
  shareMeeting, 
  updateMeeting, 
  validateMeeting 
} from "../controllers/Meeting.controller.js";

const router = Router();

// ✅ Test route
router.get("/test-meeting", (req, res) => {
  res.json({
    success: true,
    message: "Meeting routes are working!",
    routes: [
      "GET /test-meeting",
      "POST /createmeeting",
      "GET /getMeeting",
      "PUT /joinMeeting",
      "PUT /updateMeeting/:meetingId",
      "POST /shareMeetingLink",
      "GET /unique-participants/:hostId",
      "PUT /end-meeting/:roomId",
      "GET /validate-meeting/:roomId"
    ]
  });
});

// ✅ All routes
router.post("/createmeeting", createMeeting);
router.get("/getMeeting", getMeetings);
router.put("/joinMeeting", joinMeeting);
router.put("/updateMeeting/:meetingId", updateMeeting);
router.post("/shareMeetingLink", shareMeeting);
router.get("/unique-participants/:hostId", getUniqueParticipants);
router.put("/end-meeting/:roomId", endMeeting);
router.get("/validate-meeting/:roomId", validateMeeting);

// ✅ MUST have default export
export default router;