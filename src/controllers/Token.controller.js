import { AccessToken } from "livekit-server-sdk";
import { asyncHandler } from "../utils/AsyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { RoomServiceClient } from "livekit-server-sdk";
import  Meeting  from "../models/Meeting.model.js";

const roomService = new RoomServiceClient(
  process.env.LIVEKIT_URL,
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET
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
  const { roomId, userId, isHost, name, image } = req.body;

  console.log("Received token request:", {
    roomId,
    userId,
    isHost,
    name,
    image,
  });

  // Validation
  if (!roomId || !name) {
    throw new ApiError(400, "Missing roomId or name");
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new ApiError(500, "Server Misconfigured");
  }

  // Create Access Token
  const at = new AccessToken(apiKey, apiSecret, {
    identity: userId || `guest_${Math.floor(Math.random() * 10000)}`,
    name: name,
    ttl: 6 * 60 * 60, // 6 hours
    metadata: JSON.stringify({
      isHost: isHost || false,
      image: image || null,
    }),
  });

  at.addGrant({
    roomJoin: true,
    room: roomId,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: true

  });

  const token = await at.toJwt();

  return res.status(200).json({
    token,
    url: process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL,
  });
});

export const removeParticipant = asyncHandler(async (req, res) => {
  const { roomId, targetIdentity, requesterId } = req.body;

  if (!roomId || !targetIdentity) {
    throw new ApiError(400, "Missing roomId or targetIdentity");
  }
  if (!requesterId) {
    throw new ApiError(400, "Missing requesterId");
  }

  // 1. Look up the meeting and confirm the REQUESTER is actually the host.
  //    Never trust an isHost flag sent from the client.
  const meeting = await Meeting.findOne({ meetingId: roomId });
  if (!meeting) {
    throw new ApiError(404, "Meeting not found");
  }

  const hostId = String(
    meeting.hostId || meeting.host || meeting.createdBy || meeting.userId || ""
  );

  if (!hostId || hostId !== String(requesterId)) {
    throw new ApiError(403, "Only the meeting host can remove participants");
  }

  // 2. Don't let a host remove themselves via this route (optional but sane).
  if (String(targetIdentity) === String(requesterId)) {
    throw new ApiError(400, "You can't remove yourself");
  }

  // 3. Actually kick them from the LiveKit room.
  try {
    await roomService.removeParticipant(roomId, targetIdentity);
  } catch (err) {
    // LiveKit throws if the participant already disconnected — treat that as a no-op success
    if (err?.status === 404 || err?.code === 404 || /not found/i.test(err?.message || "")) {
      return res
        .status(200)
        .json({ success: true, message: "Participant already left the room" });
    }
    console.error("removeParticipant failed:", err);
    throw new ApiError(500, "Failed to remove participant");
  }

  return res.status(200).json({ success: true });
});