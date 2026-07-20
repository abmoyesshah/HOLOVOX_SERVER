import mongoose from "mongoose";

const ReferalCodeSchema = new mongoose.Schema(
    {
        code: { 
            type: String, 
            required: true, 
            unique: true,
            uppercase: true,
            trim: true
        },
        name: { 
            type: String, 
            required: true,
            trim: true
        },
        discountPercent: { 
            type: Number, 
            default: 0,
            min: 0,
            max: 100
        },
        isActive: { 
            type: Boolean, 
            default: true 
        },
        usedCount: { 
            type: Number, 
            default: 0,
            min: 0
        },
        expiryDate: {
            type: Date,
            default: null
        }
    },
    { 
        timestamps: true, 
        collection: "referalCodes" 
    }
);


const ReferalCode = mongoose.models.ReferalCode || mongoose.model("ReferalCode", ReferalCodeSchema);
export default ReferalCode;