import mongoose from "mongoose";

const suggestionCardSchema = new mongoose.Schema({
    userId: {type: String, ref: "user", required: true},
    cardId: {type: String,  required: true},
    roomId: {type: String, required: true, ref: "meeting"},
    type: {type: String},
    text: {type: String},
}, {timestamps: true})

const SuggestionCard =
  mongoose.models.SuggestionCard ||
  mongoose.model("SuggestionCard", suggestionCardSchema);

export default SuggestionCard;