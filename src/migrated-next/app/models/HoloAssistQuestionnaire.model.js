import mongoose from "mongoose";

const HoloAssistQuestionnaireSchema = new mongoose.Schema(
  {
    user_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    
    // Section 1 - Who You Are (Q1-Q3)
    name: {
      type: String,
      default: "",
      trim: true,
    },
    role: {
      type: String,
      default: "",
      trim: true,
    },
    industry: {
      type: String,
      default: "",
      trim: true,
    },
    winning: {
      type: String,
      default: "",
      trim: true,
    },
    
    // Section 2 - Challenges and Goals (Q4-Q6)
    challenge: {
      type: String,
      default: "",
      trim: true,
    },
    wish_words: {
      type: String,
      default: "",
      trim: true,
    },
    goals: {
      type: [String],
      default: [],
    },
    
    // Section 3 - Coaching Style (Q7-Q9)
    coaching_style: {
      type: String,
      default: "",
      trim: true,
    },
    tone: {
      type: String,
      default: "",
      trim: true,
    },
    never_do: {
      type: String,
      default: "",
      trim: true,
    },
    
    // Section 4 - Personal Context (Q10-Q12)
    personal_support: {
      type: String,
      default: "",
      trim: true,
    },
    unique_trait: {
      type: String,
      default: "",
      trim: true,
    },
    superpower: {
      type: String,
      default: "",
      trim: true,
    },
    
    // Section 5 - Final Power Questions (Q13-Q15)
    dominance: {
      type: String,
      default: "5",
      trim: true,
    },
    life_change: {
      type: String,
      default: "",
      trim: true,
    },
    remember_me: {
      type: String,
      default: "",
      trim: true,
    },
    
    // ✅ NEW FIELDS - Experience & Motivation (Q4-Q8 from new section)
    experience_years: {
      type: String,
      default: "",
      trim: true,
    },
    self_rating: {
      type: String,
      default: "5",
      trim: true,
    },
    tried_tools: {
      type: [String],
      default: [],
    },
    motivation: {
      type: String,
      default: "",
      trim: true,
    },
    fear: {
      type: String,
      default: "",
      trim: true,
    },
    
    // Legacy fields (kept for backward compatibility)
    call_types: {
      type: [String],
      default: [],
    },
    pace: {
      type: String,
      default: "",
      trim: true,
    },
    weakness: {
      type: String,
      default: "",
      trim: true,
    },
    strengths: {
      type: String,
      default: "",
      trim: true,
    },
    context: {
      type: String,
      default: "",
      trim: true,
    },
    reminder_style: {
      type: String,
      default: "Balanced — cards as needed",
      trim: true,
    },
    ar_enabled: {
      type: Boolean,
      default: false,
    },
    updated_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: "holo_assist_questionnaire",
    strict: false,
  },
);

// Index for faster queries
HoloAssistQuestionnaireSchema.index({ user_id: 1 });

const HoloAssistQuestionnaire =
  mongoose.models.HoloAssistQuestionnaire ||
  mongoose.model("HoloAssistQuestionnaire", HoloAssistQuestionnaireSchema);

export default HoloAssistQuestionnaire; 