import express from "express";
import { upload } from "../middlewares/Multer.middleware.js";
import {
  createEnterpriseUser,
  createFlagWord,
  deleteFlagWord,
  getBrainTrainingFiles,
  getEnterpriseFlags,
  getEnterpriseMeetingDetail,
  getEnterpriseMeetings,
  getEnterpriseOrgTree,
  getEnterpriseOverview,
  getFlagWords,
  reparentEnterpriseUser,
  scanEnterpriseTranscript,
  updateEnterpriseFlag,
  uploadBrainTrainingFile,
} from "../controllers/enterprise.controller.js";

const router = express.Router();

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

router.get("/enterprise/overview", asyncRoute(getEnterpriseOverview));
router.get("/enterprise/org-tree", asyncRoute(getEnterpriseOrgTree));
router.post("/enterprise/users", asyncRoute(createEnterpriseUser));
router.patch("/enterprise/users/:id/manager", asyncRoute(reparentEnterpriseUser));

router.get("/enterprise/brain/files", asyncRoute(getBrainTrainingFiles));
router.post("/enterprise/brain/files", upload.single("file"), asyncRoute(uploadBrainTrainingFile));

router.get("/enterprise/flag-words", asyncRoute(getFlagWords));
router.post("/enterprise/flag-words", asyncRoute(createFlagWord));
router.delete("/enterprise/flag-words/:id", asyncRoute(deleteFlagWord));

router.get("/enterprise/flags", asyncRoute(getEnterpriseFlags));
router.patch("/enterprise/flags/:id", asyncRoute(updateEnterpriseFlag));
router.post("/enterprise/transcripts/:meetingId/scan", asyncRoute(scanEnterpriseTranscript));
router.get("/enterprise/meetings", asyncRoute(getEnterpriseMeetings));
router.get("/enterprise/meetings/:meetingId", asyncRoute(getEnterpriseMeetingDetail));

router.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error("Enterprise route error:", error);
  return res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || "Enterprise request failed",
  });
});

export default router;