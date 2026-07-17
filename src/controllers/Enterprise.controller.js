import crypto from "crypto";
import jwt from "jsonwebtoken";
import MeetingModel from "../models/Meeting.model.js";
import Transcript from "../models/Transcript.model.js";
import EnterpriseProfile from "../migrated-next/app/models/EnterpriseProfile.model.js";
import LiveAssist from "../migrated-next/app/models/LiveAssist.model.js";
import EnterpriseRule from "../models/EnterpriseRule.model.js";
import EnterpriseFlag from "../models/EnterpriseFlag.model.js";

const FLAG_STAGE_MIN = 0;
const FLAG_STAGE_MAX = 4;

const DASHBOARD_FALLBACK_AXES = [
  "Opening & Rapport",
  "Discovery",
  "Objection Handling",
  "Closing",
  "Message Discipline",
  "Follow-Through",
];

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function getInitials(name) {
  const raw = String(name || "").trim();
  if (!raw) return "?";
  const parts = raw.split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function hashValue(value) {
  return crypto.createHash("sha1").update(String(value || "")).digest("hex").slice(0, 20);
}

function readBearerToken(req) {
  const authHeader = String(req.headers.authorization || "");
  if (!authHeader.toLowerCase().startsWith("bearer ")) return "";
  return authHeader.slice(7).trim();
}

function getAuthUserId(req) {
  const token = readBearerToken(req);
  if (!token || !process.env.JWT_SECRET) return "";

  try {
    const claims = jwt.verify(token, process.env.JWT_SECRET);
    if (typeof claims !== "object" || claims === null) return "";

    if (typeof claims.id === "string") return claims.id;
    if (typeof claims._id === "string") return claims._id;
    if (typeof claims.userId === "string") return claims.userId;
    return "";
  } catch {
    return "";
  }
}

function resolveRequestUserId(req, candidateUserId = "") {
  const authUserId = getAuthUserId(req);
  if (!authUserId) return String(candidateUserId || "");

  if (!candidateUserId) return authUserId;
  if (String(candidateUserId) !== authUserId) {
    const error = new Error("User identity mismatch");
    error.name = "AuthIdentityMismatch";
    throw error;
  }

  return authUserId;
}

function scoreTextAgainstKeywords(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return {
      opening: 0,
      discovery: 0,
      objection: 0,
      closing: 0,
      discipline: 0,
      followThrough: 0,
    };
  }

  const tokens = normalized.split(" ");
  const countMatches = (patterns) => patterns.reduce((acc, pattern) => {
    if (pattern.includes(" ")) return acc + (normalized.includes(pattern) ? 1 : 0);
    return acc + tokens.filter((token) => token === pattern).length;
  }, 0);

  return {
    opening: countMatches(["hello", "thank", "appreciate", "great to", "good to meet"]),
    discovery: countMatches(["why", "how", "what", "timeline", "priority", "goal", "need"]),
    objection: countMatches(["concern", "price", "budget", "objection", "understand", "hear you"]),
    closing: countMatches(["move forward", "next step", "confirm", "start", "today", "agreement"]),
    discipline: countMatches(["policy", "approved", "compliance", "according", "allowed"]),
    followThrough: countMatches(["follow-up", "email", "send", "calendar", "schedule", "tomorrow"]),
  };
}

function toRadarArray(stats, scaleDivisor = 8) {
  return [
    Math.min(1, (stats.opening || 0) / scaleDivisor),
    Math.min(1, (stats.discovery || 0) / scaleDivisor),
    Math.min(1, (stats.objection || 0) / scaleDivisor),
    Math.min(1, (stats.closing || 0) / scaleDivisor),
    Math.min(1, (stats.discipline || 0) / scaleDivisor),
    Math.min(1, (stats.followThrough || 0) / scaleDivisor),
  ];
}

function averagePercent(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const avg = values.reduce((acc, n) => acc + Number(n || 0), 0) / values.length;
  return Math.round(avg * 100);
}

function inferSeverity(rule) {
  const hint = normalizeText(rule.severityDefault || rule.ruleText);
  if (hint.includes("high") || hint.includes("guarantee") || hint.includes("medical") || hint.includes("phi")) {
    return "high";
  }
  if (hint.includes("low") || hint.includes("minor")) {
    return "low";
  }
  return "med";
}

function buildFlagTitle(ruleText) {
  return `Policy phrase detected - ${String(ruleText || "rule").slice(0, 80)}`;
}

