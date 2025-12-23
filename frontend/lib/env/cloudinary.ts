import { getServerEnv } from "@/lib/env"

const {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
  CLOUDINARY_UPLOAD_FOLDER,
} = getServerEnv()

export const cloudinaryEnv = {
  cloudName: CLOUDINARY_CLOUD_NAME,
  apiKey: CLOUDINARY_API_KEY,
  apiSecret: CLOUDINARY_API_SECRET,
  uploadFolder: CLOUDINARY_UPLOAD_FOLDER,
}
