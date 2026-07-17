// app/api/user/profile/route.js
import { NextResponse } from "next/server"; // ✅ Use Next.js built-in
import { connectDB } from "../../../lib/db.js";
import User from "../../../models/User.js";
import { verifyToken } from "../../../utils/auth.js";

// ✅ Debug log to confirm route is loaded
console.log("✅ User profile route loaded!");

// GET user profile
export async function GET(request) {
  console.log("📥 GET /api/user/profile - Request received");
  
  try {
    await connectDB();
    
    // Get token from headers
    const authHeader = request.headers.get('authorization');
    console.log("🔑 Auth header:", authHeader ? "Present" : "Missing");
    
    const token = authHeader?.replace('Bearer ', '');
    
    if (!token) {
      console.log("❌ No token provided");
      return NextResponse.json(
        { error: "Unauthorized - No token provided" },
        { status: 401 }
      );
    }

    // Verify token
    const decoded = verifyToken(token);
    console.log("👤 Decoded token:", decoded ? "Valid" : "Invalid");
    
    if (!decoded) {
      return NextResponse.json(
        { error: "Unauthorized - Invalid token" },
        { status: 401 }
      );
    }

    // Find user
    const userId = decoded.userId || decoded.id;
    console.log("🔍 Looking for user:", userId);
    
    const user = await User.findById(userId)
      .select('-password -__v');

    if (!user) {
      console.log("❌ User not found");
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    console.log("✅ User found:", user.email);

    return NextResponse.json({
      success: true,
      user: {
        id: user._id,
        fullName: user.fullName || user.name,
        email: user.email,
        role: user.role,
        subscription: user.subscription || 'free',
        profilePicture: user.profilePicture || user.ProfilePicture || null,
        isOtpVerified: user.isOtpVerified || false,
        verified: user.verified || false,
        createdAt: user.createdAt,
      }
    });

  } catch (error) {
    console.error("❌ Error fetching profile:", error);
    return NextResponse.json(
      { error: "Failed to fetch profile: " + error.message },
      { status: 500 }
    );
  }
}

// PUT - Update user profile
export async function PUT(request) {
  console.log("📥 PUT /api/user/profile - Request received");
  
  try {
    await connectDB();
    
    // Get token from headers
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    if (!token) {
      console.log("❌ No token provided");
      return NextResponse.json(
        { error: "Unauthorized - No token provided" },
        { status: 401 }
      );
    }

    // Verify token
    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: "Unauthorized - Invalid token" },
        { status: 401 }
      );
    }

    // Get update data
    const body = await request.json();
    console.log("📦 Update data:", body);
    
    const { fullName, name, role, profilePicture, subscription } = body;

    // Find user
    const userId = decoded.userId || decoded.id;
    const user = await User.findById(userId);
    
    if (!user) {
      console.log("❌ User not found");
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Update fields
    if (fullName) {
      user.fullName = fullName;
      user.name = fullName;
    }
    if (name) {
      user.name = name;
      if (!fullName) user.fullName = name;
    }
    if (role) {
      user.role = role;
    }
    if (profilePicture) {
      user.profilePicture = profilePicture;
      user.ProfilePicture = profilePicture;
    }
    if (subscription) {
      user.subscription = subscription;
    }

    // Save user
    await user.save();
    console.log("✅ User updated:", user.email);

    // Return updated user
    const updatedUser = user.toObject();
    delete updatedUser.password;
    delete updatedUser.__v;

    return NextResponse.json({
      success: true,
      message: "Profile updated successfully",
      user: {
        id: updatedUser._id,
        fullName: updatedUser.fullName || updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        subscription: updatedUser.subscription,
        profilePicture: updatedUser.profilePicture || updatedUser.ProfilePicture || null,
        isOtpVerified: updatedUser.isOtpVerified || false,
        verified: updatedUser.verified || false,
        createdAt: updatedUser.createdAt,
      }
    });

  } catch (error) {
    console.error("❌ Error updating profile:", error);
    return NextResponse.json(
      { error: "Failed to update profile: " + error.message },
      { status: 500 }
    );
  }
}