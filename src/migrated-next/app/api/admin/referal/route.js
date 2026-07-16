import ReferalCode from "../../../../app/models/ReferalCodes.model.js";
import { NextResponse } from "../../../../utils/next-response.js";
import connectDB from "../../../../lib/db.js";

// ✅ POST - Create a new referral code
export async function POST(req) {
    try {
        await connectDB();
        const { name, code, discountPercent, expiryDate } = await req.json();

        if (!name || !code) {
            return NextResponse.json(
                { error: "Name and code are required" },
                { status: 400 }
            );
        }

        // Check if code already exists
        const existingCode = await ReferalCode.findOne({ code: code.toUpperCase() });
        if (existingCode) {
            return NextResponse.json(
                { error: "Referral code already exists" },
                { status: 400 }
            );
        }

        const newCode = await ReferalCode.create({
            name: name.trim(),
            code: code.toUpperCase().trim(),
            discountPercent: discountPercent ? parseFloat(discountPercent) : 0,
            expiryDate: expiryDate || null,
            isActive: true,
            usedCount: 0
        });

        console.log("✅ New referral code created:", newCode.code);
        return NextResponse.json({
            success: true,
            message: "New referral code created!",
            code: newCode
        });
    } catch (error) {
        console.error("POST error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}


// ✅ GET - Fetch all referral codes
export async function GET(req) {
    try {
        await connectDB();
        const codes = await ReferalCode.find().sort({ createdAt: -1 });
        
        return NextResponse.json({
            success: true,
            codes: codes,
            message: `Found ${codes.length} codes`
        });
    } catch (error) {
        console.error("GET error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

export async function PUT(req) {
    try {
        await connectDB();
        const { code, name, discountPercent, expiryDate, isActive } = await req.json();
        
        if (!code) {
            return NextResponse.json(
                { error: "Code is required" },
                { status: 400 }
            );
        }

        const updateData = {};
        if (name) updateData.name = name.trim();
        if (discountPercent !== undefined) updateData.discountPercent = parseFloat(discountPercent);
        if (expiryDate !== undefined) updateData.expiryDate = expiryDate || null;
        if (isActive !== undefined) updateData.isActive = isActive;

        const updatedCode = await ReferalCode.findOneAndUpdate(
            { code: code.toUpperCase() },
            { $set: updateData },
            { new: true, runValidators: true }
        );

        if (!updatedCode) {
            console.log("❌ Code not found:", code);
            return NextResponse.json(
                { error: "Referral code not found" },
                { status: 404 }
            );
        }

        console.log("✅ Referral code updated:", updatedCode.code);
        return NextResponse.json({
            success: true,
            message: "Referral code updated!",
            code: updatedCode
        });
    } catch (error) {
        console.error("PUT error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}


export async function DELETE(req) {
    try {
        await connectDB();
        const { searchParams } = new URL(req.url);
        const code = searchParams.get("code");
        
        if (!code) {
            return NextResponse.json(
                { error: "Code is required" },
                { status: 400 }
            );
        }

        const deletedCode = await ReferalCode.findOneAndDelete({ code: code.toUpperCase() });
        
        if (!deletedCode) {
            console.log("❌ Code not found:", code);
            return NextResponse.json(
                { error: "Referral code not found" },
                { status: 404 }
            );
        }

        console.log("✅ Referral code deleted:", code);
        return NextResponse.json({
            success: true,
            message: "Referral code deleted!"
        });
    } catch (error) {
        console.error("DELETE error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

