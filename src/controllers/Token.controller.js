import { AccessToken } from "livekit-server-sdk";
import { asyncHandler } from "../utils/AsyncHandler.js";
import { ApiError } from "../utils/ApiError.js";

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
  });

  const token = await at.toJwt();

  return res.status(200).json({
    token,
    url: process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL,
  });
});