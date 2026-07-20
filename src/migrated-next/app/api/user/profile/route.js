// app/api/user/profile/route.js
import connectDB from "../../../../lib/db.js";
import User from "../../../models/Profile.model.js";

console.log("✅ User profile route loaded");

// GET user profile by userId from query parameter
export async function GET(req, res) {
  console.log("📥 GET /api/user/profile - Request received");
  
  try {
    await connectDB();
    
    // Get userId from query parameters
    const url = new URL(req.url, `http://${req.headers.host}`);
    const userId = url.searchParams.get('userId');
    
    console.log("🔍 Looking for user with ID from query:", userId);
    
    if (!userId) {
      console.log("❌ No userId provided in query");
      // ✅ Return object instead of using res
      return {
        status: 400,
        body: { 
          success: false,
          error: "User ID is required" 
        }
      };
    }

    // Find user by ID
    const user = await User.findById(userId)
      .select('-password -__v');

    if (!user) {
      console.log("❌ User not found with ID:", userId);
      return {
        status: 404,
        body: { 
          success: false,
          error: "User not found" 
        }
      };
    }

    console.log("✅ User found:", user.email);

    return {
      status: 200,
      body: {
        success: true,
        user: {
          id: user._id,
          fullName: user.fullName || user.name,
          email: user.email,
          role: user.role,
          subscription: user.Subscription || 'free',
          profilePicture: user.profilePicture || user.ProfilePicture || null,
          isOtpVerified: user.isOtpVerified || false,
          verified: user.verified || false,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        }
      }
    };

  } catch (error) {
    console.error("❌ Error fetching profile:", error);
    return {
      status: 500,
      body: { 
        success: false,
        error: "Failed to fetch profile: " + error.message 
      }
    };
  }
}

// PUT - Update user profile by userId from query parameter
export async function PUT(req, res) {
  console.log("📥 PUT /api/user/profile - Request received");
  
  try {
    await connectDB();
    
    // Get userId from query parameters
   

    // ✅ Get update data from request body
    const body = await req.json();
    const {userId, fullName, role, profilePicture, subscription } = body;
    console.log("📦 Update data:", { fullName, role, profilePicture, subscription });
     if (!userId) {
      console.log("❌ UserId not provided");
      return {
        status: 404,
        body: { 
          success: false,
          error: "UserId not provided" 
        }
      };
    }
    // Find user by ID
    const user = await User.findById(userId);
    
    if (!user) {
      console.log("❌ User not found with ID:", userId);
      return {
        status: 404,
        body: { 
          success: false,
          error: "User not found" 
        }
      };
    }

    // Update fields
    if (fullName) {
      user.fullName = fullName;
    }
   
    if (role) {
      user.role = role;
    }
    if (profilePicture) {
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

    return {
      status: 200,
      body: {
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
          updatedAt: updatedUser.updatedAt,
        }
      }
    };

  } catch (error) {
    console.error("❌ Error updating profile:", error);
    return {
      status: 500,
      body: { 
        success: false,
        error: "Failed to update profile: " + error.message 
      }
    };
  }
}