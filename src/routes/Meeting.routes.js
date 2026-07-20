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
  shareQuotation,
  updateMeeting, 
  validateMeeting,
  deleteMeeting,
  checkMeetingPassword,
setMeetingPassword,
getDeletedMeetings,
deleteMeetingForever,
recoverMeeting,
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
      "POST /shareQuotation",
      "DELETE /deleteMeetingForever/:meetingId",
      "POST /recoverMeeting/:meetingId",
      "GET /unique-participants/:hostId",
      "PUT /end-meeting/:roomId",
      "GET /validate-meeting/:roomId",
      "DELETE /deleteMeeting",
      "GET /getDeletedMeetings",
    ]
  });
});

// ✅ All routes
router.post("/createmeeting", createMeeting);
router.get("/getMeeting", getMeetings);
router.get("/getDeletedMeetings", getDeletedMeetings);
router.put("/joinMeeting", joinMeeting);
router.put("/updateMeeting/:meetingId", updateMeeting);
router.post("/shareMeetingLink", shareMeeting);
router.post("/shareQuotation", shareQuotation);
router.post("/recoverMeeting/:meetingId", recoverMeeting);
router.delete("/deleteMeetingForever/:meetingId", deleteMeetingForever);
router.get("/unique-participants/:hostId", getUniqueParticipants);
router.put("/end-meeting/:roomId", endMeeting);
router.get("/validate-meeting/:roomId", validateMeeting);
router.get("/meeting-password/:roomId", checkMeetingPassword);
router.put("/meeting-password/:roomId", setMeetingPassword);
router.delete('/meeting', deleteMeeting);

// ✅ MUST have default export
export default router;


// // src/routes/Meeting.routes.js
// import { Router } from "express";
// // ✅ Import controllers from the controller file
// import { 
//   createMeeting, 
//   endMeeting, 
//   getMeetings, 
//   getUniqueParticipants, 
//   joinMeeting, 
//   shareMeeting, 
//   updateMeeting, 
//   validateMeeting 
// } from "../controllers/Meeting.controller.js";

// const router = Router();

// // ✅ Test route
// router.get("/test-meeting", (req, res) => {
//   res.json({
//     success: true,
//     message: "Meeting routes are working!",
//     routes: [
//       "GET /test-meeting",
//       "POST /createmeeting",
//       "GET /getMeeting",
//       "PUT /joinMeeting",
//       "PUT /updateMeeting/:meetingId",
//       "POST /shareMeetingLink",
//       "GET /unique-participants/:hostId",
//       "PUT /end-meeting/:roomId",
//       "GET /validate-meeting/:roomId"
//     ]
//   });
// });

// // ✅ All routes
// router.post("/createmeeting", createMeeting);
// router.get("/getMeeting", getMeetings);
// router.put("/joinMeeting", joinMeeting);
// router.put("/updateMeeting/:meetingId", updateMeeting);
// router.post("/shareMeetingLink", shareMeeting);
// router.get("/unique-participants/:hostId", getUniqueParticipants);
// router.put("/end-meeting/:roomId", endMeeting);
// router.get("/validate-meeting/:roomId", validateMeeting);

// // ✅ MUST have default export
// export default router;
