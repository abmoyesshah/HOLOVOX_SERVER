import bcrypt from "bcrypt";
import mongoose from "mongoose";
import EnterpriseProfile from "../migrated-next/app/models/EnterpriseProfile.model.js";
import BrainTrainingFile from "../models/enterprise/BrainTrainingFile.model.js";
import FlagWord from "../models/enterprise/FlagWord.model.js";
import UserFlag from "../models/enterprise/UserFlag.model.js";
import MeetingTranscript from "../models/enterprise/MeetingTranscript.model.js";
import EnterpriseMeeting from "../models/enterprise/EnterpriseMeeting.model.js";
import MeetingModel from "../models/Meeting.model.js";
import { ensureOwner, requireEnterpriseActor, canManageMember } from "../services/enterprise/enterpriseAccess.service.js";
import { buildOrgTree, getVisibleMembers } from "../services/enterprise/orgTree.service.js";
import { extractTextFromUpload, parseTrainingWords } from "../services/enterprise/brainIngestion.service.js";
import { getOverviewPayload } from "../services/enterprise/overviewMetrics.service.js";
import { scanTranscriptForFlags } from "../services/enterprise/transcriptFlagScanner.service.js";
import sendMail from "../utils/Nodemailer.js";

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(value);
const normalizeFlagWord = (word) => String(word || "").toLowerCase().replace(/[^\w\s'-]/g, "").trim();
const uniqueIds = (ids) => [...new Set(ids.filter(Boolean).map((id) => String(id)))];
const coachingMeetingId = () => `coach-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

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

  const extractedText = await extractTextFromUpload(file);
  const words = parseTrainingWords(extractedText);
  const brainFile = await BrainTrainingFile.create({
    organizationId: actor.organization._id,
    uploadedBy: actor.id,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    extractedText,
    status: extractedText ? "ready" : "failed",
    parseError: extractedText ? "" : "Only text, csv, json, and markdown files are parsed right now",
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
