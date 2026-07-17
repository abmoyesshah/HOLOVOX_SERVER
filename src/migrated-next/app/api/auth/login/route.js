// app/api/auth/login/route.js
import Profile from "../../../models/Profile.model.js";
import { NextResponse } from "../../../../utils/next-response.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import connectDB from "../../../../lib/db.js";
import EnterpriseProfile from "../../../models/EnterpriseProfile.model.js";

export async function POST(req) {
  try {
    // get data from body
    const { email, password } = await req.json();
    console.log("Login Payload:", email);
    await connectDB();

    // validation
    if (!email || !password) {
      return NextResponse.json(
        {
          success: false,
          error: "All fields are required",
        },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase();

    // 1. First try to find user in Profile table
    let profileUser = await Profile.findOne({
      email: normalizedEmail,
    }).lean();

    // 2. Then try to find user in EnterpriseProfile table
    let enterpriseUser = await EnterpriseProfile.findOne({
      email: normalizedEmail,
    }).lean();
    console.log("email: ",normalizedEmail," enterpriseUser: ",enterpriseUser)

    // 3. Check if user exists in either table
    if (!profileUser && !enterpriseUser) {
      return NextResponse.json(
        {
          success: false,
          error: "User does not exist",
        },
        { status: 400 }
      );
    }

    // 4. Determine which user to use for login
    let user = null;
    let userType = null;

    // Priority: If user exists in both, prefer the one with correct password
    if (profileUser && enterpriseUser) {
      // Check which password matches
      const profileMatch = await bcrypt.compare(password, profileUser.password);
      const enterpriseMatch = await bcrypt.compare(password, enterpriseUser.password);

      if (profileMatch && enterpriseMatch) {
        // Both match - default to Profile (you can change this preference)
        user = profileUser;
        userType = "profile";
      } else if (profileMatch) {
        user = profileUser;
        userType = "profile";
      } else if (enterpriseMatch) {
        user = enterpriseUser;
        userType = "enterprise";
      } else {
        return NextResponse.json(
          {
            success: false,
            error: "Password does not match",
          },
          { status: 400 }
        );
      }
    } else if (profileUser) {
      // Only in Profile table
      const isMatch = await bcrypt.compare(password, profileUser.password);
      if (!isMatch) {
        return NextResponse.json(
          {
            success: false,
            error: "Password does not match",
          },
          { status: 400 }
        );
      }
      user = profileUser;
      userType = "profile";
    } else if (enterpriseUser) {
      // Only in EnterpriseProfile table
      const isMatch = await bcrypt.compare(password, enterpriseUser.password);
      if (!isMatch) {
        return NextResponse.json(
          {
            success: false,
            error: "Password does not match",
          },
          { status: 400 }
        );
      }
      user = enterpriseUser;
      userType = "enterprise";
    }

    // 5. Check if user is verified (for Profile users) or OTP verified (for Enterprise users)
    if (userType === "profile") {
      // Profile users: check isOtpVerified field
      if (!user.isOtpVerified) {
        return NextResponse.json(
          {
            success: false,
            error: "Account not verified. Please verify your OTP.",
          },
          { status: 401 }
        );
      }
    } else if (userType === "enterprise") {
      // Enterprise users: check isOtpVerified field
      if (!user.isOtpVerified) {
        return NextResponse.json(
          {
            success: false,
            error: "Account not verified. Please verify your OTP.",
          },
          { status: 401 }
        );
      }
    }

    // 6. Determine subscription based on user type
    let subscription = user?.Subscription || "free";
    
    // If user is from enterprise, set appropriate subscription
    if (userType === "enterprise") {
      subscription = user?.Subscription || "enterprise-user";
    }

    // 7. Create JWT token with user data
    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        role: user?.role || "user",
        name: user?.fullName || user?.name || "",
        verified: user?.verified || false,
        isOtpVerified: user?.isOtpVerified || false,
        image: user?.ProfilePicture || user?.image || "",
        status: user?.status || "none",
        subscription: subscription,
        userType: userType, // Add user type to identify source
        enterpriseId: user?.enterpriseId || null, // For enterprise users
        addedBy: user?.addedBy || null, // For enterprise users
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "1d",
      }
    );

    console.log(`User logged in: ${user.email} (${userType})`);

    // 8. Return response
    return NextResponse.json(
      {
        success: true,
        message: "User Logged In Successfully",
        token: token,
        user: {
          id: user._id,
          email: user.email,
          name: user?.fullName || user?.name || "",
          role: user?.role || "user",
          subscription: subscription,
          userType: userType,
          isOtpVerified: user?.isOtpVerified || false,
        },
      },
      { status: 200 }
    );

  } catch (error) {
    console.error("LOGIN ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Internal Server Error",
      },
      { status: 500 }
    );
  }
}