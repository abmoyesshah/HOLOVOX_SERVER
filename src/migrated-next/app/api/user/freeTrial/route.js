// app/api/user/freeTrial/route.js
import { NextResponse } from "../../../../utils/next-response.js";
import FreeTrialProfiles from "../../../models/FreeTrialProfiles.model.js";
import Profile from "../../../../../models/Profile.model.js"; // Import User model to find the user

export async function POST(req, res) {
    try {
        // Parse request body
        const body = await req.json();
        const { userId, cardDetails, trialPeriod = 7, plan = 'spark', email, fullName } = body;

        // Validate required fields
        if (!userId) {
            return NextResponse.json(
                { error: "User ID is required" },
                { status: 400 }
            );
        }

        if (!cardDetails) {
            return NextResponse.json(
                { error: "Card details are required" },
                { status: 400 }
            );
        }

        // Validate card details
        if (!cardDetails.cardNum || !cardDetails.expiryDate || !cardDetails.cvv || !cardDetails.nameOnCard) {
            return NextResponse.json(
                { error: "All card details are required" },
                { status: 400 }
            );
        }

        // Check if user already has a trial
        const existingTrial = await FreeTrialProfiles.findOne({ id: userId });
        if (existingTrial) {
            return NextResponse.json(
                { error: "User already has an active trial" },
                { status: 400 }
            );
        }

        // Find the user to get their details
        const user = await Profile.findById(userId);
        if (!user) {
            return NextResponse.json(
                { error: "User not found" },
                { status: 404 }
            );
        }

        // Create the free trial profile
        const freeProfile = await FreeTrialProfiles.create({
            id: userId,
            fullName: fullName || user.fullName || user.name,
            email: email || user.email,
            Subscription: 'spark', // Set to spark during trial
            trialDays: trialPeriod,
            trialStartDate: new Date(),
            trialEndDate: new Date(Date.now() + trialPeriod * 24 * 60 * 60 * 1000), // Calculate end date
            cardDetails: {
                cardNum: cardDetails.cardNum,
                expiryDate: cardDetails.expiryDate,
                cvv: cardDetails.cvv,
                nameOnCard: cardDetails.nameOnCard,
            },
            isTrialActive: true,
            trialStatus: 'active',
        });

           // ✅ Update the user's profile with trial fields
        const updatedUser = await Profile.findByIdAndUpdate(
            userId,
            {
                $set: {
                    Subscription: 'spark',
                    trialActive: true,
                    trialStartDate: new Date(),
                    trialEndDate: new Date(Date.now() + trialPeriod * 24 * 60 * 60 * 1000),
                    trialDays: trialPeriod,
                }
            },
            { 
                new: true, // Return the updated document
                runValidators: true // Run schema validators
            }
        );

        console.log("✅ User profile updated:", updatedUser.email);
        console.log("📊 User subscription:", updatedUser.Subscription);
        console.log("📊 User trialActive:", updatedUser.trialActive);
        console.log("📊 User trialEndDate:", updatedUser.trialEndDate);
        console.log("📊 User trialDays:", updatedUser.trialDays);

        // Return success response
        return NextResponse.json({
            success: true,
            message: "Free trial started successfully!",
            data: {
                userId: freeProfile.id,
                plan: freeProfile.Subscription,
                trialDays: freeProfile.trialDays,
                trialEndDate: freeProfile.trialEndDate,
                email: freeProfile.email,
                fullName: freeProfile.fullName,
            }
        }, { status: 201 });

    } catch (error) {
        console.error("❌ Error starting free trial:", error);
        return NextResponse.json(
            { 
                error: "Internal server error: " + error.message,
                success: false
            },
            { status: 500 }
        );
    }
}

export async function PUT(req, res) {
    try {
        // Parse request body
         const url = new URL(req.url, `http://${req.headers.host}`);
         const userId = url.searchParams.get('userId');

        // Validate required fields
        if (!userId) {
            return NextResponse.json(
                { error: "User ID is required" },
                { status: 400 }
            );
        }

        // Check if user already has a trial
        const existingTrial = await FreeTrialProfiles.findOne({ id: userId });
        if (!existingTrial) {
            return NextResponse.json({
            error: "free trial profile not found"
        }, { status: 400 });

        }

        existingTrial.isTrialActive = false;
        existingTrial.trialStatus = "cancelled";
        existingTrial.trialEndDate = new Date();
        existingTrial.save();

        const user = await await Profile.findByIdAndUpdate(
            userId,
            {
                $set: {
                    Subscription: 'free',
                    trialActive: false,
                    trialEndDate: new Date(),
                }
            },
            { 
                new: true, // Return the updated document
                runValidators: true // Run schema validators
            }
        );
        const planDetails = {
            free: {
                name: 'Free',
                price: '$0',
                features: ['Basic features', 'Limited access', 'Community support']
            },
            spark: {
                name: 'Spark',
                price: '$49.95',
                features: [
                    'Live AI assist during calls',
                    'Voice Agents (100 tokens)',
                    'AI Skills & playbooks',
                    'Translation in real time',
                    'Custom soundbites & topic tracker'
                ]
            },
            enterprise: {
                name: 'Enterprise',
                price: 'Custom',
                features: [
                    'Full access to all features',
                    'Dedicated support',
                    'Custom integrations',
                    'Advanced analytics',
                    'Team management'
                ]
            },
            assist: {
                name: 'Assist',
                price: '$29.95',
                features: [
                    'AI assistance',
                    'Meeting summaries',
                    'Basic transcripts',
                    'Email support'
                ]
            }
        };

        // Get subscription from user or trial
        const subscription = user.Subscription || 'free';
        const isTrialActive = user.trialActive || false;
        const trialEndDate = user.trialEndDate || null;
        const trialDays = user.trialDays || 0;

        // Prepare billing data matching the interface
        const billingData = {
            subscription: subscription,
            trialActive: isTrialActive,
            trialEndDate: trialEndDate ? trialEndDate.toISOString() : null,
            trialDays: trialDays,
            plan: planDetails[subscription] || planDetails.free,
        };

        return NextResponse.json({
            success: true,
            data: billingData
        });

    } catch (error) {
        console.error("❌ Error finding free profile:", error);
        return NextResponse.json(
            { 
                error: "Internal server error: " + error.message,
                success: false
            },
            { status: 500 }
        );
    }
}