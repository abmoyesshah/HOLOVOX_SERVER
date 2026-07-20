import mongoose from "mongoose";
import MeetingModel from "../../models/Meeting.model.js";
import Profile from "../../models/Profile.model.js";
import EnterpriseProfile from "../../migrated-next/app/models/EnterpriseProfile.model.js";
import EnterpriseMeeting from "../../models/enterprise/EnterpriseMeeting.model.js";
import EnterpriseOrganization from "../../models/enterprise/EnterpriseOrganization.model.js";
import { resolveOrganization } from "./enterpriseAccess.service.js";
import { scanTranscriptForFlags } from "./transcriptFlagScanner.service.js";

const isObjectId = (value) => Boolean(value) && mongoose.Types.ObjectId.isValid(value);

const uniqueObjectIds = (ids) => {
  const seen = new Set();
  return ids.filter((id) => {
    if (!id) return false;
    const key = String(id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const resolveEnterpriseHost = async (hostId) => {
  if (!isObjectId(hostId)) return null;

  const member = await EnterpriseProfile.findById(hostId)
    .select("_id organizationId enterpriseId role fullName email")
    .lean();
  if (member?.organizationId) {
    return {
      organizationId: member.organizationId,
      hostMemberId: member._id,
      hostUserId: null,
      hostRole: member.role === "manager" ? "manager" : "rep",
    };
  }

  const profile = await Profile.findById(hostId)
    .select("_id fullName email Subscription")
    .lean();
  if (!profile) return null;

  let organization = await EnterpriseOrganization.findOne({ ownerId: profile._id });
  if (!organization && profile.Subscription === "enterprise") {
    organization = await resolveOrganization({
      ownerId: profile._id,
      ownerName: profile.fullName || "Enterprise",
    });
  }

  if (!organization) return null;

  return {
    organizationId: organization._id,
    hostMemberId: null,
    hostUserId: profile._id,
    hostRole: "owner",
  };
};

export const syncEnterpriseMeetingFromMeeting = async (meetingInput, statusOverride = null) => {
  if (!meetingInput?.meetingId || !meetingInput?.hostId) return null;

  const host = await resolveEnterpriseHost(meetingInput.hostId);
  if (!host?.organizationId) return null;

  const participantUserIds = (meetingInput.participants || [])
    .map((participant) => participant.userId)
    .filter(isObjectId);
  const participantMembers = participantUserIds.length
    ? await EnterpriseProfile.find({
        _id: { $in: participantUserIds },
        organizationId: host.organizationId,
      })
        .select("_id")
        .lean()
    : [];

  const allEnded =
    Array.isArray(meetingInput.participants) &&
    meetingInput.participants.length > 0 &&
    meetingInput.participants.every((participant) => participant.end === true);
  const status =
    statusOverride ||
    (allEnded ? "ended" : meetingInput.upcoming ? "created" : "live");

  return EnterpriseMeeting.findOneAndUpdate(
    { meetingId: meetingInput.meetingId },
    {
      $set: {
        organizationId: host.organizationId,
        normalMeetingId: meetingInput._id || null,
        hostUserId: host.hostUserId,
        hostMemberId: host.hostMemberId,
        hostRole: host.hostRole,
        meetingTitle: meetingInput.meetingTitle || "Holovox Meeting",
        meetingDate: meetingInput.meetingDate || new Date(),
        status,
        participantMemberIds: uniqueObjectIds([
          host.hostMemberId,
          ...participantMembers.map((member) => member._id),
        ]),
        endedAt: status === "ended" ? new Date() : null,
      },
      $setOnInsert: {
        startedAt: status === "live" ? new Date() : null,
      },
    },
    { new: true, upsert: true }
  );
};

export const markEnterpriseMeetingEnded = async (meetingInput) =>
  syncEnterpriseMeetingFromMeeting(meetingInput, "ended");

export const syncEnterpriseTranscript = async ({
  roomId,
  participantId,
  participantName,
  text,
}) => {
  if (!roomId || !text || !text.trim()) return null;

  let enterpriseMeeting = await EnterpriseMeeting.findOne({ meetingId: roomId })
    .lean();
  if (!enterpriseMeeting) {
    const meeting = await MeetingModel.findOne({ meetingId: roomId }).lean();
    enterpriseMeeting = await syncEnterpriseMeetingFromMeeting(meeting);
  }
  if (!enterpriseMeeting?.organizationId) return null;

  let participantMemberId = null;
  if (isObjectId(participantId)) {
    const participantProfile = await EnterpriseProfile.findOne({
      _id: participantId,
      organizationId: enterpriseMeeting.organizationId,
    })
      .select("_id")
      .lean();
    if (participantProfile) participantMemberId = participantProfile._id;
  }

  return scanTranscriptForFlags({
    organizationId: enterpriseMeeting.organizationId,
    meetingId: roomId,
    text,
    participantMemberId,
    participantName,
    hostMemberId: enterpriseMeeting.hostMemberId || null,
  });
};
