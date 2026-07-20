import mongoose from "mongoose";
import MeetingModel from "../../models/Meeting.model.js";
import EnterpriseProfile from "../../migrated-next/app/models/EnterpriseProfile.model.js";
import { scanTranscriptForFlags } from "./transcriptFlagScanner.service.js";

const isObjectId = (value) => Boolean(value) && mongoose.Types.ObjectId.isValid(value);

/**
 * Bridge between the general meeting/transcription pipeline (Meeting + Transcript
 * models, used by every Holovox user) and the enterprise brain-training / flag
 * detection pipeline (MeetingTranscript + UserFlag, enterprise-only).
 *
 * This is intentionally the ONLY place the two sides touch. Regular meetings and
 * regular users are never written to any enterprise collection:
 *  - If the meeting's host is not an EnterpriseProfile member, this is a silent no-op.
 *  - If the host is an EnterpriseProfile member, we resolve their organizationId
 *    and run the same scanTranscriptForFlags(...) used by the manual
 *    POST /enterprise/transcripts/:meetingId/scan endpoint, so every real-time
 *    chunk gets recorded as a MeetingTranscript and checked against FlagWords.
 *
 * Call this best-effort (fire-and-forget with error swallowing) right after a
 * transcript chunk is saved, so a failure here never breaks transcription for
 * the caller.
 */
export const syncEnterpriseTranscript = async ({
  roomId,
  participantId,
  participantName,
  text,
}) => {
  if (!roomId || !text || !text.trim()) return null;

  const meeting = await MeetingModel.findOne({ meetingId: roomId })
    .select("hostId")
    .lean();
  if (!meeting?.hostId) return null;

  // Only proceed if the host of this meeting is an enterprise member.
  // Regular HolovoxUser hosts simply won't be found here -> no-op.
  const host = await EnterpriseProfile.findById(meeting.hostId)
    .select("organizationId")
    .lean();
  if (!host?.organizationId) return null;

  let participantMemberId = null;
  if (isObjectId(participantId)) {
    const participantProfile = await EnterpriseProfile.findOne({
      _id: participantId,
      organizationId: host.organizationId,
    })
      .select("_id")
      .lean();
    if (participantProfile) participantMemberId = participantProfile._id;
  }

  return scanTranscriptForFlags({
    organizationId: host.organizationId,
    meetingId: roomId,
    text,
    participantMemberId,
    participantName,
    hostMemberId: meeting.hostId,
  });
};
