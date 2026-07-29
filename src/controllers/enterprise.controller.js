import bcrypt from "bcrypt";
import mongoose from "mongoose";
import EnterpriseProfile from "../migrated-next/app/models/EnterpriseProfile.model.js";
import BrainTrainingFile from "../models/enterprise/BrainTrainingFile.model.js";
import EnterpriseBrainChunk from "../models/enterprise/EnterpriseBrainChunk.model.js";
import FlagWord from "../models/enterprise/FlagWord.model.js";
import UserFlag from "../models/enterprise/UserFlag.model.js";
import EnterpriseKpi from "../models/enterprise/EnterpriseKpi.model.js";
import EnterpriseCompliance from "../models/enterprise/EnterpriseCompliance.model.js";
import EnterprisePolicy from "../models/enterprise/EnterprisePolicy.model.js";
import MeetingTranscript from "../models/enterprise/MeetingTranscript.model.js";
import EnterpriseMeeting from "../models/enterprise/EnterpriseMeeting.model.js";
import MeetingModel from "../models/Meeting.model.js";
import EnterpriseKnock from "../models/enterprise/EnterpriseKnock.model.js";
import { ensureOwner, requireEnterpriseActor, canManageMember } from "../services/enterprise/enterpriseAccess.service.js";
import { buildOrgTree, getVisibleMembers } from "../services/enterprise/orgTree.service.js";
import { extractTextFromUpload, parseTrainingWords } from "../services/enterprise/brainIngestion.service.js";
import { processEnterpriseBrainFile } from "../migrated-next/app/api/enterprise/holo-assist/enterprise-brain-chunking.service.js";
import { getOverviewPayload } from "../services/enterprise/overviewMetrics.service.js";
import { scanTranscriptForFlags } from "../services/enterprise/transcriptFlagScanner.service.js";
import sendMail from "../utils/Nodemailer.js";

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(value);
const normalizeFlagWord = (word) => String(word || "").toLowerCase().replace(/[^\w\s'-]/g, "").trim();
const uniqueIds = (ids) => [...new Set(ids.filter(Boolean).map((id) => String(id)))];
const coachingMeetingId = () => `coach-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

const CATEGORY_MODELS = {
  kpi: EnterpriseKpi,
  compliance: EnterpriseCompliance,
  policies: EnterprisePolicy,
};

// Imports a BrainTrainingFile's content into whichever collection its
// category maps to: flag_words -> FlagWord ("Enterprise Flags", existing
// behavior). "brain" (Company Brain) has no dedicated collection - it only
// feeds EnterpriseBrainChunk via processEnterpriseBrainFile, so this is a
// no-op for it. kpi/compliance/policies are legacy categories kept only so
// old BrainTrainingFile documents still resolve; no new upload uses them.
const importBrainFileContent = async (brainFile, actor) => {
  if (brainFile.category === "flag_words" || !brainFile.category) {
    const words = parseTrainingWords(brainFile.extractedText);
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
    return words.length;
  }

  const Model = CATEGORY_MODELS[brainFile.category];
  if (!Model || !brainFile.extractedText) return 0;
  await Model.create({
    organizationId: actor.organization._id,
    sourceFileId: brainFile._id,
    title: brainFile.originalName,
    extractedText: brainFile.extractedText,
    createdBy: actor.id,
  });
  return 1;
};

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

const knockEmail = ({ fromName, message }) => `
  <div style="font-family:Arial,sans-serif;line-height:1.6;color:#18181b">
    <h2>${fromName} knocked on your door</h2>
    <p style="white-space:pre-wrap">${message}</p>
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
  } else if (!managerId) {
    target.parentId = null;
  } else {
    if (!isObjectId(managerId)) {
      return res.status(400).json({ success: false, error: "Invalid manager id" });
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

export const deleteEnterpriseUser = async (req, res) => {
  const actor = await requireEnterpriseActor(req, res);
  if (!actor) return;

  const { id } = req.params;
  if (!isObjectId(id)) return res.status(400).json({ success: false, error: "Invalid user id" });

  const target = await EnterpriseProfile.findOne({ _id: id, organizationId: actor.organization._id });
  if (!target) return res.status(404).json({ success: false, error: "Enterprise user not found" });
  if (!canManageMember(actor, target)) return res.status(403).json({ success: false, error: "You cannot manage this user" });

  let reassignedReps = 0;
  if (target.role === "manager") {
    if (!ensureOwner(actor, res)) return;
    const result = await EnterpriseProfile.updateMany(
      { organizationId: actor.organization._id, parentId: target._id },
      { $set: { parentId: null } },
    );
    reassignedReps = result.modifiedCount || 0;
  }

  await EnterpriseProfile.deleteOne({ _id: target._id });

  res.status(200).json({ success: true, data: { id: target._id, reassignedReps } });
};

export const knockEnterpriseUser = async (req, res) => {
  const actor = await requireEnterpriseActor(req, res);
  if (!actor) return;

  const { id } = req.params;
  const message = String(req.body.message || "").trim();
  if (!isObjectId(id)) return res.status(400).json({ success: false, error: "Invalid user id" });
  if (!message) return res.status(400).json({ success: false, error: "Message is required" });

  const target = await EnterpriseProfile.findOne({ _id: id, organizationId: actor.organization._id });
  if (!target) return res.status(404).json({ success: false, error: "Enterprise user not found" });
  if (!canManageMember(actor, target)) return res.status(403).json({ success: false, error: "You cannot message this user" });

  const fromName = actor.profile?.fullName || actor.member?.fullName || "Someone";

  const knock = await EnterpriseKnock.create({
    organizationId: actor.organization._id,
    targetUserId: target._id,
    fromId: actor.id,
    fromName,
    fromRole: actor.role,
    message,
  });

  if (process.env.BREVO_API_KEY && target.email) {
    sendMail(
      target.email,
      `${fromName} knocked on your door`,
      knockEmail({ fromName, message }),
    ).catch((error) => console.error("Enterprise knock email failed:", error.message));
  }

  res.status(201).json({ success: true, data: { id: knock._id, targetUserId: target._id } });
};

export const uploadBrainTrainingFile = async (req, res) => {
  const actor = await requireEnterpriseActor(req, res);
  if (!actor) return;
  if (!ensureOwner(actor, res)) return;

  const file = req.file;
  if (!file) return res.status(400).json({ success: false, error: "Training file is required" });

  const category = req.body.category === "brain" ? "brain" : "flag_words";

  const extractedText = await extractTextFromUpload(file);
  const words = category === "flag_words" ? parseTrainingWords(extractedText) : [];
  const brainFile = await BrainTrainingFile.create({
    organizationId: actor.organization._id,
    uploadedBy: actor.id,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    extractedText,
    fileData: file.buffer,
    category,
    status: extractedText ? "ready" : "failed",
    parseError: extractedText ? "" : "Only text, csv, json, markdown, PDF, XLSX, and DOCX files are parsed right now",
    flagWordCount: words.filter((word) => word.type === "flag").length,
    permittedWordCount: words.filter((word) => word.type === "permitted").length,
  });
  processEnterpriseBrainFile(brainFile)

  const itemsImported = await importBrainFileContent(brainFile, actor);

  const data = brainFile.toObject();
  delete data.fileData;
  res.status(201).json({ success: true, data, wordsImported: itemsImported });
};

export const getBrainTrainingFiles = async (req, res) => {
  const actor = await requireEnterpriseActor(req, res);
  if (!actor) return;
  const files = await BrainTrainingFile.find({
    organizationId: actor.organization._id,
    reviewStatus: { $nin: ["pending", "rejected"] },
  }).sort({ createdAt: -1 }).lean();
  res.status(200).json({ success: true, data: files });
};
// controllers/enterprise/brainTrainingController.js

export const deleteBrainTrainingFiles = async (req, res) => {
  try {
    // Get ID from query parameter or body
    const { id } = req.query; // If using query param: /enterprise/brain/files?id=123
    // OR
    // const { id } = req.body; // If using body
    // OR
    // const id = req.params.id; // If using URL param: /enterprise/brain/files/:id

    if (!id) {
      return res.status(400).json({
        success: false,
        error: "File ID is required"
      });
    }

    // Find the file
    const file = await BrainTrainingFile.findOne({
      _id: id
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        error: "File not found"
      });
    }

    // Delete associated chunks
    const deleteChunksResult = await EnterpriseBrainChunk.deleteMany({
      fileId: id,
    });

    console.log(`Deleted ${deleteChunksResult.deletedCount} chunks for file ${id}`);

    // Delete the file record
    await BrainTrainingFile.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "File and associated chunks deleted successfully",
      deletedChunks: deleteChunksResult.deletedCount
    });
  } catch (error) {
    console.error("Error deleting enterprise brain file:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to delete file"
    });
  }
};

