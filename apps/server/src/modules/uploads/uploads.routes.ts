import { Router } from 'express';
import {
  imageUploadSchema,
  MAX_MENU_IMAGE_BYTES,
  type ImageUploadInput,
  type UploadedImageDto,
} from '@posshope/shared';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { isStorageConfigured, uploadMenuImage } from '../../lib/storage.js';
import { AppError } from '../../lib/errors.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { rateLimit } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';

export const uploadsRouter = Router();
uploadsRouter.use(authenticate);

const uploadLimiter = rateLimit({
  name: 'uploads:image',
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many uploads. Try again shortly',
});

const MAX_IMAGE_BYTES = MAX_MENU_IMAGE_BYTES;

uploadsRouter.post(
  '/image',
  authorize('menu:write'),
  uploadLimiter,
  validate({ body: imageUploadSchema }),
  asyncHandler(async (req, res) => {
    if (!isStorageConfigured()) {
      throw new AppError('Image uploads are not configured on this server', {
        statusCode: 503,
        expose: true,
      });
    }

    const { data } = req.body as ImageUploadInput;
    const bytes = Buffer.byteLength(data.slice(data.indexOf(',') + 1), 'base64');
    if (bytes > MAX_IMAGE_BYTES) {
      throw new AppError('Image is too large — maximum size is 200 KB', {
        statusCode: 413,
        expose: true,
      });
    }

    const uploaded = await uploadMenuImage(data);
    const dto: UploadedImageDto = {
      url: uploaded.url,
      publicId: uploaded.publicId,
      bytes: uploaded.bytes,
      format: uploaded.format,
    };
    res.status(201).json(dto);
  }),
);
