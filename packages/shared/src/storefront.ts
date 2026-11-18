import { z } from 'zod';
import type { Language } from './i18n.js';

/** One bilingual string as the admin edits it in the dashboard. */
export interface StorefrontLine {
  en: string;
  ar: string;
}

export interface StorefrontHero {
  line1: StorefrontLine;
  line2: StorefrontLine;
  accent: StorefrontLine;
  lead: StorefrontLine;
  searchPlaceholder: StorefrontLine;
  searchButton: StorefrontLine;
  primaryCta: StorefrontLine;
  secondaryCta: StorefrontLine;
  bullets: StorefrontLine[];
  spotlightLabel: StorefrontLine;
  deliveryLabel: StorefrontLine;
  imageUrl: string | null;
  imageAlt: StorefrontLine;
}

export interface StorefrontHeading {
  title: StorefrontLine;
  lead: StorefrontLine;
}

export interface StorefrontStep {
  title: StorefrontLine;
  body: StorefrontLine;
}

export interface StorefrontHow extends StorefrontHeading {
  steps: StorefrontStep[];
}

export interface StorefrontCard {
  title: StorefrontLine;
  body: StorefrontLine;
}

export interface StorefrontDeliveryCard extends StorefrontCard {
  feesNote: StorefrontLine;
}

export interface StorefrontClosing extends StorefrontCard {
  cta: StorefrontLine;
}

/** Everything a visitor sees on the home page except live menu data. */
export interface StorefrontContent {
  hero: StorefrontHero;
  categories: StorefrontHeading;
  popular: StorefrontHeading;
  more: StorefrontHeading;
  how: StorefrontHow;
  deliveryCard: StorefrontDeliveryCard;
  pickupCard: StorefrontCard;
  closing: StorefrontClosing;
}

export function pickStorefrontLine(language: Language, line: StorefrontLine): string {
  const preferred = language === 'ar' ? line.ar : line.en;
  return preferred.trim() ? preferred : language === 'ar' ? line.en : line.ar;
}

const HEADLINE_MAX = 160;
const BODY_MAX = 900;
const CTA_MAX = 60;

function lineSchema(max: number) {
  return z.object({ en: z.string().trim().max(max), ar: z.string().trim().max(max) }).strict();
}

const headingSchema = z
  .object({ title: lineSchema(HEADLINE_MAX), lead: lineSchema(BODY_MAX) })
  .strict();

export const storefrontContentSchema = z
  .object({
    hero: z
      .object({
        line1: lineSchema(HEADLINE_MAX),
        line2: lineSchema(HEADLINE_MAX),
        accent: lineSchema(HEADLINE_MAX),
        lead: lineSchema(BODY_MAX),
        searchPlaceholder: lineSchema(HEADLINE_MAX),
        searchButton: lineSchema(CTA_MAX),
        primaryCta: lineSchema(CTA_MAX),
        secondaryCta: lineSchema(CTA_MAX),
        bullets: z.array(lineSchema(CTA_MAX)).length(3),
        spotlightLabel: lineSchema(CTA_MAX),
        deliveryLabel: lineSchema(CTA_MAX),
        imageUrl: z.string().trim().max(1000).nullable(),
        imageAlt: lineSchema(HEADLINE_MAX),
      })
      .strict(),
    categories: headingSchema,
    popular: headingSchema,
    more: headingSchema,
    how: headingSchema
      .extend({
        steps: z
          .array(z.object({ title: lineSchema(CTA_MAX), body: lineSchema(BODY_MAX) }).strict())
          .length(3),
      })
      .strict(),
    deliveryCard: z
      .object({
        title: lineSchema(HEADLINE_MAX),
        body: lineSchema(BODY_MAX),
        feesNote: lineSchema(BODY_MAX),
      })
      .strict(),
    pickupCard: z
      .object({ title: lineSchema(HEADLINE_MAX), body: lineSchema(BODY_MAX) })
      .strict(),
    closing: z
      .object({
        title: lineSchema(HEADLINE_MAX),
        body: lineSchema(BODY_MAX),
        cta: lineSchema(CTA_MAX),
      })
      .strict(),
  })
  .strict();

export type StorefrontContentInput = z.infer<typeof storefrontContentSchema>;