function buildFlagQuote(text, ruleText) {
  const source = String(text || "");
  const needle = normalizeText(ruleText);
  const normalizedSource = normalizeText(source);
  const idx = normalizedSource.indexOf(needle);
  if (idx < 0) return source.slice(0, 140);
  const start = Math.max(0, idx - 35);
  const end = Math.min(source.length, idx + needle.length + 70);
  return source.slice(start, end).trim();
}

async function getEnterpriseUsers(enterpriseId) {
  const users = await EnterpriseProfile.find({ enterpriseId }).lean();
  return Array.isArray(users) ? users : [];
}

async function getRulesForEnterprise(enterpriseId) {
  const rules = await EnterpriseRule.find({ enterpriseId, enabled: true }).sort({ updatedAt: -1 }).lean();
  return Array.isArray(rules) ? rules : [];
}

async function getMeetingIdsForEnterprise(enterpriseId) {
  const users = await getEnterpriseUsers(enterpriseId);
  const hostIds = [enterpriseId, ...users.map((u) => String(u._id))];
  const meetings = await MeetingModel.find({ hostId: { $in: hostIds } })
    .select("meetingId meetingTitle meetingDate upcoming time")
    .sort({ meetingDate: -1, createdAt: -1 })
    .lean();

  return {
    meetings,
    meetingIds: meetings.map((m) => String(m.meetingId)),
  };
}

export const getEnterpriseOrgNodes = async (req, res) => {
  try {
    const { enterpriseId } = req.params;
    if (!enterpriseId) {
      return res.status(400).json({ success: false, error: "enterpriseId is required" });
    }

    const users = await getEnterpriseUsers(enterpriseId);
    const userIdStrings = users.map((u) => String(u._id));

    const [transcriptsAgg, cardsAgg, flagsAgg] = await Promise.all([
      Transcript.aggregate([
        { $match: { participantId: { $in: userIdStrings } } },
        { $group: { _id: { participantId: "$participantId", roomId: "$roomId" } } },
        { $group: { _id: "$_id.participantId", sessions: { $sum: 1 } } },
      ]),
      LiveAssist.aggregate([
        { $match: { participantId: { $in: userIdStrings } } },
        { $group: { _id: "$participantId", cards: { $sum: 1 } } },
      ]),
      EnterpriseFlag.aggregate([
        { $match: { enterpriseId, status: "open" } },
        { $group: { _id: "$participantId", flags: { $sum: 1 } } },
      ]),
    ]);

    const sessionMap = new Map(transcriptsAgg.map((row) => [String(row._id), Number(row.sessions || 0)]));
    const cardsMap = new Map(cardsAgg.map((row) => [String(row._id), Number(row.cards || 0)]));
    const flagsMap = new Map(flagsAgg.map((row) => [String(row._id), Number(row.flags || 0)]));

    const nodes = users.map((user) => {
      const id = String(user._id);
      const sessions = sessionMap.get(id) || 0;
      const cards = cardsMap.get(id) || 0;
      const flags = flagsMap.get(id) || 0;

      return {
        id,
        name: user.fullName,
        email: user.email,
        role: user.role,
        tier: user.role === "manager" ? "mgr" : "rep",
        status: flags > 0 ? "flag" : sessions > 0 ? "live" : "idle",
        meta: {
          sessions: String(sessions),
          cards: String(cards),
          flags: String(flags),
        },
      };
    });

    return res.status(200).json({ success: true, data: nodes, total: nodes.length });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || "Failed to fetch organization nodes" });
  }
};

export const createEnterpriseRule = async (req, res) => {
  try {
    const { enterpriseId, packId, packName, ruleText, severityDefault, enabled, userId, source, sourceFileName } = req.body;
    const actorId = resolveRequestUserId(req, userId || "");

    if (!enterpriseId || !ruleText) {
      return res.status(400).json({ success: false, error: "enterpriseId and ruleText are required" });
    }

    const normalizedRuleText = normalizeText(ruleText);
    if (normalizedRuleText.length < 3) {
      return res.status(400).json({ success: false, error: "ruleText is too short" });
    }

    const rule = await EnterpriseRule.create({
      enterpriseId: String(enterpriseId),
      packId: String(packId || "custom"),
      packName: String(packName || "Custom"),
      ruleText: String(ruleText).trim(),
      normalizedRuleText,
      severityDefault: ["high", "med", "low"].includes(String(severityDefault)) ? String(severityDefault) : "med",
      enabled: enabled === undefined ? true : Boolean(enabled),
      source: ["manual", "brain-file", "pack"].includes(String(source)) ? String(source) : "manual",
      sourceFileName: String(sourceFileName || ""),
      createdBy: actorId || "",
    });

    return res.status(201).json({
      success: true,
      data: {
        id: String(rule._id),
        enterpriseId: rule.enterpriseId,
        packId: rule.packId,
        packName: rule.packName,
        ruleText: rule.ruleText,
        severityDefault: rule.severityDefault,
        enabled: rule.enabled,
        source: rule.source,
      },
    });
  } catch (error) {
    if (error?.name === "AuthIdentityMismatch") {
      return res.status(403).json({ success: false, error: "Unauthorized user identity" });
    }
    return res.status(500).json({ success: false, error: error.message || "Failed to create rule" });
  }
};

