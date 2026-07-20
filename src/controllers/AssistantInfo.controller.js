            import AssistantInfo from "../models/AssistantInfo.model.js";
            import Profile from "../models/Profile.model.js";
            // import { Profile } from "../models/Profile.model.js";
            import { asyncHandler } from "../utils/AsyncHandler.js";

            const assitantInfo = asyncHandler(async (req, res) => {
                const body = req.body;
                // 🔥 Create Assistant Info
            const assistantInfo = await AssistantInfo.create(body);
            const userId = body.userId;
            // 🔥 Check userId
            if (!userId) {
                return res.status(400).json({
                success: false,
                error: "User ID is required",
                });
            }
                // 🔥 Update Profile
            const updateProfile = await Profile.findByIdAndUpdate(
                userId,
                { meetingUsed: true },
                { new: true }
            );
            return res.status(200).json({
                success: true,
                assistantInfo,
                updateProfile,
            });
            });
                const getAssistantInfo = asyncHandler(async (req, res) => {


                // 🔥 Get userId from query params
                const { userId } = req.params;

                // 🔥 Check userId
                if (!userId) {
                    return res.status(400).json({
                    success: false,
                    error: "User ID is required",
                    });
                }

                // 🔥 Find assistant infos
                const assistantInfos = await AssistantInfo.find({
                    userId,
                }).lean();

                return res.status(200).json({
                    success: true,
                    assistantInfos,
                });
                });
            const updateAssistantInfo = asyncHandler(async (req, res) => {
            

            // 🔥 Get userId from route params
            const { userId } = req.params;

            // 🔥 Check userId
            if (!userId) {
                return res.status(400).json({
                success: false,
                error: "User ID is required",
                });
            }

            const body = req.body;

            // 🔥 Update Assistant Info
            const updatedUser = await AssistantInfo.findOneAndUpdate(
                { userId: userId }, // 🔥 because you're searching by userId
                body,
                { new: true }
            );

            // 🔥 Check if user exists
            if (!updatedUser) {
                return res.status(404).json({
                success: false,
                message: "User not found",
                });
            }

            return res.status(200).json({
                success: true,
                assistantInfo: updatedUser,
            });
            });

            export { assitantInfo,getAssistantInfo,updateAssistantInfo };