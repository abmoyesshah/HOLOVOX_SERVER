// lib/gridfs.js
import mongoose from "mongoose";
import { GridFSBucket } from "mongodb";
import { ObjectId } from "mongodb";

let buckets = {};

/**
 * Get or create a GridFS bucket instance
 * @param {string} bucketName - Name of the bucket (default: "brainFiles")
 * @returns {GridFSBucket} GridFS bucket instance
 */
export function getGridFSBucket(bucketName = "brainFiles") {
  if (!buckets[bucketName]) {
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("Database connection not established");
    }
    buckets[bucketName] = new GridFSBucket(db, {
      bucketName,
    });
  }
  return buckets[bucketName];
}

/**
 * Alias for backward compatibility
 */
export const getBrainFilesBucket = getGridFSBucket;

/**
 * Convert string to ObjectId
 * @param {string|ObjectId} id - The ID to convert
 * @returns {ObjectId} MongoDB ObjectId
 */
export function toObjectId(id) {
  if (id instanceof ObjectId) return id;
  if (typeof id === "string") return new ObjectId(id);
  return id;
}

/**
 * Delete a file from GridFS
 * @param {string|ObjectId} fileId - The file ID to delete
 * @param {string} bucketName - Name of the bucket
 * @returns {Promise<void>}
 */
export async function deleteFileFromGridFS(fileId, bucketName = "brainFiles") {
  const bucket = getGridFSBucket(bucketName);
  const id = toObjectId(fileId);
  return bucket.delete(id);
}

/**
 * Get file from GridFS as buffer
 * @param {string|ObjectId} fileId - The file ID to retrieve
 * @param {string} bucketName - Name of the bucket
 * @returns {Promise<Buffer>} File buffer
 */
export async function getFileFromGridFS(fileId, bucketName = "brainFiles") {
  const bucket = getGridFSBucket(bucketName);
  const id = toObjectId(fileId);
  
  return new Promise((resolve, reject) => {
    const chunks = [];
    const downloadStream = bucket.openDownloadStream(id);
    
    downloadStream.on("data", (chunk) => {
      chunks.push(chunk);
    });
    
    downloadStream.on("error", (error) => {
      reject(error);
    });
    
    downloadStream.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
  });
}

/**
 * Get file metadata from GridFS
 * @param {string|ObjectId} fileId - The file ID
 * @param {string} bucketName - Name of the bucket
 * @returns {Promise<Object>} File metadata
 */
export async function getFileMetadata(fileId, bucketName = "brainFiles") {
  const bucket = getGridFSBucket(bucketName);
  const id = toObjectId(fileId);
  
  return new Promise((resolve, reject) => {
    const files = bucket.find({ _id: id });
    files.toArray((err, docs) => {
      if (err) reject(err);
      resolve(docs[0] || null);
    });
  });
}

/**
 * Upload a file to GridFS
 * @param {Buffer} buffer - File buffer
 * @param {string} filename - File name
 * @param {Object} metadata - File metadata
 * @param {string} bucketName - Name of the bucket
 * @returns {Promise<ObjectId>} File ID
 */
export async function uploadFileToGridFS(buffer, filename, metadata = {}, bucketName = "brainFiles") {
  const bucket = getGridFSBucket(bucketName);
  
  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(filename, {
      metadata,
    });
    
    uploadStream.end(buffer);
    
    uploadStream.on("finish", () => {
      resolve(uploadStream.id);
    });
    
    uploadStream.on("error", (error) => {
      reject(error);
    });
  });
}

/**
 * Stream file from GridFS
 * @param {string|ObjectId} fileId - The file ID
 * @param {string} bucketName - Name of the bucket
 * @returns {Readable} Readable stream
 */
export function streamFileFromGridFS(fileId, bucketName = "brainFiles") {
  const bucket = getGridFSBucket(bucketName);
  const id = toObjectId(fileId);
  return bucket.openDownloadStream(id);
}