import bcrypt from "bcrypt";
import mongoose from "mongoose";
import EnterpriseProfile from "../migrated-next/app/models/EnterpriseProfile.model.js";
import BrainTrainingFile from "../models/enterprise/BrainTrainingFile.model.js";
import FlagWord from "../models/enterprise/FlagWord.model.js";
import UserFlag from "../models/enterprise/UserFlag.model.js";
import { ensureOwner, requireEnterpriseActor, canManageMember } from "../services/enterprise/enterpriseAccess.service.js";
import { buildOrgTree } from "../services/enterprise/orgTree.service.js";
import { extractTextFromUpload, getDefaultTrainingWordType, parseTrainingWords } from "../services/enterprise/brainIngestion.service.js";
import { getOverviewPayload } from "../services/enterprise/overviewMetrics.service.js";
import { scanTranscriptForFlags } from "../services/enterprise/transcriptFlagScanner.service.js";
import sendMail from "../utils/Nodemailer.js";

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(value);
const normalizeFlagWord = (word) => String(word || "").toLowerCase().replace(/[^\w\s'-]/g, "").trim();

const generatedPasswordFallback = () =>
  Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 8).toUpperCase();

const welcomeEmail = ({ fullName, email, password, role }) => `
  <div style="font-family:Arial,sans-serif;line-height:1.6;color:#18181b">
    <h2>Welcome to Holovox Enterprise</h2>
    <p>Hello <strong>${fullName}</strong>,</p>
    <p>Your ${role === "manager" ? "manager" : "rep"} account has been created.</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Password:</strong> ${password}</p>
  </div>
`;

export const getEnterpriseOverview = async (req, res) => {
  const actor = await requireEnterpriseActor(req, res);
  if (!actor) return;
  res.status(200).json({ success: true, data: await getOverviewPayload(actor) });
};

export const getEnterpriseOrgTree = async (req, res) => {
  const actor = await requireEnterpriseActor(req, res);
  if (!actor) return;
  const tree = await buildOrgTree(actor);
  res.status(200).json({ success: true, data: { nodes: tree.nodes, edges: tree.edges } });
};

export const createEnterpriseUser = async (req, res) => {
  const actor = await requireEnterpriseActor(req, res);
  if (!actor) return;

  const { fullName, email, role = "user", password, managerId } = req.body;
  if (!fullName || !email) {
    return res.status(400).json({ success: false, error: "fullName and email are required" });
  }

  const normalizedRole = role === "manager" ? "manager" : "user";
  if (actor.role === "rep" || (actor.role === "manager" && normalizedRole === "manager")) {
    return res.status(403).json({ success: false, error: "You cannot create this enterprise role" });
  }

  const existingUser = await EnterpriseProfile.findOne({ email: email.toLowerCase().trim() });
  if (existingUser) {
    return res.status(409).json({ success: false, error: "User with this email already exists" });
  }

  let parentId = null;
  if (normalizedRole === "manager") {
    if (!ensureOwner(actor, res)) return;
  } else if (actor.role === "manager") {
    parentId = actor.id;
  } else if (managerId && isObjectId(managerId)) {
    const manager = await EnterpriseProfile.findOne({
      _id: managerId,
      organizationId: actor.organization._id,
      role: "manager",
    });
    if (!manager) return res.status(400).json({ success: false, error: "Selected manager was not found" });
    parentId = manager._id;
  }

  const plainPassword = password || generatedPasswordFallback();
  const newUser = await EnterpriseProfile.create({
    fullName: fullName.trim(),
    email: email.toLowerCase().trim(),
    password: await bcrypt.hash(plainPassword, 10),
    role: normalizedRole,
    enterpriseId: actor.ownerId,
    organizationId: actor.organization._id,
    parentId,
    isOtpVerified: true,
    isVerified: true,
    Subscription: normalizedRole === "manager" ? "enterprise-manager" : "enterprise-user",
    profilePicture: null,
    meetingUsed: false,
    status: "active",
  });

  if (process.env.BREVO_API_KEY) {
    sendMail(
      newUser.email,
      "Welcome to Holovox Enterprise - Your Login Credentials",
      welcomeEmail({ fullName: newUser.fullName, email: newUser.email, password: plainPassword, role: normalizedRole }),
    ).catch((error) => console.error("Enterprise welcome email failed:", error.message));
  }

  res.status(201).json({
    success: true,
    data: {
      id: newUser._id,
      fullName: newUser.fullName,
      email: newUser.email,
      role: newUser.role,
      parentId: newUser.parentId,
      subscription: newUser.Subscription,
    },
    message: process.env.BREVO_API_KEY
      ? "User added successfully. Credentials email is being sent."
      : "User added successfully. Email delivery is not configured.",
  });
};

export const reparentEnterpriseUser = async (req, res) => {
  const actor = await requireEnterpriseActor(req, res);
  if (!actor) return;

  const { id } = req.params;
  const { managerId } = req.body;
  if (!isObjectId(id)) return res.status(400).json({ success: false, error: "Invalid user id" });

  const target = await EnterpriseProfile.findOne({ _id: id, organizationId: actor.organization._id });
  if (!target) return res.status(404).json({ success: false, error: "Enterprise user not found" });
  if (!canManageMember(actor, target)) return res.status(403).json({ success: false, error: "You cannot manage this user" });

  if (target.role === "manager") {
    if (!ensureOwner(actor, res)) return;
    target.parentId = null;
  } else {
    if (!managerId || !isObjectId(managerId)) {
      return res.status(400).json({ success: false, error: "managerId is required for reps" });
    }
    const manager = await EnterpriseProfile.findOne({
      _id: managerId,
      organizationId: actor.organization._id,
      role: "manager",
    });
    if (!manager) return res.status(400).json({ success: false, error: "Manager not found" });
    target.parentId = manager._id;
  }

  await target.save();
  res.status(200).json({ success: true, data: { id: target._id, parentId: target.parentId } });
};

export const uploadBrainTrainingFile = async (req, res) => {
  const actor = await requireEnterpriseActor(req, res);
  if (!actor) return;
  if (!ensureOwner(actor, res)) return;

  const file = req.file;
  if (!file) return res.status(400).json({ success: false, error: "Training file is required" });

  let extractedText = "";
  let parseError = "";
  try {
    extractedText = await extractTextFromUpload(file);
  } catch (error) {
    parseError = error.message || "Failed to parse training file";
  }
  const words = parseTrainingWords(extractedText, getDefaultTrainingWordType(file.originalname));
  const brainFile = await BrainTrainingFile.create({
    organizationId: actor.organization._id,
    uploadedBy: actor.id,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    extractedText,
    status: extractedText ? "ready" : "failed",
    parseError: extractedText ? "" : parseError || "Only txt, csv, json, md, pdf, and xlsx files are parsed right now",
    flagWordCount: words.filter((word) => word.type === "flag").length,
    permittedWordCount: words.filter((word) => word.type === "permitted").length,
  });

  if (words.length) {
    await FlagWord.bulkWrite(
      words.map((word) => ({
        updateOne: {
          filter: { organizationId: actor.organization._id, normalizedWord: word.normalizedWord, type: word.type },
          update: {
            $set: {
              word: word.word,
              severity: word.severity,
              category: word.category,
              sourceFileId: brainFile._id,
              createdBy: actor.id,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false }
    );
  }

  res.status(201).json({ success: true, data: brainFile, wordsImported: words.length });
};

export const getBrainTrainingFiles = async (req, res) => {
  const actor = await requireEnterpriseActor(req, res);
  if (!actor) return;
  const files = await BrainTrainingFile.find({ organizationId: actor.organization._id }).sort({ createdAt: -1 }).lean();
  res.status(200).json({ success: true, data: files });
};

export const getFlagWords = async (req, res) => {
  const actor = await requireEnterpriseActor(req, res);
  if (!actor) return;
  if (actor.role === "rep") return res.status(403).json({ success: false, error: "Reps cannot view organization flag words" });
  const words = await FlagWord.find({ organizationId: actor.organization._id }).sort({ type: 1, word: 1 }).lean();
  res.status(200).json({ success: true, data: words });
};

export const createFlagWord = async (req, res) => {
  const actor = await requireEnterpriseActor(req, res);
  if (!actor) return;
  if (!ensureOwner(actor, res)) return;

  const { word, type = "flag", severity = "medium", category = "custom" } = req.body;
  const normalizedWord = normalizeFlagWord(word);
  if (!normalizedWord) return res.status(400).json({ success: false, error: "word is required" });

  const record = await FlagWord.findOneAndUpdate(
    { organizationId: actor.organization._id, normalizedWord, type: type === "permitted" ? "permitted" : "flag" },
    {
      word: String(word).trim(),
      normalizedWord,
      type: type === "permitted" ? "permitted" : "flag",
      severity,
      category,
      createdBy: actor.id,
    },
    { new: true, upsert: true }
  );
  res.status(201).json({ success: true, data: record });
};

export const getEnterpriseFlags = async (req, res) => {
  const actor = await requireEnterpriseActor(req, res);
  if (!actor) return;
  if (actor.role === "rep") return res.status(403).json({ success: false, error: "Reps cannot view flags" });

  const query = { organizationId: actor.organization._id };
  if (actor.role === "manager") query.managerId = actor.id;
  const flags = await UserFlag.find(query)
    .populate("flaggedMemberId", "fullName email role parentId")
    .populate("flagWordId", "word type severity")
    .sort({ createdAt: -1 })
    .lean();
  res.status(200).json({ success: true, data: flags });
};

export const updateEnterpriseFlag = async (req, res) => {
  const actor = await requireEnterpriseActor(req, res);
  if (!actor) return;

  const { id } = req.params;
  const { status } = req.body;
  const allowed = ["flagged", "manager_review", "rep_coached", "repaired", "resolved"];
  if (!isObjectId(id) || !allowed.includes(status)) {
    return res.status(400).json({ success: false, error: "Valid flag id and status are required" });
  }
  if (actor.role === "rep") return res.status(403).json({ success: false, error: "Reps cannot update flags" });

  const query = { _id: id, organizationId: actor.organization._id };
  if (actor.role === "manager") query.managerId = actor.id;
  const flag = await UserFlag.findOneAndUpdate(
    query,
    { status, resolvedAt: status === "resolved" ? new Date() : null },
    { new: true }
  );
  if (!flag) return res.status(404).json({ success: false, error: "Flag not found" });
  res.status(200).json({ success: true, data: flag });
};

export const scanEnterpriseTranscript = async (req, res) => {
  const actor = await requireEnterpriseActor(req, res);
  if (!actor) return;

  const { meetingId } = req.params;
  const { text, participantMemberId, participantName, hostMemberId } = req.body;
  if (!meetingId || !text) return res.status(400).json({ success: false, error: "meetingId and text are required" });

  const result = await scanTranscriptForFlags({
    organizationId: actor.organization._id,
    meetingId,
    text,
    participantMemberId: participantMemberId && isObjectId(participantMemberId) ? participantMemberId : actor.member?._id,
    participantName,
    hostMemberId: hostMemberId && isObjectId(hostMemberId) ? hostMemberId : actor.member?._id,
  });
  res.status(201).json({ success: true, data: { transcript: result.transcript, flags: result.flags } });
};
