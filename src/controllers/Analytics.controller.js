import MeetingModel from "../models/Meeting.model.js";
import RecordingModel from "../models/Recording.model.js";
import Transcript from "../models/Transcript.model.js";

// =====================================================
// 🔧 CONFIG / LEXICONS
// =====================================================

const RANGE_DAYS = { "7d": 7, "30d": 30, "90d": 90 };

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "from", "this", "your", "about", "meet",
  "call", "team", "sales", "customer", "service", "project", "demo", "review", "follow",
  "have", "will", "just", "okay", "yeah", "like", "know", "going", "think", "right",
]);

const POSITIVE_WORDS = new Set([
  "win", "won", "closed", "success", "booked", "launched", "approved", "gain",
  "great", "excellent", "happy", "love", "perfect", "agree", "yes", "good",
]);

const NEGATIVE_WORDS = new Set([
  "lost", "delay", "blocked", "issue", "problem", "churn", "failed", "stalled",
  "concern", "worried", "bad", "no", "cancel", "unhappy", "frustrated",
]);

const WIN_KEYWORDS = ["win", "won", "closed", "deal", "success", "signed", "contract"];

// =====================================================
// 🔧 HELPERS
// =====================================================

function normalizeWords(text = "") {
  return (
    text
      .toLowerCase()
      .match(/\b[a-z]{3,}\b/g)
      ?.filter((word) => !STOP_WORDS.has(word)) ?? []
  );
}

function clampPercent(value) {
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10); // YYYY-MM-DD
}

function getRangeStart(rangeDays) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (rangeDays - 1));
  return start;
}

// =====================================================
// 📊 GET ANALYTICS
// =====================================================
// GET /api/v1/analytics/:hostId?range=7d|30d|90d
//
// NOTE ON DATA QUALITY:
// - "winRate" is a HEURISTIC. Neither Meeting nor Recording nor Transcript
//   stores a real won/lost outcome field, so this is keyword-matched against
//   transcript text when available, or meeting title otherwise. Treat as a
//   directional signal, not verified data, until a real `outcome` field
//   exists on Meeting.
// - "talkTime" is computed from transcript word count as a rough proxy
//   (Recording currently has no stored duration field).
// =====================================================

