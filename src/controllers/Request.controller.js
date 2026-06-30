import  Profile  from "../models/Profile.model.js";
import RequestModel from "../models/Request.model.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/AsyncHandler.js";

 const createRequest = asyncHandler(async (req, res) => {

  const { senderId, receiverId, role } = req.body;

  console.log("Received request:", { senderId, receiverId, role });

  if (!senderId || !receiverId) {
    throw new ApiError(400, "SenderId and ReceiverId required");
  }

  // check existing request
  const existing = await RequestModel.findOne({
    sender: senderId,
    receiver: receiverId,
  });

  if (existing) {
    return res.status(400).json(
      new ApiResponse(400, null, "Request already sent")
    );
  }

  const request = await RequestModel.create({
    sender: senderId,
    receiver: receiverId,
    role: role || "user",
  });

  return res.status(201).json(
    new ApiResponse(201, request, "Request sent successfully")
  );
});
//  const getRequests = asyncHandler(async (req, res) => {

//   const { userId, role } = req.query;

//   console.log("Fetching requests:", userId, role);

//   if (!userId) {
//     throw new ApiError(400, "UserId is required");
//   }

//   let requests,userData;

//   if (role === "doctor" || role === "lawyer") {
//     requests = await RequestModel.find({ receiver: userId })
//       .sort({ createdAt: -1 });
//     userData = await Profile.findById(userId).select("name email");
//   } else {
//     requests = await RequestModel.find({ sender: userId })
//       .sort({ createdAt: -1 });
//       userData = await Profile.findById(userId).select("name email");
//   }
//   console.log("Fetched requests:", requests);
//   console.log("Fetched user data:", userData);
//   return res.status(200).json(
//     new ApiResponse(200, { requests, userData }, "Requests fetched successfully")
//   );
// });

const getRequests = asyncHandler(async (req, res) => {
  const { userId, role } = req.query;
  console.log("Fetching requests for userId:", userId, "with role:", role);
  if (!userId) {
    throw new ApiError(400, "UserId is required");
  }

  let requests;

  if (role === "doctor" || role === "lawyer") {
    requests = await RequestModel.find({ receiver: userId })
      .populate({
        path: "sender",
        select: "email role"
      })
      .populate({
        path: "receiver",
        select: "email role Specialization ProfilePicture"
      })
      .sort({ createdAt: -1 });
  } else {
    requests = await RequestModel.find({ sender: userId })
      .populate({
        path: "receiver",
        select: "email role Specialization ProfilePicture"
      })
      .populate({
        path: "sender",
        select: "email role"
      })
      .sort({ createdAt: -1 });
  }
  console.log("Fetched requests:", requests);

  return res.status(200).json(
    new ApiResponse(200, requests, "Requests fetched successfully")
  );
});
 const updateRequest = asyncHandler(async (req, res) => {

  const { requestId, status } = req.body;

  if (!requestId || !status) {
    throw new ApiError(400, "requestId and status required");
  }

  const updated = await RequestModel.findByIdAndUpdate(
    requestId,
    { status },
    { new: true, runValidators: true }
  );

  if (!updated) {
    throw new ApiError(404, "Request not found");
  }

  return res.status(200).json(
    new ApiResponse(200, updated, "Request updated successfully")
  );
});
export{
    createRequest,getRequests,updateRequest
}