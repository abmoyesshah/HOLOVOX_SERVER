import mongoose from "mongoose";
import MeetingModel from "../../models/Meeting.model.js";
import Transcript from "../../models/Transcript.model.js";
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

const ENTERPRISE_MEETING_ROLES = ["owner", "manager", "rep"];

const normalizeEnterpriseMemberRole = (role) => (role === "manager" ? "manager" : "rep");

const sameId = (left, right) => String(left || "") === String(right || "");

const findEnterpriseMeetingByRoomId = async (roomId) => {
  const enterpriseMeeting = await EnterpriseMeeting.findOne({ meetingId: roomId }).lean();
  if (enterpriseMeeting) return enterpriseMeeting;

  // Compatibility for rows created before the collection was standardized.
  return EnterpriseMeeting.collection.conn
    .collection("enterprisemeetings")
    .findOne({ meetingId: roomId });
};

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
  ).filter((participant) => participant && ENTERPRISE_MEETING_ROLES.includes(participant.role));

  const primaryEnterpriseParticipant = resolvedParticipants.find(
    (participant) => participant.organizationId,
  );
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

  const enterpriseParticipantMemberIds = resolvedParticipants
    .filter(
      (participant) =>
        participant.memberId &&
        String(participant.organizationId) === String(organizationId),
    )
    .map((participant) => participant.memberId);

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
          ...enterpriseParticipantMemberIds,
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

  let enterpriseMeeting = await findEnterpriseMeetingByRoomId(roomId);
  let meeting = null;
  if (!enterpriseMeeting) {
    meeting = await MeetingModel.findOne({ meetingId: roomId }).lean();
    const meetingWithTranscriptSpeaker = meeting
      ? {
          ...meeting,
          participants: [
            ...(meeting.participants || []),
            {
              userId: participantId,
              name: participantName || "",
              role: isObjectId(participantId) ? "participant" : "guest",
            },
          ],
        }
      : null;
    enterpriseMeeting = await syncEnterpriseMeetingFromMeeting(meetingWithTranscriptSpeaker);
  }
  if (!enterpriseMeeting?.organizationId) return null;

  let participantMemberId = null;
  let speakerUserId = null;
  let speakerMemberId = null;
  let speakerRole = null;

  const applyParticipantIdentity = (participantIdentity) => {
    const sameOrganization =
      participantIdentity?.organizationId &&
      String(participantIdentity.organizationId) === String(enterpriseMeeting.organizationId);
    if (sameOrganization) {
      participantMemberId = participantIdentity.memberId || null;
      speakerMemberId = participantIdentity.memberId || null;
      speakerUserId = participantIdentity.userId || null;
      speakerRole = participantIdentity.role;
      return true;
    }
    return false;
  };

  if (isObjectId(participantId)) {
    applyParticipantIdentity(await resolveEnterpriseParticipant(participantId));
  }

  if (!speakerRole) {
    if (!meeting) meeting = await MeetingModel.findOne({ meetingId: roomId }).lean();
    const normalizedName = String(participantName || "").trim().toLowerCase();
    const meetingParticipant = (meeting?.participants || []).find((participant) => {
      if (participantId && sameId(participant.userId, participantId)) return true;
      return normalizedName && String(participant.name || "").trim().toLowerCase() === normalizedName;
    });

    if (meetingParticipant?.userId) {
      applyParticipantIdentity(await resolveEnterpriseParticipant(meetingParticipant.userId));
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

export const syncEnterpriseTranscriptsForMeeting = async (meetingInput) => {
  const meetingId = meetingInput?.meetingId;
  if (!meetingId) return { transcriptCount: 0, syncedCount: 0 };

  const transcripts = await Transcript.find({ roomId: meetingId }).sort({ createdAt: 1 }).lean();
  const transcriptParticipants = transcripts
    .filter((transcript) => isObjectId(transcript.participantId))
    .map((transcript) => ({
      userId: transcript.participantId,
      name: transcript.participantName || "",
      role: "participant",
    }));

  if (transcriptParticipants.length) {
    await syncEnterpriseMeetingFromMeeting(
      {
        ...meetingInput.toObject?.() || meetingInput,
        participants: [
          ...(meetingInput.participants || []),
          ...transcriptParticipants,
        ],
      },
      meetingInput.participants?.length &&
        meetingInput.participants.every((participant) => participant.end === true)
        ? "ended"
        : null,
    );
  }

  let syncedCount = 0;

  for (const transcript of transcripts) {
    const result = await syncEnterpriseTranscript({
      roomId: transcript.roomId,
      participantId: transcript.participantId,
      participantName: transcript.participantName,
      text: transcript.text,
      normalTranscriptId: transcript._id,
    });
    if (result?.transcript) syncedCount += 1;
  }

  return { transcriptCount: transcripts.length, syncedCount };
};
