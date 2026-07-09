import { AccessToken } from "livekit-server-sdk";
import { asyncHandler } from "../utils/AsyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { RoomServiceClient } from "livekit-server-sdk";
import Meeting from "../models/Meeting.model.js";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
const roomService = new RoomServiceClient(
  process.env.NEXT_PUBLIC_LIVEKIT_URL,
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET,
);

export const muteParticipantTrack = asyncHandler(async (req, res) => {
  const { roomId, targetIdentity, trackSid, muted } = req.body;
  if (!roomId || !targetIdentity || !trackSid) {
    throw new ApiError(400, "Missing roomId, targetIdentity, or trackSid");
  }

  await roomService.mutePublishedTrack(roomId, targetIdentity, trackSid, muted);

  return res.status(200).json({ success: true });
});

export const exchangeToken = asyncHandler(async (req, res) => {
  const { roomId, userId, isHost, name, image, password } = req.body;

  if (!roomId || !name) {
    throw new ApiError(400, "Missing roomId or name");
  }
  const identity = userId || `guest_${Math.floor(Math.random() * 10000)}`;

  const meeting = await Meeting.findOne({ meetingId: roomId }).select(
  "blockedParticipants admittedParticipants waitingParticipants hostId isLocked passwordProtected password",
);

  if (meeting?.blockedParticipants?.includes(String(identity))) {
    throw new ApiError(
      403,
      "You have been removed from this meeting and cannot rejoin",
    );
  }

  const isAlreadyAdmitted =
    isHost || meeting?.admittedParticipants?.includes(String(identity));

  if (!isAlreadyAdmitted && meeting?.passwordProtected) {
    if (!password || String(password).trim() === "") {
      return res.status(401).json({ status: "password_required" });
    }

    const isPasswordValid = await bcrypt.compare(
      String(password).trim(),
      meeting.password || "",
    );

    if (!isPasswordValid) {
      return res.status(401).json({ status: "invalid_password" });
    }
  }

  if (!isAlreadyAdmitted && meeting?.isLocked) {
    return res.status(423).json({ status: "locked" });
  }
  // Locked meeting: reject anyone who isn't the host and hasn't already
  // been admitted before the lock went on. Previously-admitted users can
  // still reconnect (e.g. brief network drop) even while locked.

  // Anyone who isn't the host and hasn't been admitted yet gets parked
  // in the waiting room instead of receiving a LiveKit token.
  if (!isAlreadyAdmitted) {
    if (meeting) {
      // Atomic: the $ne filter and the $push happen as ONE operation.
      // If two requests race, only the first one finds a document
      // matching "no existing waiter with this identity" — the second
      // request's filter no longer matches (the array now has this
      // identity), so its update becomes a no-op instead of a second push.
      await Meeting.updateOne(
        {
          meetingId: roomId,
          "waitingParticipants.identity": { $ne: String(identity) },
        },
        {
          $push: {
            waitingParticipants: {
              identity: String(identity),
              name,
              image: image || null,
            },
          },
        },
      );
    }
    return res.status(202).json({ status: "waiting", identity });
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new ApiError(500, "Server Misconfigured");
  }

  // Host reconnecting: make sure they're recorded as admitted so they
  // never get stuck behind their own waiting room.
  if (
    isHost &&
    meeting &&
    !meeting.admittedParticipants?.includes(String(identity))
  ) {
    await Meeting.updateOne(
      { meetingId: roomId },
      { $addToSet: { admittedParticipants: String(identity) } },
    );
  }
if (meeting && mongoose.Types.ObjectId.isValid(identity)) {
  try {
    await Meeting.updateOne(
      { meetingId: roomId, "participants.userId": identity },
      { $set: { "participants.$[elem].end": false } },
      { arrayFilters: [{ "elem.userId": identity }] },
    );
  } catch (err) {
    console.error("Failed to reset participant end flag:", err);
  }
}
  const at = new AccessToken(apiKey, apiSecret, {
    identity,
    name,
    ttl: 6 * 60 * 60,
    metadata: JSON.stringify({ isHost: isHost || false, image: image || null }),
  });

  at.addGrant({
    roomJoin: true,
    room: roomId,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: true,
  });

  const token = await at.toJwt();

  return res.status(200).json({
    status: "admitted",
    token,
    url: process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL,
  });
});

// --- Waiting room management ---

export const getWaitingList = asyncHandler(async (req, res) => {
  const { roomId } = req.params;
  const { requesterId } = req.query;
  if (!roomId || !requesterId) {
    throw new ApiError(400, "Missing roomId or requesterId");
  }

  const meeting = await Meeting.findOne({ meetingId: roomId }).select(
    "hostId waitingParticipants isLocked",
  );
  if (!meeting) throw new ApiError(404, "Meeting not found");
  if (String(meeting.hostId) !== String(requesterId)) {
    throw new ApiError(403, "Only the meeting host can view the waiting room");
  }

  return res.status(200).json({
    waiters: meeting.waitingParticipants || [],
    isLocked: Boolean(meeting.isLocked),
  });
});

