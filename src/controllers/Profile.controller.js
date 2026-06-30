import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/AsyncHandler.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import Profile from "../models/Profile.model.js";
import bcrypt from "bcrypt";
import { uploadOnCloudinary } from "../utils/Cloudinary.js";
import Stripe from "stripe";

import sendMail from "../utils/Nodemailer.js";
dotenv.config();

export const otpTemplate = (otp) => {
  return `
  <div style="margin:0;padding:0;background:#0b1220;font-family:Arial, sans-serif;">

    <div style="max-width:520px;margin:40px auto;background:linear-gradient(145deg,#111827,#0f172a);padding:40px;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,0.4);text-align:center;">

      <!-- Logo -->
      <h1 style="color:#4ade80;font-size:28px;margin-bottom:6px;letter-spacing:1px;">
        HOLOVOX
      </h1>

      <p style="color:#94a3b8;font-size:14px;margin-bottom:30px;">
        Secure verification code
      </p>

      <!-- OTP Box -->
      <div style="
        background:#0f172a;
        border:1px solid #1f2937;
        padding:20px;
        border-radius:12px;
        display:inline-block;
        min-width:200px;
      ">
        <p style="
          font-size:34px;
          letter-spacing:10px;
          font-weight:bold;
          color:#ffffff;
          margin:0;
        ">
          ${otp}
        </p>
      </div>

      <!-- Info -->
      <p style="color:#cbd5e1;font-size:13px;margin-top:25px;line-height:1.5;">
        This code is valid for <b style="color:#ffffff;">5 minutes</b>.<br/>
        Do not share it with anyone.
      </p>

      <!-- Divider -->
      <div style="height:1px;background:#1f2937;margin:30px 0;"></div>

      <!-- Footer -->
      <p style="color:#6b7280;font-size:11px;margin:0;">
        © ${new Date().getFullYear()} Holovox. All rights reserved.
      </p>

    </div>
  </div>
  `;
};


const stripe = new Stripe(
  "sk_test_51Q47vSG124FIRgpMYy2XfP1PthkORGJdpoYLHnLtq8YZsD3YkyckDXIh2cKas6JwxGvHgVU3oFuHfunyaK5qUqtL00cIlfws6N"
);

const RegisterUser = asyncHandler(async (req, res) => {
  const {
    fullName,
    email,
    password,
    role,
    Specialization,
    YearsOfExperience,
    AvailableDays,
    AvailableTimeSlots,
    Certifications
  } = req.body;

  if (!fullName || !email || !password || !role) {
    throw new ApiError(400, "All fields required...");
  }

  // 🔥 check user exists
  const user = await Profile.findOne({ email });

  if (!user) {
    throw new ApiError(400, "Please verify OTP first");
  }

  if (!user.isOtpVerified) {
    throw new ApiError(400, "OTP not verified");
  }

  // 🔥 hash password
  const hashPassword = await bcrypt.hash(password, 10);

  // 🔥 update verified user (final account creation)
  const updatedUser = await Profile.findByIdAndUpdate(
    user._id,
    {
      fullName,
      email,
      password: hashPassword,
      role,
      Specialization,
      YearsOfExperience,
      AvailableDays,
      AvailableTimeSlots,
      Certifications
    },
    { new: true, runValidators: true }
  ).select("-password");

  if (!updatedUser) {
    throw new ApiError(400, "Something went wrong while creating user");
  }
  console.log("Updated user:", updatedUser);
  // 🔥 JWT token
  const token = jwt.sign(
    {
      id: updatedUser._id,
      email: updatedUser.email,
      role: updatedUser.role,
      name: updatedUser.fullName,
      Subscription: updatedUser.Subscription || "free",  // ADD
      meetingUsed: updatedUser.meetingUsed || false,      // ADD
      verified: updatedUser.verified,
      image: updatedUser.ProfilePicture || "",
      status: updatedUser.status || "none"
    },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );

  return res.status(201).json(
    new ApiResponse(200, { token, user: updatedUser }, "User created successfully")
  );
});

const sendOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    throw new ApiError(400, "Email is required");
  }
  // check if user already exists
  const existingUser = await Profile.findOne({ email });

  if (existingUser) {
    throw new ApiError(400, "User already exists");
  }

  // 🔥 generate 6 digit OTP
  const otp = Math.floor(1000 + Math.random() * 9000).toString();

  // 🔥 expiry (5 minutes)
  const otpExpiry = Date.now() + 5 * 60 * 1000;

  let user = existingUser;

  if (!user) {
    user = await Profile.create({
      email,
      otp,
      otpExpiry,
      isOtpVerified: false
    });
  } else {
    user.otp = otp;
    user.otpExpiry = otpExpiry;
    await user.save();
  }
  // 🔥 SEND EMAIL
  await sendMail(
    email,
    "Your Holovox Verification Code",
    otpTemplate(otp)
  );

  // ⚠️ yahan email service lagani hogi (nodemailer etc)
  console.log("OTP is:", otp);

  return res.status(200).json(
    new ApiResponse(200, null, "OTP sent successfully")
  );
});
const verifyOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    throw new ApiError(400, "Email and OTP are required");
  }

  const user = await Profile.findOne({ email });

  if (!user) {
    throw new ApiError(400, "User not found");
  }

  if (user.otp !== otp) {
    throw new ApiError(400, "Invalid OTP");
  }

  if (user.otpExpiry < Date.now()) {
    throw new ApiError(400, "OTP expired");
  }

  // ✅ mark verified
  user.isOtpVerified = true;
  user.otp = null;
  user.otpExpiry = null;

  await user.save();

  return res.status(200).json(
    new ApiResponse(200, null, "OTP verified successfully")
  );
});

const LoginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, "All fields are required...!");
  }

  // ❌ yahan OR galat hota hai, sirf email se user find hota hai
  const user = await Profile.findOne({ email: email.toLowerCase() }).lean();

  if (!user) {
    throw new ApiError(400, "User does not exist...");
  }

  // Compare password
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new ApiError(
      400, "Password not match..."
    );
  }
  console.log("User found for login:", user?.role, user?._id);
  // ✅ JWT TOKEN CREATE
  const token = jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user?.role,
      name: user?.fullName,
      Subscription: user.Subscription || "free",  // ADD
      meetingUsed: user.meetingUsed || false,      // ADD
      verified: user?.verified,
      image: user?.image || "",
      status: user?.status || "none"
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "1d",
    }
  );
  console.log("User logged in:", user);
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        token: token,
        role: user?.role,
        Subscription: user?.Subscription,
        meetingUsed: user?.meetingUsed
      },
      "User LoggedIn Successfully..."
    )
  );
});


const getProfile = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  // if (!userId) throw new ApiError(400, "UserId is required");
  let user;
  if (userId) {
    user = await Profile.findById(userId).select("-password");
  } else {
    user = await Profile.find({}).select("-password");
  }


  return res.status(200).json(
    new ApiResponse(200, user, "Profile fetched successfully")
  );
});
const getProfileById = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  if (!userId) throw new ApiError(400, "UserId is required");
  const user = await Profile.findById(userId).select("-password");
  if (!user) {
    throw new ApiError(400, "User does not exist...");
  }
  return res.status(200).json(
    new ApiResponse(200, user, "Profile fetched successfully")
  );
});

const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { ...rest } = req.body;

  if (!id) {
    throw new ApiError(400, "UserId is required");
  }

  const user = await Profile.findById(id);
  if (!user) {
    throw new ApiError(400, "User does not exist...");
  }

  let imageUrl;

  if (req.file) {
    const image = await uploadOnCloudinary(req.file.buffer);
    if (!image?.url) {
      throw new ApiError(400, "Failed to upload Image...");
    }
    imageUrl = image.url;
  }

  // remove undefined fields
  Object.keys(rest).forEach(
    (key) => rest[key] === undefined && delete rest[key]
  );

  if (imageUrl) {
    rest.ProfilePicture = imageUrl;
  }

  const updatedUser = await Profile.findByIdAndUpdate(
    id,
    { $set: rest },
    { new: true, runValidators: true }
  ).select("-password");

  return res.status(200).json(
    new ApiResponse(200, updatedUser, "Profile Updated Successfully...")
  );
});



// const createStripeSession = asyncHandler(async (req, res) => {
//   const { planId, userId } = req.body;

//   if (!planId || !userId) {
//     throw new ApiError(400, "planId and userId are required");
//   }

//   const PLAN_MAP = {
//     spark: {
//       name: "Spark Plan — HOLOVOX",
//       amount: 2495,
//     },
//     "holo-assist": {
//       name: "Holo Assist Plan — HOLOVOX",
//       amount: 4995,
//     },
//   };

//   const plan = PLAN_MAP[planId];
//   if (!plan) {
//     throw new ApiError(400, "Invalid plan selected");
//   }

