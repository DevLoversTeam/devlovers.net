import { z } from "zod";

export class CloudinaryDisabledError extends Error {
  public readonly code = "CLOUDINARY_DISABLED" as const;

  constructor(message: string) {
    super(message);
    this.name = "CloudinaryDisabledError";
  }
}

const cloudinaryRequiredSchema = z.object({
  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),
  CLOUDINARY_UPLOAD_FOLDER: z.string().min(1).default("products"),
});

export type CloudinaryEnv = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  uploadFolder: string;
};

/**
 * Returns null if Cloudinary is not configured.
 * Never throws — safe to call anywhere (including during build).
 */
export function getCloudinaryEnvOptional(): CloudinaryEnv | null {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) return null;

  const parsed = cloudinaryRequiredSchema.parse(process.env);
  return {
    cloudName: parsed.CLOUDINARY_CLOUD_NAME,
    apiKey: parsed.CLOUDINARY_API_KEY,
    apiSecret: parsed.CLOUDINARY_API_SECRET,
    uploadFolder: parsed.CLOUDINARY_UPLOAD_FOLDER,
  };
}

/**
 * Throws a typed error if Cloudinary is not configured.
 * Use this ONLY in code paths that actually upload/delete images.
 */
export function getCloudinaryEnvRequired(): CloudinaryEnv {
  const missing: string[] = [];
  if (!process.env.CLOUDINARY_CLOUD_NAME) missing.push("CLOUDINARY_CLOUD_NAME");
  if (!process.env.CLOUDINARY_API_KEY) missing.push("CLOUDINARY_API_KEY");
  if (!process.env.CLOUDINARY_API_SECRET) missing.push("CLOUDINARY_API_SECRET");

  if (missing.length) {
    throw new CloudinaryDisabledError(
      `Cloudinary is not configured. Missing: ${missing.join(", ")}`
    );
  }

  const parsed = cloudinaryRequiredSchema.parse(process.env);
  return {
    cloudName: parsed.CLOUDINARY_CLOUD_NAME,
    apiKey: parsed.CLOUDINARY_API_KEY,
    apiSecret: parsed.CLOUDINARY_API_SECRET,
    uploadFolder: parsed.CLOUDINARY_UPLOAD_FOLDER,
  };
}
