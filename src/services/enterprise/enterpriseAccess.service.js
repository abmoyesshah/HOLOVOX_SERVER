import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Profile from "../../models/Profile.model.js";
import EnterpriseProfile from "../../migrated-next/app/models/EnterpriseProfile.model.js";
import EnterpriseOrganization from "../../models/enterprise/EnterpriseOrganization.model.js";

const toObjectId = (value) => {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) return null;
  return new mongoose.Types.ObjectId(value);
};

export const getEnterpriseActor = async (req) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  let payload = null;

  if (token && process.env.JWT_SECRET) {
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      payload = null;
    }
  }

  const fallbackUserId =
    req.query.userId ||
    req.query.enterpriseId ||
    req.body?.userId ||
    req.body?.enterpriseId;

  const userId = payload?.id || fallbackUserId;
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return null;
  }

  const enterpriseMember = await EnterpriseProfile.findById(userId).lean();
  if (enterpriseMember) {
    const organization = await resolveOrganization({
      ownerId: enterpriseMember.enterpriseId,
      organizationId: enterpriseMember.organizationId,
      ownerName: "Enterprise",
    });

    return {
      id: enterpriseMember._id,
      role: enterpriseMember.role === "manager" ? "manager" : "rep",
      member: enterpriseMember,
      profile: null,
      organization,
      ownerId: organization.ownerId,
    };
  }

  const profile = await Profile.findById(userId).select("-password").lean();
  const ownerId = toObjectId(userId);
  const organization = await resolveOrganization({
    ownerId,
    ownerName: profile?.fullName || payload?.name || "Enterprise",
  });

  return {
    id: ownerId,
    role: "owner",
    member: null,
    profile,
    organization,
    ownerId,
  };
};

export const resolveOrganization = async ({ ownerId, organizationId, ownerName }) => {
  if (organizationId && mongoose.Types.ObjectId.isValid(organizationId)) {
    const existing = await EnterpriseOrganization.findById(organizationId);
    if (existing) return existing;
  }

  const validOwnerId = toObjectId(ownerId);
  if (!validOwnerId) {
    throw new Error("A valid enterprise owner id is required");
  }

  return EnterpriseOrganization.findOneAndUpdate(
    { ownerId: validOwnerId },
    {
      $setOnInsert: {
        ownerId: validOwnerId,
        name: ownerName ? `${ownerName}'s Organization` : "Enterprise Organization",
        status: "active",
      },
    },
    { new: true, upsert: true }
  );
};

export const requireEnterpriseActor = async (req, res) => {
  const actor = await getEnterpriseActor(req);
  if (!actor?.organization) {
    res.status(401).json({ success: false, error: "Enterprise session is required" });
    return null;
  }
  return actor;
};

export const ensureOwner = (actor, res) => {
  if (actor.role !== "owner") {
    res.status(403).json({ success: false, error: "Only the organization owner can perform this action" });
    return false;
  }
  return true;
};

export const canManageMember = (actor, targetMember) => {
  if (actor.role === "owner") return true;
  if (actor.role !== "manager") return false;
  return String(targetMember.parentId || "") === String(actor.id);
};
