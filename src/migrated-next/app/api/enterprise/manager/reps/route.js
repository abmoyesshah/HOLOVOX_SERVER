// app/api/enterprise/reps/route.js
import { NextResponse } from "../../../../../utils/next-response.js";
import EnterpriseProfile from "../../../../models/EnterpriseProfile.model.js";

export async function GET(req) {
    try {
        // ✅ Fix: Use URL constructor properly
        const url = new URL(req.url);
        const managerId = url.searchParams.get("managerId");
        
        if (!managerId) {
            return NextResponse.json({
                error: "Manager ID is required"
            }, { status: 400 });
        }

        // ✅ Find all enterprise profiles where parentId matches managerId
        const reps = await EnterpriseProfile.find({ parentId: managerId });
        
        return NextResponse.json({
            success: true,
            reps: reps,
            count: reps.length
        }, { status: 200 });
        
    } catch (error) {
        console.error("❌ Error fetching reps:", error);
        return NextResponse.json({
            success: false,
            error: "Internal server error: " + error.message
        }, { status: 500 });
    }
}