export const admitParticipant = asyncHandler(async (req, res) => {
  const { roomId, targetIdentity, requesterId } = req.body;
  if (!roomId || !targetIdentity || !requesterId) {
    throw new ApiError(400, "Missing roomId, targetIdentity or requesterId");
  }

  const meeting = await Meeting.findOne({ meetingId: roomId });
  if (!meeting) throw new ApiError(404, "Meeting not found");
  if (String(meeting.hostId) !== String(requesterId)) {
    throw new ApiError(403, "Only the meeting host can admit participants");
  }

  meeting.waitingParticipants = (meeting.waitingParticipants || []).filter(
    (w) => String(w.identity) !== String(targetIdentity),
  );
  if (!meeting.admittedParticipants.includes(String(targetIdentity))) {
    meeting.admittedParticipants.push(String(targetIdentity));
  }
  await meeting.save();

  return res.status(200).json({ success: true });
});

export const admitAllParticipants = asyncHandler(async (req, res) => {
  const { roomId, requesterId } = req.body;
  if (!roomId || !requesterId) {
    throw new ApiError(400, "Missing roomId or requesterId");
  }

  const meeting = await Meeting.findOne({ meetingId: roomId });
  if (!meeting) throw new ApiError(404, "Meeting not found");
  if (String(meeting.hostId) !== String(requesterId)) {
    throw new ApiError(403, "Only the meeting host can admit participants");
  }

  const waitingIds = (meeting.waitingParticipants || []).map((w) =>
    String(w.identity),
  );
  meeting.admittedParticipants = [
    ...new Set([...meeting.admittedParticipants, ...waitingIds]),
  ];
  meeting.waitingParticipants = [];
  await meeting.save();

  return res.status(200).json({ success: true, admitted: waitingIds });
});

export const denyParticipant = asyncHandler(async (req, res) => {
  const { roomId, targetIdentity, requesterId } = req.body;
  if (!roomId || !targetIdentity || !requesterId) {
    throw new ApiError(400, "Missing roomId, targetIdentity or requesterId");
  }

  const meeting = await Meeting.findOne({ meetingId: roomId });
  if (!meeting) throw new ApiError(404, "Meeting not found");
  if (String(meeting.hostId) !== String(requesterId)) {
    throw new ApiError(403, "Only the meeting host can deny participants");
  }

  meeting.waitingParticipants = (meeting.waitingParticipants || []).filter(
    (w) => String(w.identity) !== String(targetIdentity),
  );
  if (!meeting.deniedParticipants.includes(String(targetIdentity))) {
    meeting.deniedParticipants.push(String(targetIdentity));
  }
  await meeting.save();

  return res.status(200).json({ success: true });
});

export const getWaitingStatus = asyncHandler(async (req, res) => {
  const { roomId, userId } = req.params;
  if (!roomId || !userId) {
    throw new ApiError(400, "Missing roomId or userId");
  }

  const meeting = await Meeting.findOne({ meetingId: roomId }).select(
    "admittedParticipants waitingParticipants deniedParticipants isLocked",
  );
  if (!meeting) throw new ApiError(404, "Meeting not found");

  if (meeting.admittedParticipants?.includes(String(userId))) {
    return res.status(200).json({ status: "admitted" });
  }
  if (meeting.deniedParticipants?.includes(String(userId))) {
    return res.status(200).json({ status: "denied" });
  }
  const stillWaiting = (meeting.waitingParticipants || []).some(
    (w) => String(w.identity) === String(userId),
  );
  if (!stillWaiting && meeting.isLocked) {
    return res.status(200).json({ status: "locked" });
  }
  return res.status(200).json({ status: stillWaiting ? "waiting" : "unknown" });
});

export const setMeetingLock = asyncHandler(async (req, res) => {
  const { roomId, requesterId, locked } = req.body;
  if (!roomId || !requesterId || typeof locked !== "boolean") {
    throw new ApiError(400, "Missing roomId, requesterId, or locked");
  }

  const meeting = await Meeting.findOne({ meetingId: roomId });
  if (!meeting) throw new ApiError(404, "Meeting not found");
  if (String(meeting.hostId) !== String(requesterId)) {
    throw new ApiError(
      403,
      "Only the meeting host can lock or unlock the meeting",
    );
  }

  meeting.isLocked = locked;
  await meeting.save();

  return res.status(200).json({ success: true, isLocked: meeting.isLocked });
});

export const removeParticipant = asyncHandler(async (req, res) => {
  const { roomId, targetIdentity, requesterId } = req.body;

  if (!roomId || !targetIdentity) {
    throw new ApiError(400, "Missing roomId or targetIdentity");
  }
  if (!requesterId) {
    throw new ApiError(400, "Missing requesterId");
  }

  const meeting = await Meeting.findOne({ meetingId: roomId });
  if (!meeting) {
    throw new ApiError(404, "Meeting not found");
  }

  const hostId = String(meeting.hostId || "");
  if (!hostId || hostId !== String(requesterId)) {
    throw new ApiError(403, "Only the meeting host can remove participants");
  }

  if (String(targetIdentity) === String(requesterId)) {
    throw new ApiError(400, "You can't remove yourself");
  }

  // Kick them from the live LiveKit room first
  try {
    await roomService.removeParticipant(roomId, targetIdentity);
  } catch (err) {
    if (
      err?.status === 404 ||
      err?.code === 404 ||
      /not found/i.test(err?.message || "")
    ) {
      // already disconnected — fine, still proceed to block them below
    } else {
      console.error("removeParticipant failed:", err);
      throw new ApiError(500, "Failed to remove participant");
    }
  }

  // 👇 persist the ban so they can't just fetch a new token and rejoin
  await Meeting.updateOne(
    { meetingId: roomId },
    { $addToSet: { blockedParticipants: String(targetIdentity) } },
  );

  return res.status(200).json({ success: true });
});