// GET /enterprise/brain/files/:id/download - owner-only download of the
// original uploaded file bytes. Files uploaded before fileData was persisted
// for owner-direct uploads won't have a copy on record and return 404.
export const downloadBrainTrainingFile = async (req, res) => {
  const actor = await requireEnterpriseActor(req, res);
  if (!actor) return;
  if (!ensureOwner(actor, res)) return;

  const { id } = req.params;
  if (!isObjectId(id)) return res.status(400).json({ success: false, error: "Invalid file id" });

  const file = await BrainTrainingFile.findOne({
    _id: id,
    organizationId: actor.organization._id,
  }).select("+fileData");
  if (!file) return res.status(404).json({ success: false, error: "File not found" });
  if (!file.fileData) {
    return res.status(404).json({ success: false, error: "Original file is not available for this source" });
  }

  res.set("Content-Type", file.mimeType || "application/octet-stream");
  res.set("Content-Disposition", `attachment; filename="${encodeURIComponent(file.originalName)}"`);
  res.send(file.fileData);
};

// DELETE /enterprise/brain/files/:id - owner-only. Removes the source file
// and cascades to everything it fed: the chunked/retrieval text
// (EnterpriseBrainChunk) and whichever category collection its content was
// imported into (FlagWord for flag_words, or the matching KPI/Compliance/
// Policy record), mirroring importBrainFileContent's category mapping.
export const deleteBrainTrainingFile = async (req, res) => {
  const actor = await requireEnterpriseActor(req, res);
  if (!actor) return;
  if (!ensureOwner(actor, res)) return;

  const { id } = req.params;
  if (!isObjectId(id)) return res.status(400).json({ success: false, error: "Invalid file id" });

  const file = await BrainTrainingFile.findOneAndDelete({
    _id: id,
    organizationId: actor.organization._id,
  });
  if (!file) return res.status(404).json({ success: false, error: "File not found" });

  await EnterpriseBrainChunk.deleteMany({ fileId: file._id, organizationId: actor.organization._id });

  if (file.category === "flag_words" || !file.category) {
    await FlagWord.deleteMany({ sourceFileId: file._id, organizationId: actor.organization._id });
  } else {
    const Model = CATEGORY_MODELS[file.category];
    if (Model) {
      await Model.deleteMany({ sourceFileId: file._id, organizationId: actor.organization._id });
    }
  }

  res.status(200).json({ success: true, data: { id: file._id } });
};

