import { MAX_MENU_IMAGE_BYTES } from '@posshope/shared';
import bbqChicken from '../assets/products/bbq-chicken.jpg';
import caesar from '../assets/products/caesar.jpg';
import cheesecake from '../assets/products/cheesecake.jpg';
import dips from '../assets/products/dips.jpg';
import drinks from '../assets/products/drinks.jpg';
import fries from '../assets/products/fries.jpg';
import garlicBread from '../assets/products/garlic-bread.jpg';
import lavaCake from '../assets/products/lava-cake.jpg';
import margherita from '../assets/products/margherita.jpg';
import mozzSticks from '../assets/products/mozz-sticks.jpg';
import mushroom from '../assets/products/mushroom.jpg';
import pepperoni from '../assets/products/pepperoni.jpg';
import quattro from '../assets/products/quattro.jpg';
import seafood from '../assets/products/seafood.jpg';
import signature from '../assets/products/signature.jpg';
import tiramisu from '../assets/products/tiramisu.jpg';
import veggie from '../assets/products/veggie.jpg';
import wings from '../assets/products/wings.jpg';

const ASSET_PREFIX = 'forno-asset:';

const PRODUCT_IMAGES: Record<string, string> = {
  'bbq-chicken': bbqChicken,
  caesar,
  cheesecake,
  dips,
  drinks,
  fries,
  'garlic-bread': garlicBread,
  'lava-cake': lavaCake,
  margherita,
  'mozz-sticks': mozzSticks,
  mushroom,
  pepperoni,
  quattro,
  seafood,
  signature,
  tiramisu,
  veggie,
  wings,
};

/**
 * Menu rows store either a real URL or a bundled `forno-asset:<key>` marker.
 * Bundled assets keep working offline and are covered by the `img-src 'self'`
 * CSP, unlike arbitrary remote URLs.
 */
export function resolveImageUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith(ASSET_PREFIX)) return value;
  return PRODUCT_IMAGES[value.slice(ASSET_PREFIX.length)] ?? null;
}

const DIMENSION_STEPS = [1600, 1280, 1024, 800, 640, 480] as const;
const QUALITY_STEPS = [0.82, 0.7, 0.6, 0.5, 0.4] as const;
const MAX_UPLOAD_BYTES = MAX_MENU_IMAGE_BYTES;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the selected image'));
    reader.readAsDataURL(file);
  });
}

function dataUrlByteLength(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const base64 = comma === -1 ? '' : dataUrl.slice(comma + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function encodeAt(bitmap: ImageBitmap, maxDimension: number, quality: number): string {
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', quality);
}

/**
 * Downscales and re-encodes a menu photo until it fits the 200 KB upload cap.
 * Falls back to the original bytes when the browser cannot decode the format.
 */
export async function prepareImageUpload(
  file: File,
): Promise<{ fileName: string; data: string }> {
  if (!/^image\/(?:jpeg|png|webp)$/u.test(file.type)) {
    throw new Error('Only JPEG, PNG, or WebP images are supported');
  }

  if (file.size <= MAX_UPLOAD_BYTES) {
    return { fileName: file.name, data: await readFileAsDataUrl(file) };
  }

  try {
    const bitmap = await createImageBitmap(file);
    try {
      for (const maxDimension of DIMENSION_STEPS) {
        for (const quality of QUALITY_STEPS) {
          const data = encodeAt(bitmap, maxDimension, quality);
          if (dataUrlByteLength(data) <= MAX_UPLOAD_BYTES) {
            return { fileName: file.name, data };
          }
        }
      }
      throw new Error('Image is too large — maximum size is 200 KB');
    } finally {
      bitmap.close();
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('maximum size')) throw error;
    const data = await readFileAsDataUrl(file);
    if (dataUrlByteLength(data) > MAX_UPLOAD_BYTES) {
      throw new Error('Image is too large — maximum size is 200 KB');
    }
    return { fileName: file.name, data };
  }
}
