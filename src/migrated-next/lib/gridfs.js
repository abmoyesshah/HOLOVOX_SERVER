import { GridFSBucket, ObjectId } from "mongodb";
import mongoose from "mongoose";
import connectDB from "./db.js";

export const BRAIN_FILES_BUCKET = "brainFiles";

export async function getBrainFilesBucket() {
  await connectDB();

  if (!mongoose.connection.db) {
    throw new Error("Mongo database connection is not ready");
  }

  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: BRAIN_FILES_BUCKET,
  });
}

export function toObjectId(value) {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) {
    throw new Error("Invalid GridFS file id");
  }

  return new mongoose.Types.ObjectId(value);
}