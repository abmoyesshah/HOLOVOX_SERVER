import { NextResponse } from "../../../../utils/next-response.js";
import jwt from "jsonwebtoken";
import connectDB from "../../../../lib/db.js";
import Profile from "../../../models/Profile.model.js";
import EnterpriseProfile from "../../../models/EnterpriseProfile.model.js";

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function subscriptionRank(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "enterprise" || normalized === "enterprise-user" || normalized === "enterprise-manager") return 3;
  if (normalized === "spark") return 2;
  if (normalized === "free") return 1;
  return 0;
}

function pickBestUser(profileUser, enterpriseUser) {
  if (!profileUser) return { user: enterpriseUser, userType: enterpriseUser ? "enterprise" : null };
  if (!enterpriseUser) return { user: profileUser, userType: "profile" };

  const profileScore = subscriptionRank(profileUser?.Subscription || profileUser?.subscription);
  const enterpriseScore = subscriptionRank(enterpriseUser?.Subscription || enterpriseUser?.subscription);

  if (enterpriseScore > profileScore) {
    return { user: enterpriseUser, userType: "enterprise" };
  }

  return { user: profileUser, userType: "profile" };
}

export async function POST(req) {
  try {
    const { email, name, picture, googleAccessToken } = await req.json();
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !name || !googleAccessToken) {
      return NextResponse.json(
        { success: false, error: "email, name and googleAccessToken are required" },
        { status: 400 }
      );
    }

    // Verify Google token against Google userinfo API to prevent spoofed email payloads.
    const googleResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${googleAccessToken}` },
      cache: "no-store",
    });

    if (!googleResponse.ok) {
      return NextResponse.json(
        { success: false, error: "Invalid Google access token" },
        { status: 401 }
      );
    }

    const googleUser = await googleResponse.json();
    const googleEmail = normalizeEmail(googleUser?.email);
    if (!googleEmail || googleEmail !== normalizedEmail) {
      return NextResponse.json(
        { success: false, error: "Google account email mismatch" },
        { status: 401 }
      );
    }

    await connectDB();

    const emailMatcher = new RegExp(`^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    const [profileUser, enterpriseUser] = await Promise.all([
      Profile.findOne({ email: emailMatcher }),
      EnterpriseProfile.findOne({ email: emailMatcher }),
    ]);

    const selected = pickBestUser(profileUser, enterpriseUser);
    let user = selected.user;
    let userType = selected.userType || "profile";

    if (!user) {
      user = await Profile.create({
        email: normalizedEmail,
        fullName: name,
        role: "user",
        isOtpVerified: true,
        verified: true,
        Subscription: "free",
        profilePicture: picture || "",
      });
      userType = "profile";
    } else {
      const updates = {
        fullName: user?.fullName || name,
        profilePicture: picture || user?.profilePicture || "",
      };
      user = await (userType === "profile"
        ? Profile.findByIdAndUpdate(user._id, updates, { new: true })
        : EnterpriseProfile.findByIdAndUpdate(user._id, updates, { new: true }));
    }

    const subscription =
      user?.Subscription ||
      user?.subscription ||
      (userType === "enterprise" ? "enterprise-user" : "free");

    const token = jwt.sign(
      {
        id: user._id,
        _id: user._id,
        email: user.email,
        role: user?.role || "user",
        name: user?.fullName || user?.name || "",
        verified: user?.verified || false,
        isOtpVerified: user?.isOtpVerified || false,
        image: user?.profilePicture || user?.ProfilePicture || user?.image || "",
        status: user?.status || "none",
        subscription,
        userType,
        enterpriseId: user?.enterpriseId || null,
        addedBy: user?.addedBy || null,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "1d",
      }
    );

    return NextResponse.json(
      {
        success: true,
        message: "Google login successful",
        token,
        user: {
          id: user._id,
          email: user.email,
          name: user?.fullName || user?.name || "",
          role: user?.role || "user",
          subscription,
          userType,
          isOtpVerified: user?.isOtpVerified || false,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("GOOGLE LOGIN ERROR:", error);
    return NextResponse.json(
      { success: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}