// Manager -> owner "suggest a file for the Company Brain" workflow. Suggested
// files live in the same BrainTrainingFile collection as owner uploads (so
// accepting one just flips it into the normal Brain listing), but start life
// with reviewStatus "pending" and are excluded from brainSources/getBrainTrainingFiles
// until the owner reviews them.
export const suggestBrainTrainingFile = async (req, res) => {
  const actor = await requireEnterpriseActor(req, res);
  if (!actor) return;
  if (actor.role !== "manager") {
    return res.status(403).json({ success: false, error: "Only managers can suggest files to the owner" });
  }

  const file = req.file;
  if (!file) return res.status(400).json({ success: false, error: "A file is required" });

  const category = req.body.category === "brain" ? "brain" : "flag_words";

  const extractedText = await extractTextFromUpload(file);
  const words = category === "flag_words" ? parseTrainingWords(extractedText) : [];
  const suggestion = await BrainTrainingFile.create({
    organizationId: actor.organization._id,
    uploadedBy: actor.id,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    extractedText,
    category,
    fileData: file.buffer,
    status: extractedText ? "ready" : "failed",
    parseError: extractedText ? "" : "Only text, csv, json, markdown, PDF, XLSX, and DOCX files are parsed right now",
    flagWordCount: words.filter((word) => word.type === "flag").length,
    permittedWordCount: words.filter((word) => word.type === "permitted").length,
    reviewStatus: "pending",
    suggestedBy: actor.id,
    suggestedByName: actor.member?.fullName || "Manager",
    notes: String(req.body.notes || "").trim(),
  });

  const data = suggestion.toObject();
  delete data.fileData;
  res.status(201).json({ success: true, data });
};