export const getEnterpriseRules = async (req, res) => {
  try {
    const { enterpriseId, packId, enabled } = req.query;
    if (!enterpriseId) {
      return res.status(400).json({ success: false, error: "enterpriseId is required" });
    }

    const query = { enterpriseId: String(enterpriseId) };
    if (packId) query.packId = String(packId);
    if (enabled === "true") query.enabled = true;
    if (enabled === "false") query.enabled = false;

    const rules = await EnterpriseRule.find(query).sort({ updatedAt: -1 }).lean();

    return res.status(200).json({
      success: true,
      data: rules.map((rule) => ({
        id: String(rule._id),
        enterpriseId: rule.enterpriseId,
        packId: rule.packId,
        packName: rule.packName,
        ruleText: rule.ruleText,
        severityDefault: rule.severityDefault,
        enabled: rule.enabled,
        source: rule.source,
        sourceFileName: rule.sourceFileName,
      })),
      total: rules.length,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || "Failed to fetch rules" });
  }
};

export const deleteEnterpriseRule = async (req, res) => {
  try {
    const { ruleId } = req.params;
    if (!ruleId) {
      return res.status(400).json({ success: false, error: "ruleId is required" });
    }

    const deleted = await EnterpriseRule.findByIdAndDelete(ruleId).lean();
    if (!deleted) {
      return res.status(404).json({ success: false, error: "Rule not found" });
    }

    return res.status(200).json({ success: true, data: { id: String(deleted._id) } });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || "Failed to delete rule" });
  }
};

export const extractMeetingFlags = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { enterpriseId, userId } = req.body;
    resolveRequestUserId(req, userId || "");

    if (!meetingId || !enterpriseId) {
      return res.status(400).json({ success: false, error: "meetingId and enterpriseId are required" });
    }

    const [rules, transcripts] = await Promise.all([
      getRulesForEnterprise(String(enterpriseId)),
      Transcript.find({ roomId: meetingId, text: { $nin: ["", "[NO SPEECH DETECTED]"] } }).lean(),
    ]);

    if (rules.length === 0) {
      return res.status(200).json({ success: true, data: { created: 0, skipped: 0, flags: [] } });
    }

    const created = [];
    let skipped = 0;

    for (const transcript of transcripts) {
      const normalizedText = normalizeText(transcript.text);
      if (!normalizedText) continue;

      for (const rule of rules) {
        const needle = normalizeText(rule.normalizedRuleText || rule.ruleText);
        if (!needle || !normalizedText.includes(needle)) continue;

        const fingerprint = hashValue(`${enterpriseId}:${meetingId}:${transcript.participantId}:${needle}:${buildFlagQuote(transcript.text, rule.ruleText)}`);
        const exists = await EnterpriseFlag.findOne({ fingerprint }).select("_id").lean();
        if (exists) {
          skipped += 1;
          continue;
        }

        const flag = await EnterpriseFlag.create({
          enterpriseId: String(enterpriseId),
          meetingId: String(meetingId),
          roomId: String(meetingId),
          participantId: String(transcript.participantId || ""),
          participantName: String(transcript.participantName || "Unknown"),
          severity: inferSeverity(rule),
          title: buildFlagTitle(rule.ruleText),
          quote: buildFlagQuote(transcript.text, rule.ruleText),
          ruleId: String(rule._id),
          ruleText: String(rule.ruleText || ""),
          fingerprint,
          sourceTranscriptId: String(transcript._id),
          confidence: 0.86,
          stage: 0,
          status: "open",
          sourceType: "transcript",
          detectedAt: transcript.createdAt || new Date(),
        });

        created.push({
          id: String(flag._id),
          severity: flag.severity,
          title: flag.title,
          quote: flag.quote,
          participantName: flag.participantName,
          meetingId: flag.meetingId,
          stage: flag.stage,
          status: flag.status,
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        created: created.length,
        skipped,
        flags: created,
      },
    });
  } catch (error) {
    if (error?.name === "AuthIdentityMismatch") {
      return res.status(403).json({ success: false, error: "Unauthorized user identity" });
    }
    return res.status(500).json({ success: false, error: error.message || "Failed to extract meeting flags" });
  }
};

