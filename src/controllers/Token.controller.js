import { AccessToken } from "livekit-server-sdk";
import { asyncHandler } from "../utils/AsyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { RoomServiceClient } from "livekit-server-sdk";
import Meeting from "../models/Meeting.model.js";

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
  const identity = userId || `guest_${Math.floor(Math.random() * 10000)}`;
  const meeting = await Meeting.findOne({ meetingId: roomId }).select(
    "blockedParticipants",
  );
  if (meeting?.blockedParticipants?.includes(String(identity))) {
    throw new ApiError(
      403,
      "You have been removed from this meeting and cannot rejoin",
    );
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
    canUpdateOwnMetadata: true,
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
