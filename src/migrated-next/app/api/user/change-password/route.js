import Profile from "../../../models/Profile.model.js";
import Event from "../../../models/Event.model.js";
import { NextResponse } from "../../../../utils/next-response.js";
import bcrypt from "bcrypt";

export async function PUT(req) {
  try {
    const { userId, currentPassword, newPassword } = await req.json();
    
    // Find user
    const user = await Profile.findById(userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    
    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();
    //create event/notification

    await Event.create({
        userId: userId,
        type: "password.changed",
        title: "Password Updated",
        description: "Your account password has been updated!",
        actionLink: "/dashboard/profile",
        icon: "Lock",  // Lucide icon name
        color: "#10B981"
    })
    return NextResponse.json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}