import { z } from 'zod';

/**
 * Menu images are uploaded as base64 data URIs so the same code path works in
 * the browser and the Electron shell. The client downscales the file first;
 * the length cap keeps the JSON body inside the API's 2 MB parser limit.
 */
export const imageUploadSchema = z
  .object({
    fileName: z.string().trim().max(160).optional(),
    data: z
      .string()
      .min(1, 'Choose an image to upload')
      .max(2_000_000, 'Image is too large — please choose a smaller file')
      .regex(
        /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/u,
        'Only JPEG, PNG, or WebP images are supported',
      ),
  })
  .strict();
export type ImageUploadInput = z.infer<typeof imageUploadSchema>;
