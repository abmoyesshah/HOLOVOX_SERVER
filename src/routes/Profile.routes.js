import { Router } from "express";
import { LoginUser, RegisterUser, sendOtp, updateUser, verifyOtp,getProfile, getProfileById, createStripeSession, updateSubscription } from "../controllers/Profile.controller.js";
import { upload } from "../middlewares/Multer.middleware.js";
// import { LoginUser, RegisterUser } from "../controllers/Admin.controller.js";

const router = Router();

router.route("/register").post(RegisterUser);
router.route("/sendOtp").post(sendOtp);
router.route("/verifyOtp").post(verifyOtp);
router.route("/login").post(LoginUser);
router.route("/updateProfile/:id").put(upload.single("image"),updateUser);
router.route("/getProfile/:userId").get(getProfileById);
router.route("/getProfile").get(getProfile);
router.route("/create-checkout-session").post(createStripeSession);
router.route("/updateSubscription").put(updateSubscription);

// new stripe routes — NO verifyJWT here



export default router;