// GET /enterprise/brain/suggestions
//  - owner   -> every suggestion in the organization (so they can see the
//               full review queue, including already-accepted/rejected ones)
//  - manager -> only their own suggestions, so status updates (accepted/
//               rejected) are visible back on their dashboard
//  - rep     -> not part of this workflow
export const getBrainSuggestions = async (req, res) => {
  const actor = await requireEnterpriseActor(req, res);
  if (!actor) return;
  if (actor.role === "rep") return res.status(200).json({ success: true, data: [] });

  const query = { organizationId: actor.organization._id, suggestedBy: { $ne: null } };
  if (actor.role === "manager") query.suggestedBy = actor.id;

  const suggestions = await BrainTrainingFile.find(query).sort({ createdAt: -1 }).lean();
  res.status(200).json({ success: true, data: suggestions });
};

export const getBrainSuggestionFile = async (req, res) => {
  const actor = await requireEnterpriseActor(req, res);
  if (!actor) return;

  const { id } = req.params;
  if (!isObjectId(id)) return res.status(400).json({ success: false, error: "Invalid suggestion id" });

  const suggestion = await BrainTrainingFile.findOne({
    _id: id,
    organizationId: actor.organization._id,
    suggestedBy: { $ne: null },
  }).select("+fileData");
  if (!suggestion || !suggestion.fileData) return res.status(404).json({ success: false, error: "File not found" });
  if (actor.role !== "owner" && String(suggestion.suggestedBy) !== String(actor.id)) {
    return res.status(403).json({ success: false, error: "You cannot view this file" });
  }

  res.set("Content-Type", suggestion.mimeType || "application/octet-stream");
  res.set("Content-Disposition", `inline; filename="${encodeURIComponent(suggestion.originalName)}"`);
  res.send(suggestion.fileData);
};

// PATCH /enterprise/brain/suggestions/:id  { action: "accept" | "reject" }
// Accepting flips reviewStatus to "accepted" (which makes it show up in
// brainSources/getBrainTrainingFiles like any owner-uploaded file) and imports
// its flag/permitted words, mirroring what uploadBrainTrainingFile already
// does for direct owner uploads.
export const reviewBrainSuggestion = async (req, res) => {
  const actor = await requireEnterpriseActor(req, res);
  if (!actor) return;
  if (!ensureOwner(actor, res)) return;

  const { id } = req.params;
  const { action } = req.body;
  if (!isObjectId(id) || !["accept", "reject"].includes(action)) {
    return res.status(400).json({ success: false, error: "Valid suggestion id and action (accept/reject) are required" });
  }

  const suggestion = await BrainTrainingFile.findOne({
    _id: id,
    organizationId: actor.organization._id,
    suggestedBy: { $ne: null },
  });
  if (!suggestion) return res.status(404).json({ success: false, error: "Suggestion not found" });

  suggestion.reviewStatus = action === "accept" ? "accepted" : "rejected";
  suggestion.reviewedBy = actor.id;
  suggestion.reviewedAt = new Date();
  await suggestion.save();

  if (action === "accept") {
    await importBrainFileContent(suggestion, actor);
    await processEnterpriseBrainFile(suggestion);
  }

  const data = suggestion.toObject();
  delete data.fileData;
  res.status(200).json({ success: true, data });
};

