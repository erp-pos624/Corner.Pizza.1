import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { env } from '../env.js';

const configured = Boolean(
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
);

if (configured) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export function isCloudinaryConfigured(): boolean {
  return configured;
}

export async function uploadMenuImage(dataUri: string): Promise<UploadApiResponse> {
  return cloudinary.uploader.upload(dataUri, {
    folder: env.CLOUDINARY_UPLOAD_FOLDER,
    resource_type: 'image',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
  });
}
