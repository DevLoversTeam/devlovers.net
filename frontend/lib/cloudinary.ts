import { v2 as cloudinary } from "cloudinary"

import { cloudinaryEnv } from "./env/cloudinary"

cloudinary.config({
  cloud_name: cloudinaryEnv.cloudName,
  api_key: cloudinaryEnv.apiKey,
  api_secret: cloudinaryEnv.apiSecret,
})

export { cloudinary }

async function toBuffer(fileOrBuffer: File | Buffer): Promise<Buffer> {
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(fileOrBuffer)) {
    return fileOrBuffer
  }

  const arrayBuffer = await (fileOrBuffer as File).arrayBuffer()
  return Buffer.from(arrayBuffer)
}

export async function uploadImage(
  fileOrBuffer: File | Buffer,
  options?: { folder?: string },
): Promise<{ url: string; publicId: string }> {
  const buffer = await toBuffer(fileOrBuffer)

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: options?.folder ?? cloudinaryEnv.uploadFolder,
        resource_type: "image",
      },
      (
        error: unknown,
        result: { secure_url: string; public_id: string } | undefined,
      ) => {
        if (error || !result) {
          console.error("Cloudinary upload failed", error)
          reject(new Error("Failed to upload image to Cloudinary"))
          return
        }

        resolve({ url: result.secure_url, publicId: result.public_id })
      },
    )

    uploadStream.end(buffer)
  })
}

export async function deleteImage(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId)
}

export async function uploadProductImageFromFile(
  file: File,
  options?: { folder?: string },
): Promise<{ secureUrl: string; publicId: string }> {
  const result = await uploadImage(file, options)
  return { secureUrl: result.url, publicId: result.publicId }
}

export async function destroyProductImage(publicId: string): Promise<void> {
  await deleteImage(publicId)
}
