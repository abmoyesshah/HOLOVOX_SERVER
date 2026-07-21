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

const normalizeEnterpriseMemberRole = (role) => (role === "manager" ? "manager" : "rep");

const resolveEnterpriseParticipant = async (userId) => {
  if (!isObjectId(userId)) return null;

  const member = await EnterpriseProfile.findById(userId)
    .select("_id organizationId enterpriseId role fullName email parentId")
    .lean();
  if (member?.organizationId) {
    return {
      organizationId: member.organizationId,
      memberId: member._id,
      userId: null,
      role: normalizeEnterpriseMemberRole(member.role),
      member,
    };
  }

  const profile = await Profile.findById(userId)
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
    memberId: null,
    userId: profile._id,
    role: "owner",
    profile,
  };
};

export const resolveEnterpriseHost = async (hostId) => {
  const host = await resolveEnterpriseParticipant(hostId);
  if (!host) return null;
  return {
    organizationId: host.organizationId,
    hostMemberId: host.memberId,
    hostUserId: host.userId,
    hostRole: host.role,
  };
};

export const syncEnterpriseMeetingFromMeeting = async (meetingInput, statusOverride = null) => {
  if (!meetingInput?.meetingId || !meetingInput?.hostId) return null;

  const participantIds = uniqueObjectIds([
    meetingInput.hostId,
    ...(meetingInput.participants || []).map((participant) => participant.userId),
  ]);
  const resolvedParticipants = (
    await Promise.all(participantIds.map((id) => resolveEnterpriseParticipant(id)))
  ).filter(Boolean);

  const primaryEnterpriseParticipant = resolvedParticipants[0];
  if (!primaryEnterpriseParticipant?.organizationId) return null;

  const organizationId = primaryEnterpriseParticipant.organizationId;
  const hostIdentity = resolvedParticipants.find(
    (participant) => String(participant.userId || participant.memberId) === String(meetingInput.hostId),
  );

  const participantUserIds = (meetingInput.participants || [])
    .map((participant) => participant.userId)
    .filter(isObjectId);
  const participantMembers = participantUserIds.length
    ? await EnterpriseProfile.find({
        _id: { $in: participantUserIds },
        organizationId,
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
        organizationId,
        normalMeetingId: meetingInput._id || null,
        hostUserId: hostIdentity?.role === "owner" ? hostIdentity.userId : null,
        hostMemberId: hostIdentity?.memberId || null,
        hostRole: hostIdentity?.role || null,
        enterpriseActorUserId:
          primaryEnterpriseParticipant.role === "owner"
            ? primaryEnterpriseParticipant.userId
            : null,
        enterpriseActorMemberId: primaryEnterpriseParticipant.memberId || null,
        enterpriseActorRole: primaryEnterpriseParticipant.role,
        meetingTitle: meetingInput.meetingTitle || "Holovox Meeting",
        meetingDate: meetingInput.meetingDate || new Date(),
        status,
        participantMemberIds: uniqueObjectIds([
          hostIdentity?.memberId,
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
  normalTranscriptId,
  segment,
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
  let speakerUserId = null;
  let speakerMemberId = null;
  let speakerRole = null;
  if (isObjectId(participantId)) {
    const participantIdentity = await resolveEnterpriseParticipant(participantId);
    const sameOrganization =
      participantIdentity?.organizationId &&
      String(participantIdentity.organizationId) === String(enterpriseMeeting.organizationId);
    if (sameOrganization) {
      participantMemberId = participantIdentity.memberId || null;
      speakerMemberId = participantIdentity.memberId || null;
      speakerUserId = participantIdentity.userId || null;
      speakerRole = participantIdentity.role;
    }
  }

  return scanTranscriptForFlags({
    organizationId: enterpriseMeeting.organizationId,
    meetingId: roomId,
    enterpriseMeetingId: enterpriseMeeting._id,
    normalTranscriptId,
    text,
    participantMemberId,
    participantName,
    hostMemberId: enterpriseMeeting.hostMemberId || null,
    speakerUserId,
    speakerMemberId,
    speakerRole,
    segment,
  });
};
