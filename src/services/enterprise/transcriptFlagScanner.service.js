import FlagWord from "../../models/enterprise/FlagWord.model.js";
import MeetingTranscript from "../../models/enterprise/MeetingTranscript.model.js";
import UserFlag from "../../models/enterprise/UserFlag.model.js";
import EnterpriseProfile from "../../migrated-next/app/models/EnterpriseProfile.model.js";

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildWordRegex = (value) => {
  const tokens = String(value || "")
    .toLowerCase()
    .replace(/[^\w\s'-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(escapeRegExp);

  if (!tokens.length) return null;
  return new RegExp(`\\b${tokens.join("[\\s\\W_]+")}\\b`, "i");
};

const quoteAround = (text, index, length) => {
  const start = Math.max(0, index - 60);
  const end = Math.min(text.length, index + length + 60);
  return text.slice(start, end).trim();
};

export const scanTranscriptForFlags = async ({
  organizationId,
  meetingId,
  text,
  participantMemberId,
  participantName,
  hostMemberId,
}) => {
  const transcript = await MeetingTranscript.create({
    organizationId,
    meetingId,
    hostMemberId: hostMemberId || null,
    participantMemberId: participantMemberId || null,
    participantName: participantName || "",
    text,
  });

  const flagWords = await FlagWord.find({ organizationId, type: "flag" }).lean();
  const participant = participantMemberId
    ? await EnterpriseProfile.findById(participantMemberId).select("parentId role").lean()
    : null;

  const created = [];
  for (const flagWord of flagWords) {
    const regex = buildWordRegex(flagWord.normalizedWord || flagWord.word);
    if (!regex) continue;
    const match = regex.exec(text);
    if (!match) continue;

    try {
      const userFlag = await UserFlag.create({
        organizationId,
        meetingId,
        transcriptId: transcript._id,
        flagWordId: flagWord._id,
        flaggedMemberId: participantMemberId || null,
        managerId: participant?.parentId || null,
        quote: quoteAround(text, match.index, match[0].length),
        matchedWord: flagWord.word,
        severity: flagWord.severity,
      });
      created.push(userFlag);
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }

  transcript.scannedAt = new Date();
  await transcript.save();

  return { transcript, flags: created };
};
