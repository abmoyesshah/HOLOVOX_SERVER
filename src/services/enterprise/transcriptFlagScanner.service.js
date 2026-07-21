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
  const matchTokens =
    tokens.length > 1 && /^\d+$/.test(tokens[0]) ? tokens.slice(1) : tokens;

  if (!matchTokens.length) return null;
  return new RegExp(`\\b${matchTokens.map(escapeRegExp).join("[\\s\\W_]+")}\\b`, "i");
};

const quoteAround = (text, index, length) => {
  const start = Math.max(0, index - 60);
  const end = Math.min(text.length, index + length + 60);
  return text.slice(start, end).trim();
};

export const scanTranscriptForFlags = async ({
  organizationId,
  meetingId,
  enterpriseMeetingId,
  normalTranscriptId,
  text,
  participantMemberId,
  participantName,
  hostMemberId,
  speakerUserId,
  speakerMemberId,
  speakerRole,
  segment,
}) => {
  if (normalTranscriptId) {
    const existingTranscript = await MeetingTranscript.findOne({ normalTranscriptId });
    if (existingTranscript) return { transcript: existingTranscript, flags: [] };
  }

  const transcript = await MeetingTranscript.create({
    organizationId,
    meetingId,
    enterpriseMeetingId: enterpriseMeetingId || null,
    normalTranscriptId: normalTranscriptId || null,
    hostMemberId: hostMemberId || null,
    participantMemberId: participantMemberId || null,
    participantName: participantName || "",
    speakerUserId: speakerUserId || null,
    speakerMemberId: speakerMemberId || participantMemberId || null,
    speakerRole: speakerRole || null,
    text,
    segment: segment || null,
  });

  if (!["manager", "rep"].includes(speakerRole)) {
    transcript.scannedAt = new Date();
    await transcript.save();
    return { transcript, flags: [] };
  }

  const flagWords = await FlagWord.find({ organizationId, type: "flag" }).lean();
  const participant = (speakerMemberId || participantMemberId)
    ? await EnterpriseProfile.findById(speakerMemberId || participantMemberId).select("parentId role").lean()
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
        enterpriseMeetingId: enterpriseMeetingId || null,
        transcriptId: transcript._id,
        flagWordId: flagWord._id,
        flaggedMemberId: speakerMemberId || participantMemberId || null,
        speakerUserId: speakerUserId || null,
        speakerMemberId: speakerMemberId || participantMemberId || null,
        speakerRole,
        managerId: participant?.parentId || null,
        quote: quoteAround(text, match.index, match[0].length),
        matchedWord: flagWord.word,
        severity: flagWord.severity,
        category: flagWord.category,
        segment: {
          ...(segment || {}),
          matchIndex: match.index,
          matchLength: match[0].length,
        },
        occurredAt: new Date(),
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
