import { v2 as cloudinary } from "cloudinary";

import { getCloudinaryEnvRequired } from "@/lib/env/cloudinary";

let isConfigured = false;

function ensureConfigured() {
  if (isConfigured) return;

  const env = getCloudinaryEnvRequired();
  cloudinary.config({
    cloud_name: env.cloudName,
    api_key: env.apiKey,
    api_secret: env.apiSecret,
  });

  isConfigured = true;
}

async function toBuffer(fileOrBuffer: File | Buffer): Promise<Buffer> {
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(fileOrBuffer)) {
    return fileOrBuffer;
  }

  const arrayBuffer = await (fileOrBuffer as File).arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export { cloudinary };

export async function uploadImage(
  fileOrBuffer: File | Buffer,
  options?: { folder?: string }
): Promise<{ url: string; publicId: string }> {
  ensureConfigured();
  const env = getCloudinaryEnvRequired();

  const buffer = await toBuffer(fileOrBuffer);

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: options?.folder ?? env.uploadFolder,
        resource_type: "image",
      },
      (
        error: unknown,
        result: { secure_url: string; public_id: string } | undefined
      ) => {
        if (error || !result) {
          console.error("Cloudinary upload failed", error);
          reject(new Error("Failed to upload image to Cloudinary"));
          return;
        }

        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );

    uploadStream.end(buffer);
  });
}

export async function deleteImage(publicId: string): Promise<void> {
  ensureConfigured();
  await cloudinary.uploader.destroy(publicId);
}

export async function uploadProductImageFromFile(
  file: File,
  options?: { folder?: string }
): Promise<{ secureUrl: string; publicId: string }> {
  const result = await uploadImage(file, options);
  return { secureUrl: result.url, publicId: result.publicId };
}

export async function destroyProductImage(publicId: string): Promise<void> {
  await deleteImage(publicId);
}