export const getFlagWords = async (req, res) => {
  const actor = await requireEnterpriseActor(req, res);
  if (!actor) return;
  if (actor.role === "rep") return res.status(200).json({ success: true, data: [] });
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

export const deleteFlagWord = async (req, res) => {
  const actor = await requireEnterpriseActor(req, res);
  if (!actor) return;
  if (!ensureOwner(actor, res)) return;

  const { id } = req.params;
  if (!isObjectId(id)) return res.status(400).json({ success: false, error: "Valid flag word id is required" });

  const deleted = await FlagWord.findOneAndDelete({
    _id: id,
    organizationId: actor.organization._id,
  });
  if (!deleted) return res.status(404).json({ success: false, error: "Flag word not found" });

  res.status(200).json({ success: true, data: { id } });
};

export const getEnterpriseFlags = async (req, res) => {
  const actor = await requireEnterpriseActor(req, res);
  if (!actor) return;

  const query = { organizationId: actor.organization._id };
  if (actor.role === "manager") query.managerId = actor.id;
  if (actor.role === "rep") query.flaggedMemberId = actor.id;
  const flags = await UserFlag.find(query)
    .populate("flaggedMemberId", "fullName email role parentId")
    .populate("speakerMemberId", "fullName email role parentId")
    .populate("flagWordId", "word type severity")
    .sort({ createdAt: -1 })
    .lean();
  res.status(200).json({ success: true, data: flags });
};

export const updateEnterpriseFlag = async (req, res) => {
  const actor = await requireEnterpriseActor(req, res);
  if (!actor) return;

  const { id } = req.params;
  const { status, coachingMeetingId } = req.body;
  const allowed = ["flagged", "manager_review", "rep_coached", "repaired", "resolved"];
  if (!isObjectId(id) || !allowed.includes(status)) {
    return res.status(400).json({ success: false, error: "Valid flag id and status are required" });
  }
  if (actor.role === "rep") return res.status(403).json({ success: false, error: "Reps cannot update flags" });

  const query = { _id: id, organizationId: actor.organization._id };
  if (actor.role === "manager") query.managerId = actor.id;
  const flag = await UserFlag.findOne(query);
  if (!flag) return res.status(404).json({ success: false, error: "Flag not found" });
  if (coachingMeetingId) flag.coachingMeetingId = String(coachingMeetingId).trim();

  if (status === "resolved") {
    if (!flag.coachingMeetingId) {
      return res.status(400).json({
        success: false,
        error: "A coaching meeting must be scheduled before resolving this flag",
      });
    }
  }

  flag.status = status;
  flag.resolvedAt = status === "resolved" ? new Date() : null;
  if (status === "rep_coached" && !flag.coachingScheduledAt) flag.coachingScheduledAt = new Date();
  if (flag.coachingMeetingId) {
    const coachingMeeting = await EnterpriseMeeting.findOne({
      organizationId: actor.organization._id,
      meetingId: flag.coachingMeetingId,
    }).select("_id").lean();
    flag.coachingEnterpriseMeetingId = coachingMeeting?._id || flag.coachingEnterpriseMeetingId;
  }
  await flag.save();
  await flag.populate("flaggedMemberId", "fullName email role parentId");
  await flag.populate("speakerMemberId", "fullName email role parentId");
  await flag.populate("flagWordId", "word type severity");
  res.status(200).json({ success: true, data: flag });
};

export const scanEnterpriseTranscript = async (req, res) => {
  const actor = await requireEnterpriseActor(req, res);
  if (!actor) return;

  const { meetingId } = req.params;
  const { text, participantMemberId, participantName, hostMemberId } = req.body;
  if (!meetingId || !text) return res.status(400).json({ success: false, error: "meetingId and text are required" });

  let speakerMemberId = participantMemberId && isObjectId(participantMemberId) ? participantMemberId : actor.member?._id;
  let speakerRole = actor.role === "manager" || actor.role === "rep" ? actor.role : null;
  if (speakerMemberId) {
    const speaker = await EnterpriseProfile.findOne({
      _id: speakerMemberId,
      organizationId: actor.organization._id,
    }).select("_id role").lean();
    if (speaker) {
      speakerMemberId = speaker._id;
      speakerRole = speaker.role === "manager" ? "manager" : "rep";
    }
  }

  const result = await scanTranscriptForFlags({
    organizationId: actor.organization._id,
    meetingId,
    text,
    participantMemberId: speakerMemberId,
    participantName,
    hostMemberId: hostMemberId && isObjectId(hostMemberId) ? hostMemberId : actor.member?._id,
    speakerMemberId,
    speakerRole,
  });
  res.status(201).json({ success: true, data: { transcript: result.transcript, flags: result.flags } });
};

// GET /enterprise/meetings
// Lists meetings hosted by anyone the actor can see:
//  - owner  -> every member in the organization
//  - manager -> themself + their direct reports
//  - rep/user -> just themself
// This was previously missing entirely, which is why owners/managers had no
// way to see meetings at all: the dashboard had /overview, /org-tree, and
// /flags, but nothing that lists the underlying Meeting documents scoped to
// the organization. Meeting.model.js has no organizationId field, so we
// resolve visibility the same way orgTree/overview do: find the member ids
// the actor may see, then query Meeting by hostId.
export const getEnterpriseMeetings = async (req, res) => {
  const actor = await requireEnterpriseActor(req, res);
  if (!actor) return;

  const query = { organizationId: actor.organization._id };
  if (actor.role === "manager") {
    const visibleMembers = await getVisibleMembers(actor);
    query.$or = [
      { hostMemberId: actor.id },
      { participantMemberIds: { $in: visibleMembers.map((member) => member._id) } },
    ];
  } else if (actor.role === "rep") {
    query.$or = [
      { hostMemberId: actor.id },
      { participantMemberIds: actor.id },
    ];
  }

  const meetings = await EnterpriseMeeting.find(query)
    .sort({ meetingDate: -1, createdAt: -1 })
    .populate("hostMemberId", "fullName email role")
    .populate("participantMemberIds", "fullName email role parentId")
    .populate("coachingFlagId", "matchedWord severity status flaggedMemberId")
    .lean();

  res.status(200).json({ success: true, data: meetings });
};

export const createEnterpriseCoachingMeeting = async (req, res) => {
  const actor = await requireEnterpriseActor(req, res);
  if (!actor) return;
  if (actor.role === "rep") return res.status(403).json({ success: false, error: "Reps cannot schedule coaching meetings" });

  const { flagId, participantMemberIds = [], participantEmails = [], meetingDate, meetingTitle } = req.body;
  const flagQuery = { organizationId: actor.organization._id };
  if (flagId && isObjectId(flagId)) flagQuery._id = flagId;
  if (actor.role === "manager") flagQuery.managerId = actor.id;

  const flag = flagId ? await UserFlag.findOne(flagQuery) : null;
  if (flagId && !flag) return res.status(404).json({ success: false, error: "Flag not found" });

  const requestedParticipantIds = uniqueIds([
    ...participantMemberIds,
    flag?.flaggedMemberId,
    actor.role === "manager" ? actor.id : null,
    actor.role === "owner" ? flag?.managerId : null,
  ]);

  if (!requestedParticipantIds.length) {
    return res.status(400).json({ success: false, error: "At least one coaching participant is required" });
  }

  const members = await EnterpriseProfile.find({
    _id: { $in: requestedParticipantIds },
    organizationId: actor.organization._id,
  }).select("_id fullName email role parentId").lean();

  if (members.length !== requestedParticipantIds.length) {
    return res.status(400).json({ success: false, error: "One or more participants were not found" });
  }

  const blocked = members.find((member) => !canManageMember(actor, member) && String(member._id) !== String(actor.id));
  if (blocked) return res.status(403).json({ success: false, error: "You cannot coach one or more selected participants" });

  const scheduledAt = meetingDate ? new Date(meetingDate) : new Date(Date.now() + 60 * 60 * 1000);
  if (Number.isNaN(scheduledAt.getTime())) {
    return res.status(400).json({ success: false, error: "meetingDate must be a valid date" });
  }

  const hostId = actor.role === "owner" ? actor.ownerId : actor.id;
  const hostName = actor.profile?.fullName || actor.member?.fullName || "Holovox Coach";
  const hostEmail = actor.profile?.email || actor.member?.email || "";
  const roomId = coachingMeetingId();
  const time = scheduledAt.toTimeString().slice(0, 5);
  const memberEmails = new Set(members.map((member) => String(member.email || "").toLowerCase()).filter(Boolean));
  const guestParticipants = uniqueIds(participantEmails)
    .map((email) => String(email || "").trim().toLowerCase())
    .filter((email) => email && !memberEmails.has(email) && email !== String(hostEmail || "").toLowerCase())
    .map((email) => ({
      name: email,
      email,
      role: "guest",
      end: false,
    }));

  const meeting = await MeetingModel.create({
    meetingId: roomId,
    hostId,
    meetingTitle: meetingTitle || `Coaching: ${members.map((member) => member.fullName).join(", ")}`,
    meetingDate: scheduledAt,
    time,
    upcoming: scheduledAt.getTime() > Date.now(),
    enterpriseMeetingPurpose: "coaching",
    enterpriseCoachingFlagId: flag?._id || null,
    participants: [
      { userId: hostId, name: hostName, email: hostEmail, role: "host" },
      ...members
        .filter((member) => String(member._id) !== String(hostId))
        .map((member) => ({
          userId: member._id,
          name: member.fullName,
          email: member.email,
          role: "participant",
          end: false,
        })),
      ...guestParticipants,
    ],
  });

  const enterpriseMeeting = await EnterpriseMeeting.findOneAndUpdate(
    { meetingId: roomId },
    {
      $set: {
        organizationId: actor.organization._id,
        normalMeetingId: meeting._id,
        hostUserId: actor.role === "owner" ? actor.ownerId : null,
        hostMemberId: actor.role === "manager" ? actor.id : null,
        hostRole: actor.role,
        enterpriseActorUserId: actor.role === "owner" ? actor.ownerId : null,
        enterpriseActorMemberId: actor.role === "manager" ? actor.id : null,
        enterpriseActorRole: actor.role,
        meetingTitle: meeting.meetingTitle,
        meetingPurpose: "coaching",
        coachingFlagId: flag?._id || null,
        meetingDate: scheduledAt,
        status: "created",
        participantMemberIds: members.map((member) => member._id),
      },
    },
    { new: true, upsert: true },
  )
    .populate("hostMemberId", "fullName email role")
    .populate("participantMemberIds", "fullName email role parentId");

  if (flag) {
    flag.coachingMeetingId = roomId;
    flag.coachingEnterpriseMeetingId = enterpriseMeeting._id;
    flag.coachingScheduledAt = scheduledAt;
    if (["flagged", "manager_review"].includes(flag.status)) flag.status = "rep_coached";
    await flag.save();
  }

  res.status(201).json({ success: true, data: enterpriseMeeting });
};

export const updateEnterpriseMeeting = async (req, res) => {
  const actor = await requireEnterpriseActor(req, res);
  if (!actor) return;
  if (actor.role === "rep") return res.status(403).json({ success: false, error: "Reps cannot manage coaching meetings" });

  const { meetingId } = req.params;
  const { status, meetingDate } = req.body;
  const allowedStatuses = ["created", "live", "ended", "processed"];
  if (!meetingId) return res.status(400).json({ success: false, error: "meetingId is required" });
  if (status && !allowedStatuses.includes(status)) {
    return res.status(400).json({ success: false, error: "Invalid meeting status" });
  }

  const meeting = await EnterpriseMeeting.findOne({
    organizationId: actor.organization._id,
    meetingId,
    meetingPurpose: "coaching",
  });
  if (!meeting) return res.status(404).json({ success: false, error: "Coaching meeting not found" });

  if (actor.role === "manager") {
    const visibleMembers = await getVisibleMembers(actor);
    const visibleIds = new Set(visibleMembers.map((member) => String(member._id)));
    const canManage =
      String(meeting.hostMemberId || "") === String(actor.id) ||
      (meeting.participantMemberIds || []).some((id) => visibleIds.has(String(id)));
    if (!canManage) return res.status(404).json({ success: false, error: "Coaching meeting not found" });
  }

  if (meetingDate) {
    const scheduledAt = new Date(meetingDate);
    if (Number.isNaN(scheduledAt.getTime())) {
      return res.status(400).json({ success: false, error: "meetingDate must be a valid date" });
    }
    meeting.meetingDate = scheduledAt;
  }

  if (status) {
    meeting.status = status;
    if (status === "live" && !meeting.startedAt) meeting.startedAt = new Date();
    if (status === "ended" || status === "processed") meeting.endedAt = meeting.endedAt || new Date();
  }
  await meeting.save();

  const normalMeetingUpdate = {};
  if (meetingDate) {
    normalMeetingUpdate.meetingDate = meeting.meetingDate;
    normalMeetingUpdate.time = meeting.meetingDate.toTimeString().slice(0, 5);
    normalMeetingUpdate.upcoming = meeting.meetingDate.getTime() > Date.now();
  }
  if (status === "live") normalMeetingUpdate.upcoming = false;
  if (status === "ended" || status === "processed") normalMeetingUpdate["participants.$[].end"] = true;
  if (Object.keys(normalMeetingUpdate).length) {
    await MeetingModel.updateOne({ meetingId }, { $set: normalMeetingUpdate });
  }

  const populated = await EnterpriseMeeting.findById(meeting._id)
    .populate("hostMemberId", "fullName email role")
    .populate("participantMemberIds", "fullName email role parentId")
    .lean();
  res.status(200).json({ success: true, data: populated });
};

// GET /enterprise/meetings/:meetingId
// Detail view for a single meeting: the Meeting document itself plus its
// enterprise transcript chunks and any flags raised against it, scoped to
// what the actor is allowed to see (managers only get flags with their own
// managerId, same rule as getEnterpriseFlags).
export const getEnterpriseMeetingDetail = async (req, res) => {
  const actor = await requireEnterpriseActor(req, res);
  if (!actor) return;

  const { meetingId } = req.params;
  if (!meetingId) {
    return res.status(400).json({ success: false, error: "meetingId is required" });
  }

  const enterpriseMeeting = await EnterpriseMeeting.findOne({
    organizationId: actor.organization._id,
    meetingId,
  })
    .populate("hostMemberId", "fullName email role")
    .populate("participantMemberIds", "fullName email role parentId")
    .lean();
  if (!enterpriseMeeting) {
    return res.status(404).json({ success: false, error: "Meeting not found" });
  }

  if (actor.role === "manager") {
    const visibleMembers = await getVisibleMembers(actor);
    const visibleIds = new Set(visibleMembers.map((member) => String(member._id)));
    const canSee =
      String(enterpriseMeeting.hostMemberId?._id || enterpriseMeeting.hostMemberId || "") === String(actor.id) ||
      (enterpriseMeeting.participantMemberIds || []).some((member) =>
        visibleIds.has(String(member._id || member)),
      );
    if (!canSee) return res.status(404).json({ success: false, error: "Meeting not found" });
  }

  if (actor.role === "rep") {
    const canSee =
      String(enterpriseMeeting.hostMemberId?._id || enterpriseMeeting.hostMemberId || "") === String(actor.id) ||
      (enterpriseMeeting.participantMemberIds || []).some((member) =>
        String(member._id || member) === String(actor.id),
      );
    if (!canSee) return res.status(404).json({ success: false, error: "Meeting not found" });
  }

  const meeting = await MeetingModel.findOne({ meetingId }).lean();
  const transcriptQuery = { organizationId: actor.organization._id, meetingId };
  const flagQuery = { organizationId: actor.organization._id, meetingId };
  if (actor.role === "manager") flagQuery.managerId = actor.id;

  const [transcripts, flags] = await Promise.all([
    MeetingTranscript.find(transcriptQuery).sort({ createdAt: 1 }).lean(),
    UserFlag.find(flagQuery)
      .populate("flaggedMemberId", "fullName email role parentId")
      .populate("flagWordId", "word type severity")
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  res.status(200).json({ success: true, data: { enterpriseMeeting, meeting, transcripts, flags } });
};
