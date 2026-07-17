import express from "express";
import {
  createEnterpriseRule,
  deleteEnterpriseRule,
  extractMeetingFlags,
  getEnterpriseManagerDashboard,
  getEnterpriseMeetingFlags,
  getEnterpriseMeetings,
  getEnterpriseOrgNodes,
  getEnterpriseOwnerDashboard,
  getEnterpriseRules,
  getEnterpriseUserDashboard,
  updateEnterpriseFlagStage,
} from "../controllers/Enterprise.controller.js";

const router = express.Router();

router.get("/org/:enterpriseId/nodes", getEnterpriseOrgNodes);

router.get("/rules", getEnterpriseRules);
router.post("/rules", createEnterpriseRule);
router.delete("/rules/:ruleId", deleteEnterpriseRule);

router.get("/meetings", getEnterpriseMeetings);
router.post("/meetings/:meetingId/extract-flags", extractMeetingFlags);
router.get("/meetings/:meetingId/flags", getEnterpriseMeetingFlags);

router.patch("/flags/:flagId/stage", updateEnterpriseFlagStage);

router.get("/dashboard/owner", getEnterpriseOwnerDashboard);
router.get("/dashboard/manager", getEnterpriseManagerDashboard);
router.get("/dashboard/user", getEnterpriseUserDashboard);

export default router;
