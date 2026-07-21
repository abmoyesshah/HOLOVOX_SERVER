// app/api/user/billing/route.js
import { NextResponse } from "../../../../utils/next-response.js";
import Profile from "../../../models/Profile.model.js";
import FreeTrialProfiles from "../../../models/FreeTrialProfiles.model.js";
import EnterpriseProfile from "../../../models/EnterpriseProfile.model.js";


// Plan details configuration
const PLAN_DETAILS = {
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

export async function GET(req, res) {
    try {
        // Get userId from query parameters
        const url = new URL(req.url, `http://${req.headers.host}`);
        const userId = url.searchParams.get('userId');

        // Validate required fields
        if (!userId) {
            return NextResponse.json(
                { 
                    success: false,
                    error: "User ID is required" 
                },
                { status: 400 }
            );
        }

        // Find the user to get their details
        let user = await Profile.findById(userId);

        if (!user){
            user = await EnterpriseProfile.findById(userId);
        }
        if (!user) {
            return NextResponse.json(
                { 
                    success: false,
                    error: "User not found" 
                },
                { status: 404 }
            );
        }

        // Check if user has a trial
        const trial = await FreeTrialProfiles.findOne({ id: userId });

        // Initialize variables with user data as fallback
        let subscription = user.subscription || user.Subscription || 'free';
        let isTrialActive = user.trialActive || false;
        let trialEndDate = user.trialEndDate || null;
        let trialDays = user.trialDays || 0;
        let cardDetails = null;

        // ✅ If trial exists and is active, use trial data
        if (trial && trial.isTrialActive === true) {
            console.log("📊 Using trial data for user:", userId);
            
            // Override with trial data
            subscription = trial.Subscription || 'spark';
            isTrialActive = true;
            trialEndDate = trial.trialEndDate || null;
            trialDays = trial.trialDays || 7;
            
            // Get card details from trial
            if (trial.cardDetails) {
                cardDetails = {
                    cardNum: trial.cardDetails.cardNum || '••••••••••••••••',
                    expiryDate: trial.cardDetails.expiryDate || '••/••',
                    nameOnCard: trial.cardDetails.nameOnCard || '••••••••',
                };
            }
        } 
        // ✅ If trial exists but is not active, check user profile for trial data
        else if (trial && trial.isTrialActive === false) {
            console.log("📊 Trial expired, using user profile data for:", userId);
            
            // Use user data if available, otherwise fallback to trial data
            subscription = user.subscription || user.Subscription || trial.Subscription || 'free';
            isTrialActive = false;
            trialEndDate = user.trialEndDate || trial.trialEndDate || null;
            trialDays = user.trialDays || trial.trialDays || 0;
            
            // Get card details from user if available
            if (user.cardDetails) {
                cardDetails = {
                    cardNum: user.cardDetails.cardNum || '••••••••••••••••',
                    expiryDate: user.cardDetails.expiryDate || '••/••',
                    nameOnCard: user.cardDetails.nameOnCard || '••••••••',
                };
            } else if (trial.cardDetails) {
                cardDetails = {
                    cardNum: trial.cardDetails.cardNum || '••••••••••••••••',
                    expiryDate: trial.cardDetails.expiryDate || '••/••',
                    nameOnCard: trial.cardDetails.nameOnCard || '••••••••',
                };
            }
        }
        // ✅ No trial exists, use user profile data only
        else {
            console.log("📊 No trial found, using user profile data for:", userId);
            
            subscription = user.subscription || user.Subscription || 'free';
            isTrialActive = user.trialActive || false;
            trialEndDate = user.trialEndDate || null;
            trialDays = user.trialDays || 0;
            
            // Get card details from user if available
            if (user.cardDetails) {
                cardDetails = {
                    cardNum: user.cardDetails.cardNum || '••••••••••••••••',
                    expiryDate: user.cardDetails.expiryDate || '••/••',
                    nameOnCard: user.cardDetails.nameOnCard || '••••••••',
                };
            }
        }

        // Prepare billing data matching the interface
        const billingData = {
            subscription: subscription,
            trialActive: isTrialActive,
            trialEndDate: trialEndDate ? trialEndDate.toISOString() : null,
            trialDays: trialDays,
            cardDetails: cardDetails,
            plan: PLAN_DETAILS[subscription] || PLAN_DETAILS.free,
        };

        return NextResponse.json({
            success: true,
            data: billingData
        });

    } catch (error) {
        console.error("❌ Error fetching billing data:", error);
        return NextResponse.json(
            { 
                success: false,
                error: "Internal server error: " + error.message
            },
            { status: 500 }
        );
    }
}