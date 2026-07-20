// app/api/enterprise/manager/flags/route.js
import UserFlag from "../../../../../../models/enterprise/UserFlag.model.js";
import { NextResponse } from "../../../../../utils/next-response.js";

export async function GET(req) {
    try {
        // ✅ Fix: Use req.url instead of req.URL
        const url = new URL(req.url);
        const managerId = url.searchParams.get("managerId");
        
        if (!managerId) {
            return NextResponse.json({
                success: false,
                error: "Manager ID is required"
            }, { status: 400 });
        }

        // ✅ Find flags by managerId
        const flags = await UserFlag.find({ managerId: managerId })
            .populate('flaggedMemberId', 'fullName email profilePicture')
            .populate('managerId', 'fullName email')
            .sort({ createdAt: -1 }); // Most recent first

        // ✅ Count open flags (statuses that are not resolved)
        const openStatuses = ['flagged', 'manager_review', 'rep_coached', 'repaired'];
        const openFlags = flags.filter(flag => openStatuses.includes(flag.status));
        const openFlagsCount = openFlags.length;

        // ✅ Format the response to match your frontend expectations
        const formattedFlags = flags.map(flag => ({
            id: flag._id,
            title: flag.matchedWord || "Flag detected",
            matchedWord: flag.matchedWord,
            severity: flag.severity || "medium",
            repName: flag.flaggedMemberId?.fullName || flag.flaggedMemberId?.name || "Unknown",
            who: flag.flaggedMemberId?.email || "Unknown",
            quote: flag.quote || "",
            stage: flag.status === 'flagged' ? 0 : 
                   flag.status === 'manager_review' ? 1 :
                   flag.status === 'rep_coached' ? 2 :
                   flag.status === 'repaired' ? 3 : 4,
            status: flag.status,
            occurredAt: flag.occurredAt,
            resolvedAt: flag.resolvedAt,
        }));

        return NextResponse.json({
            success: true,
            flags: formattedFlags,
            count: formattedFlags.length,
            openCount: openFlagsCount, // ✅ Open flags count
            severityCounts: {
                high: flags.filter(f => f.severity === 'high').length,
                medium: flags.filter(f => f.severity === 'medium').length,
                low: flags.filter(f => f.severity === 'low').length,
            },
            statusCounts: {
                flagged: flags.filter(f => f.status === 'flagged').length,
                manager_review: flags.filter(f => f.status === 'manager_review').length,
                rep_coached: flags.filter(f => f.status === 'rep_coached').length,
                repaired: flags.filter(f => f.status === 'repaired').length,
                resolved: flags.filter(f => f.status === 'resolved').length,
            }
        }, { status: 200 });

    } catch (error) {
        console.error("❌ Error fetching flags:", error);
        return NextResponse.json({
            success: false,
            error: "Internal error: " + error.message
        }, { status: 500 });
    }
}