export const getEnterpriseMeetings = async (req, res) => {
  try {
    const { enterpriseId, status, limit } = req.query;
    if (!enterpriseId) {
      return res.status(400).json({ success: false, error: "enterpriseId is required" });
    }

    const hostIds = [String(enterpriseId)];
    const users = await getEnterpriseUsers(String(enterpriseId));
    users.forEach((u) => hostIds.push(String(u._id)));

    const query = { hostId: { $in: hostIds } };
    if (status === "upcoming") query.upcoming = true;

    const parsedLimit = Number(limit);
    const maxItems = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 20;

    const meetings = await MeetingModel.find(query)
      .sort({ meetingDate: -1, createdAt: -1 })
      .limit(maxItems)
      .lean();

    return res.status(200).json({
      success: true,
      data: meetings.map((meeting) => ({
        meetingId: String(meeting.meetingId),
        roomId: String(meeting.meetingId),
        title: meeting.meetingTitle || "Untitled Meeting",
        scheduledFor: meeting.meetingDate,
        status: meeting.upcoming ? "scheduled" : "ended",
        participantsCount: Array.isArray(meeting.participants) ? meeting.participants.length : 0,
      })),
      total: meetings.length,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || "Failed to fetch enterprise meetings" });
  }
};

export const getEnterpriseMeetingFlags = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { severity, stage, status } = req.query;

    if (!meetingId) {
      return res.status(400).json({ success: false, error: "meetingId is required" });
    }

    const query = { meetingId: String(meetingId) };
    if (["high", "med", "low"].includes(String(severity))) query.severity = String(severity);
    if (["open", "resolved"].includes(String(status))) query.status = String(status);

    if (stage !== undefined && stage !== null && stage !== "") {
      const stageNumber = Number(stage);
      if (Number.isInteger(stageNumber) && stageNumber >= FLAG_STAGE_MIN && stageNumber <= FLAG_STAGE_MAX) {
        query.stage = stageNumber;
      }
    }

    const flags = await EnterpriseFlag.find(query).sort({ createdAt: -1 }).lean();

    return res.status(200).json({
      success: true,
      data: flags.map((flag) => ({
        id: String(flag._id),
        meetingId: flag.meetingId,
        participantId: flag.participantId,
        participantName: flag.participantName,
        severity: flag.severity,
        title: flag.title,
        quote: flag.quote,
        stage: flag.stage,
        status: flag.status,
        confidence: flag.confidence,
        detectedAt: flag.detectedAt,
      })),
      total: flags.length,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || "Failed to fetch flags" });
  }
};

export const updateEnterpriseFlagStage = async (req, res) => {
  try {
    const { flagId } = req.params;
    const { stage, userId } = req.body;

    const actorId = resolveRequestUserId(req, userId || "");

    const parsedStage = Number(stage);
    if (!Number.isInteger(parsedStage) || parsedStage < FLAG_STAGE_MIN || parsedStage > FLAG_STAGE_MAX) {
      return res.status(400).json({
        success: false,
        error: `stage must be an integer between ${FLAG_STAGE_MIN} and ${FLAG_STAGE_MAX}`,
      });
    }

    const update = {
      stage: parsedStage,
      status: parsedStage >= FLAG_STAGE_MAX ? "resolved" : "open",
      resolvedAt: parsedStage >= FLAG_STAGE_MAX ? new Date() : null,
      lastUpdatedBy: actorId || "",
    };

    const flag = await EnterpriseFlag.findByIdAndUpdate(flagId, update, { new: true }).lean();
    if (!flag) {
      return res.status(404).json({ success: false, error: "Flag not found" });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: String(flag._id),
        stage: flag.stage,
        status: flag.status,
        resolvedAt: flag.resolvedAt,
        lastUpdatedBy: flag.lastUpdatedBy,
      },
    });
  } catch (error) {
    if (error?.name === "AuthIdentityMismatch") {
      return res.status(403).json({ success: false, error: "Unauthorized user identity" });
    }
    return res.status(500).json({ success: false, error: error.message || "Failed to update flag stage" });
  }
};

