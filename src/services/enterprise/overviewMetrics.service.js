import BrainTrainingFile from "../../models/enterprise/BrainTrainingFile.model.js";
import UserFlag from "../../models/enterprise/UserFlag.model.js";
import MeetingTranscript from "../../models/enterprise/MeetingTranscript.model.js";
import BrainFile from "../../migrated-next/app/models/BrainFile.model.js";
import { buildOrgTree } from "./orgTree.service.js";

// Matches the per-rep "files * 15%" formula used on the rep dashboard (UserDashboardPage.tsx)
const personalBrainPctForCount = (count) => Math.min(100, count * 15);
const average = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);

export const getOverviewPayload = async (actor) => {
  const { members } = await buildOrgTree(actor);
  const memberIds = members.map((member) => member._id);
  const flags = await UserFlag.find({
    organizationId: actor.organization._id,
    ...(actor.role === "manager" ? { managerId: actor.id } : {}),
    ...(actor.role === "rep" ? { flaggedMemberId: actor.id } : {}),
  })
    .populate("flaggedMemberId", "fullName role parentId")
    .sort({ createdAt: -1 })
    .limit(25)
    .lean();

  const openFlags = flags.filter((flag) => flag.status !== "resolved");
  // Count a transcript as "theirs" if either the speaker OR the meeting
  // host resolves to one of their visible members. participantMemberId
  // alone undercounts, since guest/unresolved speakers leave it null even
  // when the transcript came from one of their reps' meetings.
  const transcriptCount = await MeetingTranscript.countDocuments({
    organizationId: actor.organization._id,
    ...(memberIds.length
      ? {
          $or: [
            { participantMemberId: { $in: memberIds } },
            { hostMemberId: { $in: memberIds } },
          ],
        }
      : {}),
  });

  const managers = members.filter((member) => member.role === "manager");
  const reps = members.filter((member) => member.role !== "manager");
  const brainFiles = await BrainTrainingFile.find({
    organizationId: actor.organization._id,
    reviewStatus: { $nin: ["pending", "rejected"] },
  })
    .sort({ createdAt: -1 })
    .limit(8)
    .lean();

  const companyBrainReadiness = Math.min(100, Math.round((brainFiles.length / 8) * 100));

  const personalBrainFiles = memberIds.length
    ? await BrainFile.find({
        user_id: { $in: memberIds.map((id) => String(id)) },
        ingestion_status: "ready",
      })
        .select("user_id")
        .lean()
    : [];
  const personalBrainCountsByMember = personalBrainFiles.reduce((acc, file) => {
    acc[file.user_id] = (acc[file.user_id] || 0) + 1;
    return acc;
  }, {});
  const personalBrainReadiness = memberIds.length
    ? Math.round(
        average(memberIds.map((id) => personalBrainPctForCount(personalBrainCountsByMember[String(id)] || 0))),
      )
    : 0;
  const combinedBrainReadiness = Math.round(companyBrainReadiness * 0.7 + personalBrainReadiness * 0.3);

  const divisions = managers.length
    ? managers.map((manager) => {
        const managerReps = reps.filter((rep) => String(rep.parentId || "") === String(manager._id));
        const managerFlags = openFlags.filter((flag) => String(flag.managerId || "") === String(manager._id));
        const onMessage = managerFlags.length ? Math.max(0, 100 - managerFlags.length * 6) : 100;
        return {
          name: `${manager.fullName}'s Team`,
          status: `${onMessage.toFixed(1)}% on-message`,
          statusType: onMessage >= 98 ? "good" : "warn",
          sub: `${managerFlags.length} open flags · ${managerReps.length} reps`,
        };
      })
    : [
        {
          name: actor.organization.name,
          status: openFlags.length ? "Needs review" : "100% on-message",
          statusType: openFlags.length ? "warn" : "good",
          sub: `${openFlags.length} open flags · ${reps.length} reps`,
        },
      ];

  const onMessage = transcriptCount ? Math.max(0, 100 - (openFlags.length / transcriptCount) * 10) : 100;

  return {
    kpis: [
      { value: `${onMessage.toFixed(1)}%`, label: "On-message · 30d", delta: transcriptCount ? `${transcriptCount} transcripts scanned` : "No transcripts yet", deltaType: "up" },
      { value: String(openFlags.length), label: "Open flags", delta: `${openFlags.filter((flag) => flag.severity === "high").length} high priority`, deltaType: openFlags.length ? "down" : "up", hot: openFlags.length > 0 },
      { value: "-", label: "Avg resolve time", delta: "Starts after flags resolve", deltaType: "up" },
      { value: "-", label: "Team win rate", delta: "Connect CRM later", deltaType: "up" },
      { value: "-", label: "Close-rate lift", delta: "Since adoption", deltaType: "up" },
      { value: String(reps.length), label: "Active reps", delta: `${members.filter((member) => member.status === "active").length} active members`, deltaType: "up" },
    ],
    divisions,
    brainReadiness: {
      company: companyBrainReadiness,
      personal: personalBrainReadiness,
      combined: combinedBrainReadiness,
    },
    brainSources: brainFiles.map((file) => ({
      id: String(file._id),
      name: file.originalName,
      type: file.mimeType || "Training file",
      icon: file.status === "ready" ? "✓" : "!",
      status: file.status,
      createdAt: file.createdAt,
    })),
    feed: flags.slice(0, 6).map((flag) => ({
      color: flag.severity === "high" ? "var(--mag)" : flag.severity === "medium" ? "var(--amber)" : "var(--hud)",
      text: `<b>${flag.flaggedMemberId?.fullName || "Participant"}</b> flagged: ${flag.matchedWord}`,
      time: new Date(flag.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    })),
    leaderboard: reps.slice(0, 8).map((rep) => {
      const repFlags = openFlags.filter((flag) => String(flag.flaggedMemberId?._id || flag.flaggedMemberId || "") === String(rep._id));
      return {
        name: rep.fullName,
        team: managers.find((manager) => String(manager._id) === String(rep.parentId))?.fullName || "Enterprise",
        color: "#E51A54",
        score: String(Math.max(0, 100 - repFlags.length * 8)),
        delta: repFlags.length ? `-${repFlags.length}` : "+0",
      };
    }),
  };
};
