// app/api/user/profile/route.js
import { NextResponse } from "../../../utils/next-response.js";
import { connectDB } from "../../../lib/db.js";
import User from "../../../models/User.js";
import { verifyToken } from "../../../utils/auth.js";

// GET user profile
export async function GET(req) {
  try {
    await connectDB();
    
    // Get token from headers
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    
    if (!token) {
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

    // Find user
    const user = await User.findById(decoded.userId || decoded.id)
      .select('-password -__v'); // Exclude sensitive fields

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

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
export async function PUT(req) {
  try {
    await connectDB();
    
    // Get token from headers
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    
    if (!token) {
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
    const body = await req.json();
    const { fullName, name, role, profilePicture, subscription } = body;

    // Find user
    const user = await User.findById(decoded.userId || decoded.id);
    
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Update fields
    if (fullName) {
      user.fullName = fullName;
      user.name = fullName; // For backward compatibility
    }
    if (name) {
      user.name = name;
      if (!fullName) user.fullName = name; // For backward compatibility
    }
    if (role) {
      user.role = role;
    }
    if (profilePicture) {
      user.profilePicture = profilePicture;
      user.ProfilePicture = profilePicture; // For backward compatibility
    }
    if (subscription) {
      user.subscription = subscription;
    }

    // Save user
    await user.save();

    // Return updated user (without sensitive fields)
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