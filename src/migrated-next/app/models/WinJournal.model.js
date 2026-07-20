import mongoose from "mongoose";

const WinJournalSchema = new mongoose.Schema(
  {
    user_id: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    entry_date: {
      type: Date,
      default: Date.now,
      index: true,
    },
    topic: {
      type: String,
      default: "",
      trim: true,
    },
    entry_text: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
    collection: "win_journal",
  },
);

WinJournalSchema.index({ user_id: 1, entry_date: -1 });

const WinJournal =
  mongoose.models.WinJournal ||
  mongoose.model("WinJournal", WinJournalSchema);

export default WinJournal;