//   const session = await stripe.checkout.sessions.create({
//     payment_method_types: ["card"],
//     line_items: [
//       {
//         price_data: {
//           currency: "usd",
//           product_data: {
//             name: plan.name,
//           },
//           unit_amount: plan.amount,
//         },
//         quantity: 1,
//       },
//     ],
//     mode: "payment",
//     success_url: `https://www.holovox.io/dashboard/pricing?success=true&plan=${planId}&userId=${userId}`,
//     cancel_url: `https://www.holovox.io/dashboard/pricing?cancelled=true`,
//     // success_url: `http://localhost:5173/dashboard/pricing?success=true&plan=${planId}&userId=${userId}`,
//     // cancel_url: `http://localhost:5173/dashboard/pricing?cancelled=true`,
//   });

//   res.json({ id: session.id, url: session.url, });
// });


const createStripeSession = asyncHandler(async (req, res) => {
  const { planId, userId } = req.body;

  if (!planId || !userId) {
    throw new ApiError(400, "planId and userId are required");
  }

  const PLAN_MAP = {
    spark: {
      name: "Spark Plan — HOLOVOX",
      amount: 4995, // matches frontend $49.95
    },
    enterprise: {
      name: "Enterprise Plan — HOLOVOX",
      amount: 19995, // matches frontend $199.95
    },
  };

  const plan = PLAN_MAP[planId];
  if (!plan) {
    throw new ApiError(400, "Invalid plan selected");
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: plan.name,
          },
          unit_amount: plan.amount,
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: `https://www.holovox.io/dashboard/pricing?success=true&plan=${planId}&userId=${userId}`,
    cancel_url: `https://www.holovox.io/dashboard/pricing?cancelled=true`,
    // success_url: `http://localhost:5173/dashboard/pricing?success=true&plan=${planId}&userId=${userId}`,
    // cancel_url: `http://localhost:5173/dashboard/pricing?cancelled=true`,
  });

  res.json({ id: session.id, url: session.url });
});

const updateSubscription = asyncHandler(async (req, res) => {
  console.log("📥 BODY RECEIVED:", req.body);
  const { userId, planId } = req.body;

  if (!userId || !planId) {
    throw new ApiError(400, "userId and planId are required");
  }

  const PLAN_TO_SUB = {
    free: "free",
    spark: "spark",
    enterprise: "enterprise",
  };

  const Subscription = PLAN_TO_SUB[planId];
  if (!Subscription) {
    throw new ApiError(400, "Invalid planId");
  }

  const user = await Profile.findById(userId);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  user.Subscription = Subscription;
  await user.save();

  const token = jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.role,
      name: user.fullName,
      Subscription: user.Subscription,
      meetingUsed: user.meetingUsed || false,
      verified: user.verified || false,
      image: user.ProfilePicture || "",
      status: user.status || "none"
    },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );

  const userData = user.toObject();
  delete userData.password;

  return res.status(200).json(
    new ApiResponse(200, {
      token,
      user: userData,
      subscription: user.Subscription
    }, "Subscription updated successfully")
  );
});


// const updateSubscription = asyncHandler(async (req, res) => {
//   const { userId, planId } = req.body;

//   if (!userId || !planId) {
//     throw new ApiError(400, "userId and planId are required");
//   }

//   const PLAN_TO_SUB = {
//     spark: "spark",
//     "holo-assist": "assist",
//   };

//   const Subscription = PLAN_TO_SUB[planId];
//   if (!Subscription) {
//     throw new ApiError(400, "Invalid planId");
//   }

//   // ✅ Get full user data before update
//   const user = await Profile.findById(userId);
//   if (!user) {
//     throw new ApiError(404, "User not found");
//   }

//   // ✅ Update subscription
//   user.Subscription = Subscription;
//   await user.save();

//   // ✅ Generate NEW token with updated subscription
//   const token = jwt.sign(
//     {
//       id: user._id,
//       email: user.email,
//       role: user.role,
//       name: user.fullName,
//       Subscription: user.Subscription, // ✅ Updated value
//       meetingUsed: user.meetingUsed || false,
//       verified: user.verified || false,
//       image: user.ProfilePicture || "",
//       status: user.status || "none"
//     },
//     process.env.JWT_SECRET,
//     { expiresIn: "1d" }
//   );

//   // ✅ Return user data WITHOUT password
//   const userData = user.toObject();
//   delete userData.password;

//   return res.status(200).json(
//     new ApiResponse(200, { 
//       token, 
//       user: userData,
//       subscription: user.Subscription // ✅ Explicitly send subscription
//     }, "Subscription updated successfully")
//   );
// });


export { RegisterUser, LoginUser, updateUser, sendOtp, verifyOtp, getProfile, getProfileById, createStripeSession, updateSubscription };