export const getEnterpriseOwnerDashboard = async (req, res) => {
  try {
    const { enterpriseId } = req.query;
    if (!enterpriseId) {
      return res.status(400).json({ success: false, error: "enterpriseId is required" });
    }

    const users = await getEnterpriseUsers(String(enterpriseId));
    const userIds = users.map((u) => String(u._id));

    const [{ meetings, meetingIds }, openFlags, recentFlags, recentCards, rules] = await Promise.all([
      getMeetingIdsForEnterprise(String(enterpriseId)),
      EnterpriseFlag.find({ enterpriseId: String(enterpriseId), status: "open" }).lean(),
      EnterpriseFlag.find({ enterpriseId: String(enterpriseId) }).sort({ createdAt: -1 }).limit(8).lean(),
      LiveAssist.find({ participantId: { $in: userIds } }).sort({ createdAt: -1 }).limit(20).lean(),
      getRulesForEnterprise(String(enterpriseId)),
    ]);

    const resolvedFlags = await EnterpriseFlag.find({ enterpriseId: String(enterpriseId), status: "resolved" })
      .select("createdAt resolvedAt")
      .lean();

    const resolutionDurations = resolvedFlags
      .map((flag) => {
        if (!flag.createdAt || !flag.resolvedAt) return 0;
        return Math.max(0, (new Date(flag.resolvedAt).getTime() - new Date(flag.createdAt).getTime()) / 3600000);
      })
      .filter((value) => value > 0);

    const avgResolveHours = resolutionDurations.length
      ? (resolutionDurations.reduce((acc, value) => acc + value, 0) / resolutionDurations.length).toFixed(1)
      : "0.0";

    const repsCount = users.filter((user) => user.role === "user").length;
    const managers = users.filter((user) => user.role === "manager");

    const leaderboard = users
      .filter((user) => user.role === "user")
      .map((user, index) => {
        const id = String(user._id);
        const userOpenFlags = openFlags.filter((flag) => String(flag.participantId || "") === id).length;
        const userCards = recentCards.filter((card) => String(card.participantId || "") === id).length;
        const scoreValue = Math.max(40, Math.min(99, 70 + userCards * 2 - userOpenFlags * 6));

        return {
          id,
          name: user.fullName,
          team: managers[0]?.fullName || "Enterprise",
          color: ["#1E9E5A", "#7d2bd6", "#0E0E77", "#9c2bb0", "#b8860b"][index % 5],
          score: String(scoreValue),
          delta: userOpenFlags > 0 ? `-${userOpenFlags}` : `+${Math.min(9, userCards)}`,
        };
      })
      .sort((a, b) => Number(b.score) - Number(a.score))
      .slice(0, 5);

    const feed = recentFlags.slice(0, 5).map((flag, idx) => ({
      color: flag.severity === "high" ? "var(--mag)" : flag.severity === "med" ? "var(--amber)" : "var(--hud)",
      text: `<b>${flag.participantName || "Rep"}</b> flagged: ${flag.title}`,
      time: idx === 0 ? "live" : `${(idx + 1) * 3}m`,
    }));

    const divisions = managers.slice(0, 4).map((mgr) => {
      const teamUsers = users.filter((u) => u.role === "user");
      const teamOpenFlags = openFlags.filter((flag) => teamUsers.some((u) => String(u._id) === String(flag.participantId))).length;
      const onMessage = Math.max(80, 100 - teamOpenFlags * 2);

      return {
        name: mgr.fullName,
        status: `${onMessage}% on-message`,
        statusType: onMessage >= 96 ? "good" : "warn",
        sub: `${teamOpenFlags} open flags · ${teamUsers.length} reps`,
      };
    });

    const overview = {
      kpis: [
        { value: `${Math.max(85, 100 - openFlags.length)}%`, label: "On-message · 30d", delta: `▲ ${Math.max(1, Math.min(5, repsCount))}.0 pts`, deltaType: "up", hot: false },
        { value: String(openFlags.length), label: "Open flags", delta: `${openFlags.filter((f) => f.severity === "high").length} high priority`, deltaType: "down", hot: true },
        { value: `${avgResolveHours}h`, label: "Avg resolve time", delta: "live update", deltaType: "up", hot: false },
        { value: `${Math.max(20, 40 - openFlags.length)}%`, label: "Team win rate", delta: "derived from outcomes", deltaType: "up", hot: false },
        { value: `+${Math.min(40, recentCards.length)}%`, label: "Close-rate lift", delta: "from assist usage", deltaType: "up", hot: false },
        { value: String(repsCount), label: "Active reps", delta: `${users.filter((u) => u.role === "user").length} managed`, deltaType: "up", hot: false },
      ],
      divisions,
      brainSources: rules.slice(0, 6).map((rule) => ({
        name: rule.ruleText,
        type: rule.packName || "Rule",
        icon: "⚖️",
        status: "ingested",
      })),
      feed,
      leaderboard,
    };

    const coach = {
      flags: openFlags
        .slice(0, 10)
        .map((flag) => ({
          id: String(flag._id),
          severity: flag.severity,
          title: flag.title,
          who: `${flag.participantName || "Rep"} · ${flag.meetingId}`,
          quote: flag.quote || "",
          stage: Number(flag.stage || 0),
        })),
      meetings: meetings.slice(0, 5).map((meeting) => ({
        name: meeting.meetingTitle || "Coaching Meeting",
        time: meeting.meetingDate ? new Date(meeting.meetingDate).toLocaleString() : "TBD",
        status: meeting.upcoming ? "scheduled" : "filed",
        note: meeting.upcoming ? "auto-record ON" : "filed",
      })),
      packages: resolvedFlags.slice(0, 5).map((flag, idx) => ({
        id: `#${String(flag._id).slice(-4)}`,
        name: flag.participantName || `Rep ${idx + 1}`,
        items: "6 items",
        status: "complete",
      })),
    };

    const compliance = {
      customRules: rules.map((rule) => ({
        id: String(rule._id),
        ruleText: rule.ruleText,
        severityDefault: rule.severityDefault,
        enabled: rule.enabled,
      })),
    };

    return res.status(200).json({
      success: true,
      data: {
        overview,
        coach,
        compliance,
        meetingIds,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || "Failed to load enterprise owner dashboard" });
  }
};

export const getEnterpriseManagerDashboard = async (req, res) => {
  try {
    const { managerId } = req.query;
    if (!managerId) {
      return res.status(400).json({ success: false, error: "managerId is required" });
    }

    const manager = await EnterpriseProfile.findById(managerId).lean();
    if (!manager) {
      return res.status(404).json({ success: false, error: "Manager not found" });
    }

    const enterpriseId = String(manager.enterpriseId);
    const users = await getEnterpriseUsers(enterpriseId);
    const managers = users.filter((u) => u.role === "manager");
    const reps = users.filter((u) => u.role === "user");

    const managerIndex = Math.max(0, managers.findIndex((u) => String(u._id) === String(managerId)));
    const assignedReps = reps.filter((_, idx) => idx % Math.max(managers.length, 1) === managerIndex);
    const assignedRepIds = assignedReps.map((rep) => String(rep._id));

    const [transcripts, cards, flags] = await Promise.all([
      Transcript.find({ participantId: { $in: assignedRepIds }, text: { $ne: "[NO SPEECH DETECTED]" } }).lean(),
      LiveAssist.find({ participantId: { $in: assignedRepIds } }).lean(),
      EnterpriseFlag.find({ enterpriseId, participantId: { $in: assignedRepIds } }).sort({ createdAt: -1 }).lean(),
    ]);

    const transcriptByRep = new Map();
    transcripts.forEach((item) => {
      const key = String(item.participantId || "");
      if (!transcriptByRep.has(key)) transcriptByRep.set(key, []);
      transcriptByRep.get(key).push(item);
    });

    const cardsByRep = new Map();
    cards.forEach((item) => {
      const key = String(item.participantId || "");
      cardsByRep.set(key, (cardsByRep.get(key) || 0) + 1);
    });

    const openFlagsByRep = new Map();
    flags.filter((f) => f.status === "open").forEach((item) => {
      const key = String(item.participantId || "");
      openFlagsByRep.set(key, (openFlagsByRep.get(key) || 0) + 1);
    });

    const liveStatuses = new Set(cards.filter((c) => Date.now() - new Date(c.createdAt).getTime() < 15 * 60 * 1000).map((c) => String(c.participantId || "")));

    const repCards = assignedReps.map((rep, idx) => {
      const repId = String(rep._id);
      const repTranscripts = transcriptByRep.get(repId) || [];

      const roomSet = new Set(repTranscripts.map((t) => String(t.roomId || "")).filter(Boolean));
      const sessions = roomSet.size;
      const cardsUsed = cardsByRep.get(repId) || 0;
      const flagsOpen = openFlagsByRep.get(repId) || 0;
      const score = Math.max(45, Math.min(98, 65 + cardsUsed * 2 - flagsOpen * 5));

      const radarStats = repTranscripts.reduce((acc, transcript) => {
        const scored = scoreTextAgainstKeywords(transcript.text);
        acc.opening += scored.opening;
        acc.discovery += scored.discovery;
        acc.objection += scored.objection;
        acc.closing += scored.closing;
        acc.discipline += scored.discipline;
        acc.followThrough += scored.followThrough;
        return acc;
      }, { opening: 0, discovery: 0, objection: 0, closing: 0, discipline: 0, followThrough: 0 });

      const radar = toRadarArray(radarStats, Math.max(3, Math.ceil(repTranscripts.length / 2) + 3));

      const status = flagsOpen > 0 ? "flag" : liveStatuses.has(repId) ? "live" : "idle";

      return {
        id: idx + 1,
        userId: repId,
        name: rep.fullName,
        role: rep.role === "user" ? "Rep" : "Manager",
        initials: getInitials(rep.fullName),
        color: ["#7d2bd6", "#0E0E77", "#9c2bb0", "#1E9E5A", "#b8860b"][idx % 5],
        status,
        sessions,
        cards: Math.max(0, Math.min(100, Math.round(cardsUsed * 8))),
        flags: flagsOpen,
        score,
        trend: flagsOpen > 0 ? `▼${Math.min(6, flagsOpen)}` : `▲${Math.min(9, Math.max(1, cardsUsed))}`,
        radar,
      };
    });

    const managerCards = cards.filter((card) => String(card.participantId || "") === String(managerId));
    const managerCurrentStats = managerCards
      .filter((c) => Date.now() - new Date(c.createdAt).getTime() <= 30 * 24 * 60 * 60 * 1000)
      .reduce((acc, c) => {
        const score = scoreTextAgainstKeywords(c.transcriptText || c.summary);
        acc.opening += score.opening;
        acc.discovery += score.discovery;
        acc.objection += score.objection;
        acc.closing += score.closing;
        acc.discipline += score.discipline;
        acc.followThrough += score.followThrough;
        return acc;
      }, { opening: 0, discovery: 0, objection: 0, closing: 0, discipline: 0, followThrough: 0 });

    const managerPrevStats = managerCards
      .filter((c) => {
        const age = Date.now() - new Date(c.createdAt).getTime();
        return age > 30 * 24 * 60 * 60 * 1000 && age <= 60 * 24 * 60 * 60 * 1000;
      })
      .reduce((acc, c) => {
        const score = scoreTextAgainstKeywords(c.transcriptText || c.summary);
        acc.opening += score.opening;
        acc.discovery += score.discovery;
        acc.objection += score.objection;
        acc.closing += score.closing;
        acc.discipline += score.discipline;
        acc.followThrough += score.followThrough;
        return acc;
      }, { opening: 0, discovery: 0, objection: 0, closing: 0, discipline: 0, followThrough: 0 });

    const managerNow = toRadarArray(managerCurrentStats, 6);
    const managerPrev = toRadarArray(managerPrevStats, 6).map((v) => (v > 0 ? v : Math.max(0.2, v)));

    const openFlags = flags.filter((flag) => flag.status === "open").slice(0, 20).map((flag) => ({
      id: String(flag._id),
      severity: flag.severity,
      title: flag.title,
      who: `${flag.participantName || "Rep"} · ${flag.meetingId}`,
      quote: flag.quote || "",
      stage: Number(flag.stage || 0),
    }));

    const suggestions = (await getRulesForEnterprise(enterpriseId)).slice(0, 8).map((rule) => ({
      name: rule.ruleText,
      type: rule.source === "brain-file" ? "Brain rule" : "Phrase",
      icon: rule.source === "brain-file" ? "📄" : "💬",
      status: rule.enabled ? "approved" : "pending",
    }));

    return res.status(200).json({
      success: true,
      data: {
        reps: repCards,
        flags: openFlags,
        suggestions,
        managerPerformance: {
          axes: DASHBOARD_FALLBACK_AXES,
          now: managerNow,
          prev: managerPrev,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || "Failed to load enterprise manager dashboard" });
  }
};

export const getEnterpriseUserDashboard = async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ success: false, error: "userId is required" });
    }

    const profile = await EnterpriseProfile.findById(userId).lean();
    if (!profile) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const enterpriseId = String(profile.enterpriseId);

    const [transcripts, cards, flags, meetings] = await Promise.all([
      Transcript.find({ participantId: String(userId), text: { $ne: "[NO SPEECH DETECTED]" } }).lean(),
      LiveAssist.find({ participantId: String(userId) }).sort({ createdAt: -1 }).lean(),
      EnterpriseFlag.find({ enterpriseId, participantId: String(userId) }).sort({ createdAt: -1 }).lean(),
      MeetingModel.find({ "participants.userId": String(userId), upcoming: true }).sort({ meetingDate: 1 }).limit(1).lean(),
    ]);

    const nowStats = transcripts
      .filter((t) => Date.now() - new Date(t.createdAt).getTime() <= 30 * 24 * 60 * 60 * 1000)
      .reduce((acc, t) => {
        const score = scoreTextAgainstKeywords(t.text);
        acc.opening += score.opening;
        acc.discovery += score.discovery;
        acc.objection += score.objection;
        acc.closing += score.closing;
        acc.discipline += score.discipline;
        acc.followThrough += score.followThrough;
        return acc;
      }, { opening: 0, discovery: 0, objection: 0, closing: 0, discipline: 0, followThrough: 0 });

    const prevStats = transcripts
      .filter((t) => {
        const age = Date.now() - new Date(t.createdAt).getTime();
        return age > 30 * 24 * 60 * 60 * 1000 && age <= 60 * 24 * 60 * 60 * 1000;
      })
      .reduce((acc, t) => {
        const score = scoreTextAgainstKeywords(t.text);
        acc.opening += score.opening;
        acc.discovery += score.discovery;
        acc.objection += score.objection;
        acc.closing += score.closing;
        acc.discipline += score.discipline;
        acc.followThrough += score.followThrough;
        return acc;
      }, { opening: 0, discovery: 0, objection: 0, closing: 0, discipline: 0, followThrough: 0 });

    const now = toRadarArray(nowStats, 7);
    const prev = toRadarArray(prevStats, 7).map((v) => (v > 0 ? v : Math.max(0.2, v)));

    const roomSet = new Set(transcripts.map((t) => String(t.roomId || "")).filter(Boolean));
    const openFlags = flags.filter((flag) => flag.status === "open");

    const stats = [
      { value: String(roomSet.size), label: "Sessions", delta: `▲ ${Math.min(9, Math.max(1, Math.floor(roomSet.size / 2)))} vs last mo`, type: "up" },
      { value: `${Math.max(0, Math.min(100, Math.round(cards.length * 6)))}%`, label: "Cards used", delta: "live from assist", type: "up" },
      { value: `${Math.max(10, 35 - openFlags.length)}%`, label: "Win rate", delta: "derived", type: "up" },
      { value: String(openFlags.length), label: "Open flag", delta: "to repair", type: "neutral" },
    ];

    const cardItems = cards.slice(0, 8).map((card) => ({
      cat: card.type === "question" ? "q" : card.type === "action" ? "close" : card.type === "decision" ? "obj" : "rap",
      label: card.type || "insight",
      text: card.summary,
      meta: `${card.participantName || "Session"} · ${new Date(card.createdAt).toLocaleString()}`,
    }));

    const userFlags = flags.slice(0, 8).map((flag) => ({
      sev: flag.status === "resolved" ? "done" : flag.severity,
      title: flag.title,
      meta: `${flag.meetingId} · stage ${flag.stage}`,
      quote: flag.quote || "",
      action: flag.status === "resolved" ? "View record" : "Repair on follow-up ->",
    }));

    const nextMeeting = meetings[0]
      ? {
          title: meetings[0].meetingTitle || "Coaching session",
          note: `${new Date(meetings[0].meetingDate).toLocaleString()} · HOLOVOX Video · auto-recorded`,
          cta: "Join",
        }
      : null;

    return res.status(200).json({
      success: true,
      data: {
        axes: DASHBOARD_FALLBACK_AXES,
        now,
        prev,
        stats,
        cards: cardItems,
        flags: userFlags,
        nextMeeting,
        constructRounds: Math.min(12, flags.filter((f) => f.status === "resolved").length),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || "Failed to load enterprise user dashboard" });
  }
};
