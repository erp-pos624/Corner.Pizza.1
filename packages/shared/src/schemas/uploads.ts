import { z } from 'zod';

/** Decoded bytes allowed for a menu image upload. */
export const MAX_MENU_IMAGE_BYTES = 200 * 1024;

/** Base64 inflates the payload by 4/3; leave room for the data-URI header. */
const MAX_DATA_URL_LENGTH = Math.ceil((MAX_MENU_IMAGE_BYTES * 4) / 3) + 128;

/**
 * Menu images are uploaded as base64 data URIs so the same code path works in
 * the browser and the Electron shell. The client compresses the file first;
 * the length cap keeps the request small.
 */
export const imageUploadSchema = z
  .object({
    fileName: z.string().trim().max(160).optional(),
    data: z
      .string()
      .min(1, 'Choose an image to upload')
      .max(MAX_DATA_URL_LENGTH, 'Image is too large — maximum size is 200 KB')
      .regex(
        /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/u,
        'Only JPEG, PNG, or WebP images are supported',
      ),
  })
  .strict();
export type ImageUploadInput = z.infer<typeof imageUploadSchema>;