export const getAnalytics = async (req, res) => {
  try {
    const { hostId } = req.params;
    const range = ["7d", "30d", "90d"].includes(req.query.range) ? req.query.range : "30d";

    if (!hostId) {
      return res.status(400).json({
        success: false,
        message: "hostId is required",
      });
    }

    const rangeDays = RANGE_DAYS[range];
    const rangeStart = getRangeStart(rangeDays);

    // ---------------------------------------------
    // 1. Meetings for this host (as host OR participant) within range
    // ---------------------------------------------
    const meetings = await MeetingModel.find({
      $or: [{ hostId }, { "participants.userId": hostId }],
      meetingDate: { $gte: rangeStart },
    }).lean();

    const meetingIds = meetings.map((m) => m.meetingId);

    if (meetingIds.length === 0) {
      return res.status(200).json({
        success: true,
        data: emptyPayload(rangeDays, rangeStart),
        message: "No meetings found for this user in the selected range",
      });
    }

    // ---------------------------------------------
    // 2. Recordings + Transcripts for those meetings (parallel)
    // ---------------------------------------------
    const [recordings, transcripts] = await Promise.all([
      RecordingModel.find({ meetingId: { $in: meetingIds } }).lean(),
      Transcript.find({ roomId: { $in: meetingIds } }).lean(),
    ]);

    // Group transcript text by meetingId (roomId) for quick lookup
    const transcriptByMeeting = new Map();
    transcripts.forEach((t) => {
      const list = transcriptByMeeting.get(t.roomId) ?? [];
      list.push(t.text || "");
      transcriptByMeeting.set(t.roomId, list);
    });

    // ---------------------------------------------
    // 3. Calls per day + estimated talk time
    // ---------------------------------------------
    const buckets = new Map();
    for (let i = 0; i < rangeDays; i++) {
      const d = new Date(rangeStart);
      d.setDate(rangeStart.getDate() + i);
      buckets.set(dayKey(d), {
        day: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        calls: 0,
        talkTime: 0,
      });
    }

    let totalTalkWords = 0;

    meetings.forEach((meeting) => {
      const key = dayKey(meeting.meetingDate);
      const bucket = buckets.get(key);
      const transcriptChunks = transcriptByMeeting.get(meeting.meetingId) ?? [];
      const wordCount = transcriptChunks.reduce((sum, chunk) => sum + chunk.split(/\s+/).filter(Boolean).length, 0);
      totalTalkWords += wordCount;

      if (bucket) {
        bucket.calls += 1;
        // ~130 spoken words per minute, rough estimate
        bucket.talkTime += Math.round(wordCount / 130);
      }
    });

    const callsData = Array.from(buckets.values());
    const totalCalls = meetings.length;

    // Fallback talk time: recordings count as a proxy if no transcripts exist at all
    const estimatedTalkMinutes =
      totalTalkWords > 0
        ? Math.round(totalTalkWords / 130)
        : recordings.length * 30; // crude fallback: assume 30 min/recording

    // ---------------------------------------------
    // 4. Sentiment + topics (transcript text preferred, title fallback)
    // ---------------------------------------------
    const wordCounts = new Map(); // word -> { count, sentiment }
    let positiveMeetings = 0;
    let negativeMeetings = 0;

    meetings.forEach((meeting) => {
      const transcriptChunks = transcriptByMeeting.get(meeting.meetingId) ?? [];
      const sourceText = transcriptChunks.length > 0
        ? transcriptChunks.join(" ")
        : meeting.meetingTitle || "";

      const words = normalizeWords(sourceText);
      let posHits = 0;
      let negHits = 0;

      words.forEach((word) => {
        const entry = wordCounts.get(word) ?? { count: 0, sentiment: 50 };
        entry.count += 1;
        if (POSITIVE_WORDS.has(word)) {
          entry.sentiment = Math.min(100, entry.sentiment + 8);
          posHits += 1;
        }
        if (NEGATIVE_WORDS.has(word)) {
          entry.sentiment = Math.max(0, entry.sentiment - 8);
          negHits += 1;
        }
        wordCounts.set(word, entry);
      });

      if (posHits > negHits) positiveMeetings += 1;
      else if (negHits > posHits) negativeMeetings += 1;
    });

    const neutralMeetings = Math.max(0, totalCalls - positiveMeetings - negativeMeetings);

    const sentimentValues = [positiveMeetings, neutralMeetings, negativeMeetings].map((v) =>
      clampPercent((v / totalCalls) * 100)
    );
    const sentimentSum = sentimentValues.reduce((a, b) => a + b, 0);
    if (sentimentSum !== 100 && sentimentSum > 0) {
      sentimentValues[1] += 100 - sentimentSum; // absorb rounding drift into "neutral"
    }

    const sentimentData = [
      { name: "Positive", value: sentimentValues[0], color: "#10b981" },
      { name: "Neutral", value: sentimentValues[1], color: "#94a3b8" },
      { name: "Negative", value: sentimentValues[2], color: "#ef4444" },
    ];

    const topicsData = Array.from(wordCounts.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 6)
      .map(([topic, meta]) => ({ topic, count: meta.count, sentiment: clampPercent(meta.sentiment) }));

    // ---------------------------------------------
    // 5. Win rate (HEURISTIC — see note above)
    // ---------------------------------------------
    const wins = meetings.filter((meeting) => {
      const transcriptChunks = transcriptByMeeting.get(meeting.meetingId) ?? [];
      const sourceText = (transcriptChunks.join(" ") || meeting.meetingTitle || "").toLowerCase();
      return WIN_KEYWORDS.some((keyword) => sourceText.includes(keyword));
    }).length;

    const winRate = clampPercent((wins / totalCalls) * 100);

    // ---------------------------------------------
    // 6. Rep leaderboard (group by participant)
    // ---------------------------------------------
    const repMap = new Map(); // key -> { calls, wins, talkWords }

    meetings.forEach((meeting) => {
      const transcriptChunks = transcriptByMeeting.get(meeting.meetingId) ?? [];
      const sourceText = (transcriptChunks.join(" ") || meeting.meetingTitle || "").toLowerCase();
      const isWin = WIN_KEYWORDS.some((keyword) => sourceText.includes(keyword));
      const wordCount = transcriptChunks.reduce((sum, chunk) => sum + chunk.split(/\s+/).filter(Boolean).length, 0);

      const participants = meeting.participants?.length > 0
        ? meeting.participants
        : [{ name: "You" }];

      participants.forEach((p) => {
        const key = p.email || p.name || "Unknown";
        const entry = repMap.get(key) ?? { rep: p.name || key, calls: 0, wins: 0, talkWords: 0 };
        entry.calls += 1;
        entry.wins += isWin ? 1 : 0;
        entry.talkWords += wordCount;
        repMap.set(key, entry);
      });
    });

    const totalTalkWordsAllReps = Array.from(repMap.values()).reduce((sum, r) => sum + r.talkWords, 0) || 1;

    const repsData = Array.from(repMap.values())
      .map((r) => ({
        rep: r.rep,
        calls: r.calls,
        win: r.calls > 0 ? clampPercent((r.wins / r.calls) * 100) : 0,
        talk: clampPercent((r.talkWords / totalTalkWordsAllReps) * 100),
      }))
      .sort((a, b) => b.calls - a.calls)
      .slice(0, 5);

    // ---------------------------------------------
    // 7. Active reps (unique participants across meetings)
    // ---------------------------------------------
    const uniqueReps = new Set();
    meetings.forEach((meeting) => {
      (meeting.participants || []).forEach((p) => {
        uniqueReps.add(p.email || p.name);
      });
    });

    // ---------------------------------------------
    // Response
    // ---------------------------------------------
    return res.status(200).json({
      success: true,
      data: {
        range,
        totals: {
          calls: totalCalls,
          talkMinutes: estimatedTalkMinutes,
          winRate,
          activeReps: Math.max(1, uniqueReps.size),
        },
        callsData,
        sentimentData,
        topicsData,
        repsData,
        meta: {
          winRateIsHeuristic: true,
          talkTimeIsEstimated: true,
          transcriptCoverage: `${meetings.filter((m) => transcriptByMeeting.has(m.meetingId)).length}/${totalCalls} meetings have transcripts`,
        },
      },
    });
  } catch (error) {
    console.error("ANALYTICS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

function emptyPayload(rangeDays, rangeStart) {
  const callsData = [];
  for (let i = 0; i < rangeDays; i++) {
    const d = new Date(rangeStart);
    d.setDate(rangeStart.getDate() + i);
    callsData.push({ day: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), calls: 0, talkTime: 0 });
  }

  return {
    totals: { calls: 0, talkMinutes: 0, winRate: 0, activeReps: 0 },
    callsData,
    sentimentData: [
      { name: "Positive", value: 0, color: "#10b981" },
      { name: "Neutral", value: 0, color: "#94a3b8" },
      { name: "Negative", value: 0, color: "#ef4444" },
    ],
    topicsData: [],
    repsData: [],
    meta: { winRateIsHeuristic: true, talkTimeIsEstimated: true, transcriptCoverage: "0/0" },
  };
}
