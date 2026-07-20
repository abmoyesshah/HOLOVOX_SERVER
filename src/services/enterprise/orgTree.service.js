import EnterpriseProfile from "../../migrated-next/app/models/EnterpriseProfile.model.js";
import UserFlag from "../../models/enterprise/UserFlag.model.js";
import MeetingTranscript from "../../models/enterprise/MeetingTranscript.model.js";

const palette = ["#E51A54", "#7d2bd6", "#0E0E77", "#2b8fd6", "#9c2bb0", "#1E9E5A", "#b8860b"];

const initials = (name = "") =>
  name
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase())
    .slice(0, 2)
    .join("") || "?";

const countBy = (docs, key) =>
  docs.reduce((acc, doc) => {
    const value = doc[key] ? String(doc[key]) : "";
    if (value) acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});

export const getVisibleMembers = async (actor) => {
  const query = { organizationId: actor.organization._id };
  if (actor.role === "manager") {
    query.$or = [{ _id: actor.id }, { parentId: actor.id }];
  } else if (actor.role === "rep") {
    query._id = actor.id;
  }

  let members = await EnterpriseProfile.find(query).select("-password").sort({ createdAt: 1 }).lean();

  if (!members.length) {
    members = await EnterpriseProfile.find({ enterpriseId: actor.ownerId })
      .select("-password")
      .sort({ createdAt: 1 })
      .lean();
  }

  return members;
};

export const buildOrgTree = async (actor) => {
  const members = await getVisibleMembers(actor);
  const memberIds = members.map((member) => member._id);
  const flagCounts = countBy(
    await UserFlag.find({
      organizationId: actor.organization._id,
      status: { $ne: "resolved" },
      flaggedMemberId: { $in: memberIds },
    }).select("flaggedMemberId").lean(),
    "flaggedMemberId"
  );
  const sessionCounts = countBy(
    await MeetingTranscript.find({
      organizationId: actor.organization._id,
      participantMemberId: { $in: memberIds },
    }).select("participantMemberId meetingId").lean(),
    "participantMemberId"
  );

  const nodes = [];
  const edges = [];

  if (actor.role !== "rep") {
    const ownerName = actor.profile?.fullName || actor.profile?.DisplayName || "Owner";
    nodes.push({
      id: String(actor.ownerId),
      name: ownerName,
      role: "Owner",
      tier: "owner",
      initials: initials(ownerName),
      color: palette[0],
      meta: { sessions: "-", cards: "-", flags: "0" },
      status: "idle",
      x: 0,
      y: 0,
      email: actor.profile?.email || "",
    });
  }

  members.forEach((member, index) => {
    const roleLabel = member.role === "manager" ? "Manager" : "Rep";
    const flagCount = flagCounts[String(member._id)] || 0;
    nodes.push({
      id: String(member._id),
      name: member.fullName,
      role: roleLabel,
      tier: member.role === "manager" ? "mgr" : "rep",
      initials: initials(member.fullName),
      color: palette[(index + 1) % palette.length],
      meta: {
        sessions: String(sessionCounts[String(member._id)] || 0),
        cards: "-",
        flags: String(flagCount),
      },
      status: flagCount > 0 ? "flag" : "idle",
      x: 0,
      y: 0,
      email: member.email,
    });

    if (actor.role !== "rep") {
      const parentId = member.parentId ? String(member.parentId) : String(actor.ownerId);
      edges.push([parentId, String(member._id)]);
    }
  });

  return { nodes, edges, members };
};
