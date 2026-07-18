import express from "express";
import { upload } from "../middlewares/Multer.middleware.js";
import {
  createEnterpriseUser,
  createFlagWord,
  getBrainTrainingFiles,
  getEnterpriseFlags,
  getEnterpriseOrgTree,
  getEnterpriseOverview,
  getFlagWords,
  reparentEnterpriseUser,
  scanEnterpriseTranscript,
  updateEnterpriseFlag,
  uploadBrainTrainingFile,
} from "../controllers/Enterprise.controller.js";

const router = express.Router();

router.get("/enterprise/overview", getEnterpriseOverview);
router.get("/enterprise/org-tree", getEnterpriseOrgTree);
router.post("/enterprise/users", createEnterpriseUser);
router.patch("/enterprise/users/:id/manager", reparentEnterpriseUser);

router.get("/enterprise/brain/files", getBrainTrainingFiles);
router.post("/enterprise/brain/files", upload.single("file"), uploadBrainTrainingFile);

router.get("/enterprise/flag-words", getFlagWords);
router.post("/enterprise/flag-words", createFlagWord);

router.get("/enterprise/flags", getEnterpriseFlags);
router.patch("/enterprise/flags/:id", updateEnterpriseFlag);
router.post("/enterprise/transcripts/:meetingId/scan", scanEnterpriseTranscript);

export default router;
