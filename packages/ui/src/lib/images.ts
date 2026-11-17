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

const MAX_UPLOAD_DIMENSION = 1600;
const UPLOAD_QUALITY = 0.82;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the selected image'));
    reader.readAsDataURL(file);
  });
}

/**
 * Downscales and re-encodes a menu photo before upload so the request stays
 * small on the serverless API. Falls back to the original bytes when the
 * browser cannot decode the format.
 */
export async function prepareImageUpload(
  file: File,
): Promise<{ fileName: string; data: string }> {
  if (!/^image\/(?:jpeg|png|webp)$/u.test(file.type)) {
    throw new Error('Only JPEG, PNG, or WebP images are supported');
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(
      1,
      MAX_UPLOAD_DIMENSION / Math.max(bitmap.width, bitmap.height),
    );
    if (scale === 1 && file.size <= 600_000) {
      bitmap.close();
      return { fileName: file.name, data: await readFileAsDataUrl(file) };
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return { fileName: file.name, data: canvas.toDataURL('image/webp', UPLOAD_QUALITY) };
  } catch {
    return { fileName: file.name, data: await readFileAsDataUrl(file) };
  }
}