/** What the customer site shows until the admin changes it. */
export const DEFAULT_STOREFRONT_CONTENT: StorefrontContent = {
  hero: {
    line1: { en: 'Fresh from', ar: 'بيتزا طازجة' },
    line2: { en: 'the oven, ', ar: 'من الفرن، ' },
    accent: { en: 'made to share.', ar: 'صُنعت لتُشارَك.' },
    lead: {
      en: 'Oven-baked pizza, hoagies, wings and calzones — made fresh every day from your corner in Rehab 2. Order for delivery, or pick it up hot.',
      ar: 'بيتزا وهوجي وأجنحة وكالزوني مخبوزة في الفرن — تُحضَّر طازجة كل يوم من ناصيتكم في الرحاب 2. اطلب للتوصيل أو استلمها ساخنة.',
    },
    searchPlaceholder: {
      en: 'Search margherita, wings, tiramisu…',
      ar: 'ابحث عن مارجريتا، أجنحة، تيراميسو…',
    },
    searchButton: { en: 'Search', ar: 'ابحث' },
    primaryCta: { en: 'Order now', ar: 'اطلب الآن' },
    secondaryCta: { en: 'Track an order', ar: 'تتبع طلبًا' },
    bullets: [
      { en: 'Oven-baked', ar: 'مخبوزة في الفرن' },
      { en: 'Cash or card', ar: 'نقدًا أو بالبطاقة' },
      { en: 'Delivery & pickup', ar: 'توصيل واستلام' },
    ],
    spotlightLabel: { en: 'From the oven', ar: 'من الفرن' },
    deliveryLabel: { en: 'Delivery', ar: 'التوصيل' },
    imageUrl: null,
    imageAlt: {
      en: 'A Corner Special pizza, fresh from the oven',
      ar: 'بيتزا سبيشال كورنر طازجة من الفرن',
    },
  },
  categories: {
    title: { en: 'Start with a favourite', ar: 'ابدأ بمفضلتك' },
    lead: {
      en: 'Family-size pizzas, sides and desserts — baked fresh in the same oven.',
      ar: 'بيتزا عائلية ومقبلات وحلويات — تُخبز طازجة في نفس الفرن.',
    },
  },
  popular: {
    title: { en: 'Ordered the most', ar: 'الأكثر طلبًا' },
    lead: {
      en: 'What people have actually been ordering here over the last month.',
      ar: 'ما يطلبه الناس فعلاً هنا خلال الشهر الماضي.',
    },
  },
  more: {
    title: { en: 'More from the favourites', ar: 'المزيد من المفضلات' },
    lead: {
      en: 'Other dishes the kitchen has marked as worth trying.',
      ar: 'أطباق أخرى رشحها المطبخ وتستحق التجربة.',
    },
  },
  how: {
    title: { en: 'How ordering works', ar: 'كيف يعمل الطلب' },
    lead: {
      en: 'Three steps, no phone calls, no surprises at the door.',
      ar: 'ثلاث خطوات، بدون مكالمات، وبدون مفاجآت عند الباب.',
    },
    steps: [
      {
        title: { en: 'Choose your pizza', ar: 'اختر بيتزاك' },
        body: {
          en: 'Browse the live menu with every size and price up front.',
          ar: 'تصفح القائمة الحية بكل الأحجام والأسعار بوضوح.',
        },
      },
      {
        title: { en: 'Make it yours', ar: 'اجعله على ذوقك' },
        body: {
          en: 'Pick a size, add toppings and leave a note for the kitchen.',
          ar: 'اختر الحجم، أضف الإضافات، واترك ملاحظة للمطبخ.',
        },
      },
      {
        title: { en: 'Delivered or collected', ar: 'توصيل أو استلام' },
        body: {
          en: 'Follow the order page from the oven to your door or the counter.',
          ar: 'تابع الطلب من الفرن حتى بابك أو الكاشير.',
        },
      },
    ],
  },
  deliveryCard: {
    title: { en: 'Delivered to your door', ar: 'توصيل إلى بابك' },
    body: {
      en: 'Drop a pin at checkout and we will tell you the delivery fee before you pay. Pay cash when it arrives, or by card online.',
      ar: 'حدد موقعك عند الدفع وسنخبرك برسوم التوصيل قبل الدفع. ادفع نقدًا عند الوصول أو بالبطاقة أونلاين.',
    },
    feesNote: {
      en: 'Delivery fees are shown from your address before you pay.',
      ar: 'تظهر رسوم التوصيل من عنوانك قبل الدفع.',
    },
  },
  pickupCard: {
    title: { en: 'Or pick it up', ar: 'أو استلمه بنفسك' },
    body: {
      en: 'Order ahead, pay by card, and collect from the counter. Your order page shows the moment it is ready.',
      ar: 'اطلب مسبقًا، ادفع بالبطاقة، واستلم من الكاشير. تظهر صفحة طلبك لحظة الجاهزية.',
    },
  },
  closing: {
    title: { en: 'Hungry yet?', ar: 'جعت؟' },
    body: {
      en: 'The oven is on. Build your order now and we will take it from there.',
      ar: 'الفرن شغال. ابدأ طلبك الآن ونحن نتولى الباقي.',
    },
    cta: { en: 'Start your order', ar: 'ابدأ طلبك' },
  },
};
