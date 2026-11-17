/**
 * Deterministic demo seed for the Corner Pizza restaurant POS.
 *
 * Creates staff, menu, toppings, ingredient stock and recipes, customers,
 * discounts, plus 30 days of completed orders and a live board of open orders
 * so the dashboard and reports are backed by real database rows.
 */
import { PrismaClient } from '@prisma/client';
import type { OrderStatus, OrderType, PaymentMethod } from '@prisma/client';
import { hashPassword } from '../src/lib/password.js';

const prisma = new PrismaClient();

export const DEMO_PASSWORD = 'Pizza@2024';

const DAY = 86_400_000;

let randomState = 20261107;
function random(): number {
  randomState = (randomState * 1664525 + 1013904223) % 4294967296;
  return randomState / 4294967296;
}
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]!;
}
function between(min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}
function money(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}
function dayStart(offsetDays: number): Date {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return new Date(date.getTime() - offsetDays * DAY);
}
function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY);
}
/** UTC midnight, safe for PostgreSQL DATE columns. */
function dateOnly(offsetDays: number): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - offsetDays * DAY,
  );
}
function stamp(date: Date): string {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}
function withTime(base: Date, hour: number, minute: number): Date {
  return new Date(base.getTime() + hour * 3_600_000 + minute * 60_000);
}

/** Demo Arabic content, keyed by the canonical English name. */
const AR: {
  categories: Record<string, string>;
  categoryDescriptions: Record<string, string>;
  sizes: Record<string, string>;
  toppings: Record<string, string>;
  ingredients: Record<string, string>;
  suppliers: Record<string, string>;
  discounts: Record<string, string>;
  menuItems: Record<string, string>;
  menuDescriptions: Record<string, string>;
} = {
  categories: {
    'Classic Pizzas': 'بيتزا كلاسيكية',
    'Special Pizzas': 'بيتزا مميزة',
    'Chicken Pizzas': 'بيتزا الدجاج',
    'Meat Pizzas': 'بيتزا اللحوم',
    'Seafood Pizzas': 'بيتزا المأكولات البحرية',
    'Vegetarian Pizzas': 'بيتزا نباتية',
    Appetizers: 'مقبلات',
    Sides: 'أطباق جانبية',
    Desserts: 'حلويات',
    Drinks: 'مشروبات',
    Sauces: 'صوصات',
  },
  categoryDescriptions: {
    'Classic Pizzas': 'وصفات أصيلة تُخبز في فرن الحطب.',
    'Special Pizzas': 'إبداعات الشيف مع إضافات فاخرة.',
    'Chicken Pizzas': 'بيتزا بالدجاج المشوي مع صوصات غنية.',
    'Meat Pizzas': 'محشوة باللحم البقري والسجق والبيبروني.',
    'Seafood Pizzas': 'طازجة من البحر المتوسط.',
    'Vegetarian Pizzas': 'إضافات طازجة من الحديقة، بدون لحوم.',
    Appetizers: 'مقبلات مثالية للمشاركة.',
    Sides: 'الرفيق المثالي لكل بيتزا.',
    Desserts: 'نهاية حلوة لوجبتك.',
    Drinks: 'مشروبات مثلجة وعصائر طازجة.',
    Sauces: 'صوصات إضافية للأطراف والأطباق الجانبية.',
  },
  sizes: {
    Small: 'صغير',
    Medium: 'وسط',
    Large: 'كبير',
    'Extra Large': 'جامبو',
  },
  toppings: {
    'Extra Mozzarella': 'موزاريلا إضافية',
    Mushrooms: 'مشروم',
    'Black Olives': 'زيتون أسود',
    Pepperoni: 'بيبروني',
    'Grilled Chicken': 'دجاج مشوي',
    'Italian Sausage': 'سجق إيطالي',
    'Fresh Vegetables': 'خضروات طازجة',
    'Jalapeno and Chili': 'هالبينو وفلفل حار',
    'Feta Cheese': 'جبنة فيتا',
    'Beef Mince': 'لحم بقري مفروم',
    Shrimp: 'جمبري',
    'Truffle Oil': 'زيت الكمأة',
    'BBQ Drizzle': 'صوص باربكيو',
  },
  ingredients: {
    'Pizza Flour': 'دقيق البيتزا',
    'Tomato Sauce': 'صلصة طماطم',
    'Mozzarella Cheese': 'جبنة موزاريلا',
    Parmesan: 'جبنة بارميزان',
    Cheddar: 'جبنة شيدر',
    'Feta Cheese': 'جبنة فيتا',
    Pepperoni: 'بيبروني',
    'Beef Mince': 'لحم بقري مفروم',
    'Italian Sausage': 'سجق إيطالي',
    'Grilled Chicken': 'دجاج مشوي',
    Shrimp: 'جمبري',
    Tuna: 'تونة',
    Mushrooms: 'مشروم',
    'Black Olives': 'زيتون أسود',
    'Bell Peppers': 'فلفل ألوان',
    Onion: 'بصل',
    Spinach: 'سبانخ',
    'Fresh Tomato': 'طماطم طازجة',
    'Fresh Basil': 'ريحان طازج',
    Garlic: 'ثوم',
    'Chili Flakes': 'رقائق فلفل حار',
    'Truffle Oil': 'زيت الكمأة',
    'BBQ Sauce': 'صوص باربكيو',
    'Hot Sauce': 'صوص حار',
    'Cooking Oil': 'زيت طهي',
    Potatoes: 'بطاطس',
    'Pizza Boxes': 'علب بيتزا',
    Napkins: 'مناديل',
  },
  suppliers: {
    'Cairo Fresh Produce': 'القاهرة للمنتجات الطازجة',
    'Nile Dairy & Cheese': 'النيل للألبان والأجبان',
  },
  discounts: {
    'Student 10%': 'خصم الطلاب ١٠٪',
    'Staff Meal 15%': 'وجبة الموظفين ١٥٪',
    'Grand Opening 20 EGP': 'افتتاح كبير ٢٠ جنيه',
    'Family Tuesday 12%': 'ثلاثاء العائلة ١٢٪',
  },
  menuItems: {
    Margherita: 'مارغريتا',
    'Pepperoni Classic': 'بيبروني كلاسيك',
    'Quattro Formaggi': 'كواترو فورماجي',
    Funghi: 'فونجي',
    'Corner Special': 'سبيشال كورنر',
    'Truffle Mushroom': 'مشروم الكمأة',
    'Spicy Diavola': 'ديافولا حارة',
    'BBQ Chicken': 'دجاج باربكيو',
    'Buffalo Chicken': 'دجاج بافلو',
    'Chicken Ranch': 'دجاج رانش',
    'Meat Lovers': 'عشاق اللحوم',
    'Beef Supreme': 'بيف سوبريم',
    'Shrimp Scampi': 'جمبري سكامبي',
    'Tuna and Olives': 'تونة وزيتون',
    'Garden Veggie': 'خضار الحديقة',
    'Spinach and Feta': 'سبانخ وفيتا',
    'Garlic Bread': 'خبز بالثوم',
    'Mozzarella Sticks': 'أصابع موزاريلا',
    'Buffalo Wings': 'أجنحة بافلو',
    'Tomato Bruschetta': 'بروشيتا طماطم',
    'French Fries': 'بطاطس مقلية',
    'Onion Rings': 'حلقات بصل',
    'Caesar Salad': 'سلطة سيزر',
    Coleslaw: 'كول سلو',
    'Chocolate Lava Cake': 'كيك الشوكولاتة اللافا',
    'New York Cheesecake': 'تشيز كيك نيويورك',
    Tiramisu: 'تيراميسو',
    'Soft Drink 330ml': 'مشروب غازي ٣٣٠ مل',
    'Sparkling Water': 'مياه فوارة',
    'Fresh Lemonade': 'ليمونادة طازجة',
    'Iced Tea': 'شاي مثلج',
    'Garlic Dip': 'صوص الثوم',
    'Ranch Dip': 'صوص رانش',
    'Hot Sauce': 'صوص حار',
    'BBQ Dip': 'صوص باربكيو',
  },
  menuDescriptions: {
    Margherita: 'صلصة طماطم سان مارزانو، موزاريلا فيور دي لاتي، ريحان طازج، وزيت زيتون.',
    'Pepperoni Classic': 'بيبروني مضاعف وموزاريلا ولمسة فلفل حار على عجينتنا المميزة.',
    'Quattro Formaggi': 'موزاريلا وبارميزان وشيدر وفيتا على قاعدة بيضاء كريمية.',
    Funghi: 'مشروم مشوي وموزاريلا وزعتر على صلصة الطماطم.',
    'Corner Special': 'بيبروني وسجق إيطالي وفلفل وزيتون مع الموزاريلا.',
    'Truffle Mushroom': 'مشروم بري وزيت كمأة وبارميزان وموزاريلا.',
    'Spicy Diavola': 'بيبروني حار ورقائق فلفل ولمسة عسل حار.',
    'BBQ Chicken': 'صوص باربكيو مدخن ودجاج مشوي وبصل أحمر وموزاريلا.',
    'Buffalo Chicken': 'صوص بافلو حار ودجاج مشوي وموزاريلا وصوص رانش.',
    'Chicken Ranch': 'قاعدة رانش كريمية ودجاج مشوي وذرة حلوة وموزاريلا.',
    'Meat Lovers': 'لحم بقري وسجق إيطالي وبيبروني وموزاريلا إضافية.',
    'Beef Supreme': 'لحم بقري متبل وفلفل وبصل وموزاريلا.',
    'Shrimp Scampi': 'جمبري بالثوم وموزاريلا وطماطم وعصرة ليمون.',
    'Tuna and Olives': 'تونة وزيتون أسود وبصل أحمر وموزاريلا.',
    'Garden Veggie': 'فلفل ومشروم وبصل أحمر وطماطم طازجة وموزاريلا.',
    'Spinach and Feta': 'سبانخ سوتيه وفيتا وموزاريلا وزيت ثوم.',
    'Garlic Bread': 'خبز مسطح على الحطب مدهون بزبدة الثوم والأعشاب.',
    'Mozzarella Sticks': 'موزاريلا مقلية ذهبية مع صوص مارينارا.',
    'Buffalo Wings': 'ستة أجنحة مقرمشة بصوص بافلو مع صوص رانش.',
    'Tomato Bruschetta': 'خبز محمص وطماطم طازجة وريحان وزيت زيتون.',
    'French Fries': 'بطاطس مقلية متبلة ومقرمشة مع أيولي الثوم.',
    'Onion Rings': 'حلقات بصل مقرمشة مع صوص تشيبوتلي.',
    'Caesar Salad': 'خس روميني وبارميزان وخبز محمص وصوص سيزر كريمي.',
    Coleslaw: 'سلطة ملفوف مقرمشة مع صوص لاذع.',
    'Chocolate Lava Cake': 'كيك شوكولاتة دافئ بقلب سائل.',
    'New York Cheesecake': 'تشيز كيك مخبوز كلاسيكي مع كومبوت التوت.',
    Tiramisu: 'أصابع بسكويت مغموسة بالإسبريسو وكريمة الماسكاربوني.',
    'Soft Drink 330ml': 'مشروب غازي مثلج.',
    'Sparkling Water': 'مياه معدنية فوارة ٥٠٠ مل.',
    'Fresh Lemonade': 'ليمونادة معصورة يدويًا مع النعناع.',
    'Iced Tea': 'شاي مثلج بالخوخ محضر في المطعم.',
    'Garlic Dip': 'صوص ثوم مشوي كريمي.',
    'Ranch Dip': 'صوص رانش بالأعشاب واللبن.',
    'Hot Sauce': 'صوص حار خاص بالمطعم.',
    'BBQ Dip': 'صوص باربكيو مدخن.',
  },
};

async function main(): Promise<void> {
  console.log('Seeding Corner Pizza restaurant data...');

  await prisma.inventoryMovement.deleteMany();
  await prisma.purchaseReceiptItem.deleteMany();
  await prisma.purchaseReceipt.deleteMany();
  await prisma.purchaseOrderItem.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.stockAlert.deleteMany();
  await prisma.zReport.deleteMany();
  await prisma.cashMovement.deleteMany();
  await prisma.refund.deleteMany();
  await prisma.creditNote.deleteMany();
  await prisma.driverSettlement.deleteMany();
  await prisma.stocktakeItem.deleteMany();
  await prisma.stocktake.deleteMany();
  await prisma.stockTransferItem.deleteMany();
  await prisma.stockTransfer.deleteMany();
  await prisma.onlinePayment.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.orderItemTopping.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.deliveryZone.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.ingredientStock.deleteMany();
  await prisma.diningTable.deleteMany();
  await prisma.recipeItem.deleteMany();
  await prisma.recipe.deleteMany();
  await prisma.menuItemSize.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.topping.deleteMany();
  await prisma.ingredient.deleteMany();
  await prisma.ingredientCategory.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.discount.deleteMany();
  await prisma.category.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.payrollLine.deleteMany();
  await prisma.payrollRun.deleteMany();
  await prisma.employeeAdjustment.deleteMany();
  await prisma.attendanceRecord.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.hrSettings.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.branch.deleteMany();

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const mainBranch = await prisma.branch.create({
    data: {
      id: 'branch-main',
      code: 'MAIN',
      name: 'Corner Pizza — Main Branch',
      nameAr: 'فرع كورنر بيتزا الرئيسي',
      address: '12 Nile Corniche, Zamalek, Cairo',
      phone: '+20 2 2735 9010',
      latitude: 30.0606,
      longitude: 31.2197,
      onlineOrderingEnabled: true,
      onlineOpenTime: '10:00',
      onlineCloseTime: '23:30',
    },
  });

  const admin = await prisma.user.create({
    data: {
      username: 'admin',
      fullName: 'Marco Rossi',
      email: 'admin@cornerpizza.local',
      role: 'ADMIN',
      branchId: mainBranch.id,
      passwordHash,
    },
  });
  const cashier1 = await prisma.user.create({
    data: {
      username: 'cashier',
      fullName: 'Layla Hassan',
      email: 'layla@cornerpizza.local',
      role: 'CASHIER',
      branchId: mainBranch.id,
      passwordHash,
    },
  });
  const cashier2 = await prisma.user.create({
    data: {
      username: 'omar',
      fullName: 'Omar Khaled',
      email: 'omar@cornerpizza.local',
      role: 'CASHIER',
      branchId: mainBranch.id,
      passwordHash,
    },
  });
  await prisma.user.create({
    data: {
      username: 'kitchen',
      fullName: 'Nadia Farouk',
      email: 'nadia@cornerpizza.local',
      role: 'KITCHEN_STAFF',
      branchId: mainBranch.id,
      passwordHash,
    },
  });
  await prisma.user.create({
    data: {
      username: 'driver',
      fullName: 'Youssef Adel',
      email: 'youssef@cornerpizza.local',
      role: 'DRIVER',
      branchId: mainBranch.id,
      passwordHash,
    },
  });
  const onlineStore = await prisma.user.create({
    data: {
      username: 'online-store',
      fullName: 'Online Store',
      role: 'CASHIER',
      branchId: mainBranch.id,
      isActive: false,
      passwordHash,
    },
  });

  await prisma.diningTable.createMany({
    data: Array.from({ length: 12 }, (_, index) => ({
      branchId: mainBranch.id,
      name: `Table ${index + 1}`,
      seats: index % 3 === 0 ? 6 : 4,
    })),
  });

  await prisma.restaurantSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      name: 'Corner Pizza',
      nameAr: 'كورنر بيتزا',
      tagline: 'Fresh from the oven, made to be shared.',
      taglineAr: 'بيتزا طازجة من الفرن، صُنعت لتُشارَك.',
      address: '12 Nile Corniche, Zamalek, Cairo',
      addressAr: '١٢ كورنيش النيل، الزمالك، القاهرة',
      phone: '+20 2 2735 9010',
      email: 'hello@eatcornerpizza.com',
      taxRate: '14.00',
      deliveryFee: '25.00',
      maxCashierDiscountPct: '20.00',
      receiptFooter: 'Thank you for choosing Corner Pizza. Baked fresh, served with love.',
      receiptFooterAr: 'شكرًا لاختياركم كورنر بيتزا. مخبوزة طازجة وبكل حب.',
      currency: 'EGP',
      stockPolicy: 'BLOCK',
    },
  });

  await prisma.deliveryZone.createMany({
    data: [
      {
        id: 'zone-main-zamalek',
        branchId: mainBranch.id,
        name: 'Zamalek Core',
        centerLat: 30.0606,
        centerLng: 31.2197,
        radiusInMeters: 2_500,
        deliveryFee: '20.00',
        minOrderAmount: '75.00',
      },
      {
        id: 'zone-main-dokki',
        branchId: mainBranch.id,
        name: 'Dokki & Mohandessin',
        centerLat: 30.0383,
        centerLng: 31.2001,
        radiusInMeters: 4_500,
        deliveryFee: '35.00',
        minOrderAmount: '120.00',
      },
    ],
  });

  const supplierA = await prisma.supplier.create({
    data: {
      name: 'Cairo Fresh Produce',
      nameAr: AR.suppliers['Cairo Fresh Produce'],
      phone: '+20 100 555 0134',
      email: 'orders@cairofresh.local',
      address: 'Obour Market, Cairo',
    },
  });
  const supplierB = await prisma.supplier.create({
    data: {
      name: 'Nile Dairy & Cheese',
      nameAr: AR.suppliers['Nile Dairy & Cheese'],
      phone: '+20 122 444 7710',
      email: 'sales@niledairy.local',
      address: 'Industrial Zone, 6th of October',
    },
  });

  const ingredientCategoryRows = [
    ['Dough & Baking', 'العجين والمخبوزات', 1],
    ['Dairy & Cheese', 'الألبان والأجبان', 2],
    ['Produce', 'الخضروات', 3],
    ['Meat & Seafood', 'اللحوم والمأكولات البحرية', 4],
    ['Pantry & Sauces', 'المؤن والصوصات', 5],
    ['Packaging', 'التغليف', 6],
  ] as const;
  const ingredientCategories: Record<string, string> = {};
  for (const [name, nameAr, sortOrder] of ingredientCategoryRows) {
    const row = await prisma.ingredientCategory.create({
      data: { name, nameAr, sortOrder },
    });
    ingredientCategories[name] = row.id;
  }

  const ingredientRows = [
    ['ING-FLOUR', 'Pizza Flour', 'KG', 96, 25, 18, supplierA.id],
    ['ING-TOMATO', 'Tomato Sauce', 'L', 42, 12, 32, supplierA.id],
    ['ING-MOZZ', 'Mozzarella Cheese', 'KG', 34, 10, 210, supplierB.id],
    ['ING-PARM', 'Parmesan', 'KG', 12, 4, 380, supplierB.id],
    ['ING-CHEDDAR', 'Cheddar', 'KG', 9, 3, 240, supplierB.id],
    ['ING-FETA', 'Feta Cheese', 'KG', 8, 3, 190, supplierB.id],
    ['ING-PEPPERONI', 'Pepperoni', 'KG', 14, 5, 260, supplierA.id],
    ['ING-BEEF', 'Beef Mince', 'KG', 16, 6, 300, supplierA.id],
    ['ING-SAUSAGE', 'Italian Sausage', 'KG', 11, 4, 250, supplierA.id],
    ['ING-CHICKEN', 'Grilled Chicken', 'KG', 18, 6, 220, supplierA.id],
    ['ING-SHRIMP', 'Shrimp', 'KG', 6, 3, 480, supplierA.id],
    ['ING-TUNA', 'Tuna', 'KG', 5, 2, 320, supplierA.id],
    ['ING-MUSHROOM', 'Mushrooms', 'KG', 10, 3, 140, supplierA.id],
    ['ING-OLIVES', 'Black Olives', 'KG', 7, 2, 120, supplierA.id],
    ['ING-PEPPERS', 'Bell Peppers', 'KG', 9, 3, 60, supplierA.id],
    ['ING-ONION', 'Onion', 'KG', 20, 5, 25, supplierA.id],
    ['ING-SPINACH', 'Spinach', 'KG', 5, 2, 70, supplierA.id],
    ['ING-TOMATO-FRESH', 'Fresh Tomato', 'KG', 8, 3, 30, supplierA.id],
    ['ING-BASIL', 'Fresh Basil', 'KG', 2.4, 1, 160, supplierA.id],
    ['ING-GARLIC', 'Garlic', 'KG', 4, 1.5, 90, supplierA.id],
    ['ING-CHILI', 'Chili Flakes', 'KG', 1.8, 0.5, 220, supplierA.id],
    ['ING-TRUFFLE', 'Truffle Oil', 'L', 1.2, 0.4, 1400, supplierB.id],
    ['ING-BBQ', 'BBQ Sauce', 'L', 6, 2, 150, supplierA.id],
    ['ING-HOTSAUCE', 'Hot Sauce', 'L', 5, 2, 130, supplierA.id],
    ['ING-OIL', 'Cooking Oil', 'L', 28, 8, 75, supplierA.id],
    ['ING-POTATO', 'Potatoes', 'KG', 22, 8, 35, supplierA.id],
    ['ING-BOX', 'Pizza Boxes', 'PACK', 40, 15, 4.5, null],
    ['ING-NAPKIN', 'Napkins', 'PACK', 30, 10, 2.2, null],
  ] as const;

  const categoryBySku: Record<string, string> = {
    'ING-FLOUR': 'Dough & Baking',
    'ING-MOZZ': 'Dairy & Cheese',
    'ING-PARM': 'Dairy & Cheese',
    'ING-CHEDDAR': 'Dairy & Cheese',
    'ING-FETA': 'Dairy & Cheese',
    'ING-TOMATO-FRESH': 'Produce',
    'ING-MUSHROOM': 'Produce',
    'ING-OLIVES': 'Produce',
    'ING-PEPPERS': 'Produce',
    'ING-ONION': 'Produce',
    'ING-SPINACH': 'Produce',
    'ING-BASIL': 'Produce',
    'ING-GARLIC': 'Produce',
    'ING-POTATO': 'Produce',
    'ING-PEPPERONI': 'Meat & Seafood',
    'ING-BEEF': 'Meat & Seafood',
    'ING-SAUSAGE': 'Meat & Seafood',
    'ING-CHICKEN': 'Meat & Seafood',
    'ING-SHRIMP': 'Meat & Seafood',
    'ING-TUNA': 'Meat & Seafood',
    'ING-TOMATO': 'Pantry & Sauces',
    'ING-CHILI': 'Pantry & Sauces',
    'ING-TRUFFLE': 'Pantry & Sauces',
    'ING-BBQ': 'Pantry & Sauces',
    'ING-HOTSAUCE': 'Pantry & Sauces',
    'ING-OIL': 'Pantry & Sauces',
    'ING-BOX': 'Packaging',
    'ING-NAPKIN': 'Packaging',
  };

  const storageByCategory: Record<string, string> = {
    'Dough & Baking': 'Dry store · shelving A',
    'Dairy & Cheese': 'Cold room · shelf 1',
    Produce: 'Cold room · shelf 2',
    'Meat & Seafood': 'Freezer · shelf 1',
    'Pantry & Sauces': 'Dry store · shelving B',
    Packaging: 'Packaging shelf',
  };

  const expiryByCategory: Record<string, number> = {
    'Dairy & Cheese': 10,
    Produce: 6,
    'Meat & Seafood': 20,
  };

  const ingredients: Record<string, { id: string; unit: string; cost: number }> = {};
  for (const [sku, name, unit, stock, minStock, cost, supplierId] of ingredientRows) {
    const categoryName = categoryBySku[sku]!;
    const expiryDays = expiryByCategory[categoryName];
    const row = await prisma.ingredient.create({
      data: {
        sku,
        name,
        nameAr: AR.ingredients[name] ?? null,
        unit: unit as 'KG' | 'G' | 'L' | 'ML' | 'PIECE' | 'PACK',
        costPerUnit: money(cost),
        averageCost: money(cost),
        supplierId,
        categoryId: ingredientCategories[categoryName]!,
        storageLocation: storageByCategory[categoryName],
        expiryDate: expiryDays ? addDays(new Date(), expiryDays) : null,
        stocks: {
          create: {
            branchId: mainBranch.id,
            currentStock: stock.toFixed(3),
            minStock: minStock.toFixed(3),
            reorderPoint: (minStock * 1.25).toFixed(3),
            maxStock: (minStock * 4).toFixed(3),
          },
        },
      },
    });
    ingredients[sku] = { id: row.id, unit, cost };
  }

  const toppingRows = [
    ['Extra Mozzarella', 15, 'ING-MOZZ', 0.08],
    ['Mushrooms', 10, 'ING-MUSHROOM', 0.06],
    ['Black Olives', 10, 'ING-OLIVES', 0.05],
    ['Pepperoni', 20, 'ING-PEPPERONI', 0.07],
    ['Grilled Chicken', 20, 'ING-CHICKEN', 0.08],
    ['Italian Sausage', 20, 'ING-SAUSAGE', 0.08],
    ['Fresh Vegetables', 12, 'ING-PEPPERS', 0.06],
    ['Jalapeno and Chili', 8, 'ING-CHILI', 0.015],
    ['Feta Cheese', 18, 'ING-FETA', 0.06],
    ['Beef Mince', 25, 'ING-BEEF', 0.08],
    ['Shrimp', 35, 'ING-SHRIMP', 0.08],
    ['Truffle Oil', 30, 'ING-TRUFFLE', 0.01],
    ['BBQ Drizzle', 10, 'ING-BBQ', 0.03],
  ] as const;

  const toppings: Record<string, { id: string; price: number }> = {};
  let toppingOrder = 0;
  for (const [name, price, sku, qty] of toppingRows) {
    const row = await prisma.topping.create({
      data: {
        name,
        nameAr: AR.toppings[name] ?? null,
        price: money(price),
        ingredientId: ingredients[sku]!.id,
        ingredientQuantity: qty,
        sortOrder: toppingOrder++,
      },
    });
    toppings[name] = { id: row.id, price };
  }

  const categoryRows = [
    ['Classic Pizzas', 'Time-honoured recipes baked in our wood-fired oven.', 1],
    ['Special Pizzas', 'Chef creations with premium toppings.', 2],
    ['Chicken Pizzas', 'Grilled chicken builds with bold sauces.', 3],
    ['Meat Pizzas', 'Loaded with beef, sausage and pepperoni.', 4],
    ['Seafood Pizzas', 'Fresh from the Mediterranean.', 5],
    ['Vegetarian Pizzas', 'Garden-fresh toppings, no meat.', 6],
    ['Appetizers', 'Starters made for sharing.', 7],
    ['Sides', 'The perfect companions to every pie.', 8],
    ['Desserts', 'A sweet finish to your meal.', 9],
    ['Drinks', 'Chilled beverages and fresh juices.', 10],
    ['Sauces', 'Extra dips for crusts and sides.', 11],
  ] as const;

  const categories: Record<string, string> = {};
  for (const [name, description, sortOrder] of categoryRows) {
    const row = await prisma.category.create({
      data: {
        name,
        nameAr: AR.categories[name] ?? null,
        description,
        descriptionAr: AR.categoryDescriptions[name] ?? null,
        sortOrder,
      },
    });
    categories[name] = row.id;
  }

  const sizePresets = [
    { name: 'Small', multiplier: 0.7, sortOrder: 1 },
    { name: 'Medium', multiplier: 1, sortOrder: 2 },
    { name: 'Large', multiplier: 1.3, sortOrder: 3 },
    { name: 'Extra Large', multiplier: 1.6, sortOrder: 4 },
  ] as const;

  // Bundled renderer assets (apps/desktop/src/renderer/assets/products).
  const itemImages: Record<string, string> = {
    'PIZZA-MARGHERITA': 'margherita',
    'PIZZA-PEPPERONI': 'pepperoni',
    'PIZZA-QUATTRO': 'quattro',
    'PIZZA-FUNGHI': 'mushroom',
    'PIZZA-CORNER': 'signature',
    'PIZZA-TRUFFLE': 'mushroom',
    'PIZZA-DIAVOLA': 'pepperoni',
    'PIZZA-BBQ-CHICKEN': 'bbq-chicken',
    'PIZZA-BUFFALO': 'bbq-chicken',
    'PIZZA-CHICKEN-RANCH': 'bbq-chicken',
    'PIZZA-MEAT-LOVERS': 'signature',
    'PIZZA-BEEF-SUPREME': 'signature',
    'PIZZA-SHRIMP': 'seafood',
    'PIZZA-TUNA': 'seafood',
    'PIZZA-GARDEN': 'veggie',
    'PIZZA-SPINACH-FETA': 'veggie',
    'APP-GARLIC-BREAD': 'garlic-bread',
    'APP-MOZZ-STICKS': 'mozz-sticks',
    'APP-CHICKEN-WINGS': 'wings',
    'APP-BRUSCHETTA': 'garlic-bread',
    'SIDE-FRIES': 'fries',
    'SIDE-ONION-RINGS': 'fries',
    'SIDE-CAESAR': 'caesar',
    'SIDE-COLESLAW': 'caesar',
    'DESSERT-LAVA': 'lava-cake',
    'DESSERT-CHEESECAKE': 'cheesecake',
    'DESSERT-TIRAMISU': 'tiramisu',
    'DRINK-SOFT': 'drinks',
    'DRINK-SPARKLING': 'drinks',
    'DRINK-LEMONADE': 'drinks',
    'DRINK-ICED-TEA': 'drinks',
    'SAUCE-GARLIC': 'dips',
    'SAUCE-RANCH': 'dips',
    'SAUCE-HOT': 'dips',
    'SAUCE-BBQ': 'dips',
  };

  interface ItemSpec {
    sku: string;
    name: string;
    description: string;
    category: string;
    kind: 'PIZZA' | 'SIDE' | 'APPETIZER' | 'DESSERT' | 'DRINK' | 'SAUCE';
    prices?: [number, number, number, number];
    price?: number;
    prepMinutes?: number;
    featured?: boolean;
    recipe?: Array<[string, number]>;
  }

  const itemSpecs: ItemSpec[] = [
    {
      sku: 'PIZZA-MARGHERITA',
      name: 'Margherita',
      description: 'San Marzano tomato sauce, fior di latte mozzarella, fresh basil, olive oil.',
      category: 'Classic Pizzas',
      kind: 'PIZZA',
      prices: [95, 135, 175, 215],
      featured: true,
      prepMinutes: 12,
      recipe: [['ING-FLOUR', 0.22], ['ING-TOMATO', 0.12], ['ING-MOZZ', 0.16], ['ING-BASIL', 0.01], ['ING-OIL', 0.01], ['ING-BOX', 0.04], ['ING-NAPKIN', 0.04]],
    },
    {
      sku: 'PIZZA-PEPPERONI',
      name: 'Pepperoni Classic',
      description: 'Double pepperoni, mozzarella and a hint of chili on our signature crust.',
      category: 'Classic Pizzas',
      kind: 'PIZZA',
      prices: [110, 155, 200, 245],
      featured: true,
      prepMinutes: 14,
      recipe: [['ING-FLOUR', 0.22], ['ING-TOMATO', 0.12], ['ING-MOZZ', 0.16], ['ING-PEPPERONI', 0.09], ['ING-BOX', 0.04], ['ING-NAPKIN', 0.04]],
    },
    {
      sku: 'PIZZA-QUATTRO',
      name: 'Quattro Formaggi',
      description: 'Mozzarella, parmesan, cheddar and feta over a creamy white base.',
      category: 'Classic Pizzas',
      kind: 'PIZZA',
      prices: [125, 170, 215, 265],
      prepMinutes: 13,
      recipe: [['ING-FLOUR', 0.22], ['ING-TOMATO', 0.12], ['ING-MOZZ', 0.18], ['ING-PARM', 0.03], ['ING-CHEDDAR', 0.03], ['ING-FETA', 0.03], ['ING-BOX', 0.04], ['ING-NAPKIN', 0.04]],
    },
    {
      sku: 'PIZZA-FUNGHI',
      name: 'Funghi',
      description: 'Roasted mushrooms, mozzarella and thyme on tomato sauce.',
      category: 'Classic Pizzas',
      kind: 'PIZZA',
      prices: [105, 145, 185, 230],
      prepMinutes: 13,
      recipe: [['ING-FLOUR', 0.22], ['ING-TOMATO', 0.12], ['ING-MOZZ', 0.15], ['ING-MUSHROOM', 0.08], ['ING-BOX', 0.04], ['ING-NAPKIN', 0.04]],
    },
    {
      sku: 'PIZZA-CORNER',
      name: 'Corner Special',
      description: 'Pepperoni, Italian sausage, peppers and olives with mozzarella.',
      category: 'Special Pizzas',
      kind: 'PIZZA',
      prices: [150, 200, 255, 310],
      featured: true,
      prepMinutes: 16,
      recipe: [['ING-FLOUR', 0.24], ['ING-TOMATO', 0.13], ['ING-MOZZ', 0.18], ['ING-PEPPERONI', 0.05], ['ING-SAUSAGE', 0.05], ['ING-PEPPERS', 0.04], ['ING-OLIVES', 0.03], ['ING-BOX', 0.04], ['ING-NAPKIN', 0.04]],
    },
    {
      sku: 'PIZZA-TRUFFLE',
      name: 'Truffle Mushroom',
      description: 'Wild mushrooms, truffle oil, parmesan and mozzarella.',
      category: 'Special Pizzas',
      kind: 'PIZZA',
      prices: [165, 220, 275, 330],
      featured: true,
      prepMinutes: 15,
      recipe: [['ING-FLOUR', 0.24], ['ING-TOMATO', 0.12], ['ING-MOZZ', 0.18], ['ING-MUSHROOM', 0.09], ['ING-TRUFFLE', 0.012], ['ING-PARM', 0.02], ['ING-BOX', 0.04], ['ING-NAPKIN', 0.04]],
    },
    {
      sku: 'PIZZA-DIAVOLA',
      name: 'Spicy Diavola',
      description: 'Spicy pepperoni, chili flakes and hot honey finish.',
      category: 'Special Pizzas',
      kind: 'PIZZA',
      prices: [130, 180, 225, 275],
      prepMinutes: 14,
      recipe: [['ING-FLOUR', 0.22], ['ING-TOMATO', 0.12], ['ING-MOZZ', 0.16], ['ING-PEPPERONI', 0.06], ['ING-CHILI', 0.015], ['ING-BOX', 0.04], ['ING-NAPKIN', 0.04]],
    },
    {
      sku: 'PIZZA-BBQ-CHICKEN',
      name: 'BBQ Chicken',
      description: 'Smoky BBQ sauce, grilled chicken, red onion and mozzarella.',
      category: 'Chicken Pizzas',
      kind: 'PIZZA',
      prices: [135, 185, 235, 285],
      prepMinutes: 15,
      recipe: [['ING-FLOUR', 0.22], ['ING-BBQ', 0.05], ['ING-MOZZ', 0.15], ['ING-CHICKEN', 0.1], ['ING-ONION', 0.03], ['ING-BOX', 0.04], ['ING-NAPKIN', 0.04]],
    },
    {
      sku: 'PIZZA-BUFFALO',
      name: 'Buffalo Chicken',
      description: 'Buffalo hot sauce, grilled chicken, mozzarella and ranch drizzle.',
      category: 'Chicken Pizzas',
      kind: 'PIZZA',
      prices: [135, 185, 235, 285],
      prepMinutes: 15,
      recipe: [['ING-FLOUR', 0.22], ['ING-TOMATO', 0.1], ['ING-MOZZ', 0.15], ['ING-CHICKEN', 0.1], ['ING-HOTSAUCE', 0.04], ['ING-BOX', 0.04], ['ING-NAPKIN', 0.04]],
    },
    {
      sku: 'PIZZA-CHICKEN-RANCH',
      name: 'Chicken Ranch',
      description: 'Creamy ranch base, grilled chicken, sweetcorn and mozzarella.',
      category: 'Chicken Pizzas',
      kind: 'PIZZA',
      prices: [140, 190, 240, 295],
      prepMinutes: 15,
      recipe: [['ING-FLOUR', 0.22], ['ING-TOMATO', 0.1], ['ING-MOZZ', 0.15], ['ING-CHICKEN', 0.09], ['ING-GARLIC', 0.01], ['ING-BOX', 0.04], ['ING-NAPKIN', 0.04]],
    },
    {
      sku: 'PIZZA-MEAT-LOVERS',
      name: 'Meat Lovers',
      description: 'Beef, Italian sausage, pepperoni and extra mozzarella.',
      category: 'Meat Pizzas',
      kind: 'PIZZA',
      prices: [150, 205, 260, 320],
      featured: true,
      prepMinutes: 17,
      recipe: [['ING-FLOUR', 0.24], ['ING-TOMATO', 0.12], ['ING-MOZZ', 0.18], ['ING-BEEF', 0.07], ['ING-SAUSAGE', 0.06], ['ING-PEPPERONI', 0.05], ['ING-BOX', 0.04], ['ING-NAPKIN', 0.04]],
    },
    {
      sku: 'PIZZA-BEEF-SUPREME',
      name: 'Beef Supreme',
      description: 'Seasoned beef, peppers, onions and mozzarella.',
      category: 'Meat Pizzas',
      kind: 'PIZZA',
      prices: [145, 195, 245, 300],
      prepMinutes: 16,
      recipe: [['ING-FLOUR', 0.24], ['ING-TOMATO', 0.13], ['ING-MOZZ', 0.16], ['ING-BEEF', 0.1], ['ING-PEPPERS', 0.04], ['ING-ONION', 0.03], ['ING-BOX', 0.04], ['ING-NAPKIN', 0.04]],
    },
    {
      sku: 'PIZZA-SHRIMP',
      name: 'Shrimp Scampi',
      description: 'Garlic shrimp, mozzarella, tomato and a squeeze of lemon.',
      category: 'Seafood Pizzas',
      kind: 'PIZZA',
      prices: [175, 235, 295, 355],
      prepMinutes: 17,
      recipe: [['ING-FLOUR', 0.22], ['ING-TOMATO', 0.1], ['ING-MOZZ', 0.15], ['ING-SHRIMP', 0.09], ['ING-GARLIC', 0.012], ['ING-BOX', 0.04], ['ING-NAPKIN', 0.04]],
    },
    {
      sku: 'PIZZA-TUNA',
      name: 'Tuna and Olives',
      description: 'Tuna flakes, black olives, red onion and mozzarella.',
      category: 'Seafood Pizzas',
      kind: 'PIZZA',
      prices: [130, 180, 225, 275],
      prepMinutes: 14,
      recipe: [['ING-FLOUR', 0.22], ['ING-TOMATO', 0.12], ['ING-MOZZ', 0.14], ['ING-TUNA', 0.08], ['ING-OLIVES', 0.05], ['ING-BOX', 0.04], ['ING-NAPKIN', 0.04]],
    },
    {
      sku: 'PIZZA-GARDEN',
      name: 'Garden Veggie',
      description: 'Peppers, mushrooms, red onion, fresh tomato and mozzarella.',
      category: 'Vegetarian Pizzas',
      kind: 'PIZZA',
      prices: [110, 155, 195, 240],
      prepMinutes: 14,
      recipe: [['ING-FLOUR', 0.22], ['ING-TOMATO', 0.12], ['ING-MOZZ', 0.14], ['ING-PEPPERS', 0.06], ['ING-MUSHROOM', 0.05], ['ING-ONION', 0.04], ['ING-TOMATO-FRESH', 0.04], ['ING-BOX', 0.04], ['ING-NAPKIN', 0.04]],
    },
    {
      sku: 'PIZZA-SPINACH-FETA',
      name: 'Spinach and Feta',
      description: 'Sauteed spinach, feta, mozzarella and garlic oil.',
      category: 'Vegetarian Pizzas',
      kind: 'PIZZA',
      prices: [120, 165, 210, 255],
      prepMinutes: 14,
      recipe: [['ING-FLOUR', 0.22], ['ING-TOMATO', 0.1], ['ING-MOZZ', 0.12], ['ING-SPINACH', 0.08], ['ING-FETA', 0.06], ['ING-OIL', 0.01], ['ING-BOX', 0.04], ['ING-NAPKIN', 0.04]],
    },
    {
      sku: 'APP-GARLIC-BREAD',
      name: 'Garlic Bread',
      description: 'Wood-fired flatbread brushed with garlic butter and herbs.',
      category: 'Appetizers',
      kind: 'APPETIZER',
      price: 45,
      prepMinutes: 8,
      recipe: [['ING-FLOUR', 0.12], ['ING-GARLIC', 0.015], ['ING-OIL', 0.02], ['ING-BOX', 0.01]],
    },
    {
      sku: 'APP-MOZZ-STICKS',
      name: 'Mozzarella Sticks',
      description: 'Golden-fried mozzarella with marinara dip.',
      category: 'Appetizers',
      kind: 'APPETIZER',
      price: 65,
      prepMinutes: 10,
      recipe: [['ING-MOZZ', 0.12], ['ING-FLOUR', 0.05], ['ING-OIL', 0.02], ['ING-TOMATO', 0.04], ['ING-BOX', 0.01]],
    },
    {
      sku: 'APP-CHICKEN-WINGS',
      name: 'Buffalo Wings',
      description: 'Six crispy wings tossed in buffalo sauce with ranch dip.',
      category: 'Appetizers',
      kind: 'APPETIZER',
      price: 85,
      featured: true,
      prepMinutes: 12,
      recipe: [['ING-CHICKEN', 0.25], ['ING-OIL', 0.02], ['ING-HOTSAUCE', 0.02], ['ING-BOX', 0.01]],
    },
    {
      sku: 'APP-BRUSCHETTA',
      name: 'Tomato Bruschetta',
      description: 'Toasted sourdough, fresh tomato, basil and olive oil.',
      category: 'Appetizers',
      kind: 'APPETIZER',
      price: 55,
      prepMinutes: 8,
      recipe: [['ING-FLOUR', 0.1], ['ING-TOMATO-FRESH', 0.08], ['ING-BASIL', 0.01], ['ING-OIL', 0.01], ['ING-BOX', 0.01]],
    },
    {
      sku: 'SIDE-FRIES',
      name: 'French Fries',
      description: 'Crispy seasoned fries with garlic aioli.',
      category: 'Sides',
      kind: 'SIDE',
      price: 35,
      prepMinutes: 7,
      recipe: [['ING-POTATO', 0.25], ['ING-OIL', 0.03], ['ING-BOX', 0.01]],
    },
    {
      sku: 'SIDE-ONION-RINGS',
      name: 'Onion Rings',
      description: 'Beer-battered onion rings with chipotle dip.',
      category: 'Sides',
      kind: 'SIDE',
      price: 40,
      prepMinutes: 8,
      recipe: [['ING-ONION', 0.18], ['ING-FLOUR', 0.05], ['ING-OIL', 0.03], ['ING-BOX', 0.01]],
    },
    {
      sku: 'SIDE-CAESAR',
      name: 'Caesar Salad',
      description: 'Romaine, parmesan, croutons and creamy Caesar dressing.',
      category: 'Sides',
      kind: 'SIDE',
      price: 70,
      prepMinutes: 6,
      recipe: [['ING-SPINACH', 0.1], ['ING-PARM', 0.02], ['ING-OIL', 0.01], ['ING-BOX', 0.01]],
    },
    {
      sku: 'SIDE-COLESLAW',
      name: 'Coleslaw',
      description: 'Crunchy cabbage slaw with a tangy dressing.',
      category: 'Sides',
      kind: 'SIDE',
      price: 30,
      prepMinutes: 4,
    },
    {
      sku: 'DESSERT-LAVA',
      name: 'Chocolate Lava Cake',
      description: 'Warm chocolate cake with a molten center.',
      category: 'Desserts',
      kind: 'DESSERT',
      price: 60,
      prepMinutes: 8,
    },
    {
      sku: 'DESSERT-CHEESECAKE',
      name: 'New York Cheesecake',
      description: 'Classic baked cheesecake with berry compote.',
      category: 'Desserts',
      kind: 'DESSERT',
      price: 55,
      prepMinutes: 4,
    },
    {
      sku: 'DESSERT-TIRAMISU',
      name: 'Tiramisu',
      description: 'Espresso-soaked ladyfingers and mascarpone cream.',
      category: 'Desserts',
      kind: 'DESSERT',
      price: 65,
      prepMinutes: 4,
    },
    {
      sku: 'DRINK-SOFT',
      name: 'Soft Drink 330ml',
      description: 'Chilled canned soft drink.',
      category: 'Drinks',
      kind: 'DRINK',
      price: 20,
      prepMinutes: 1,
    },
    {
      sku: 'DRINK-SPARKLING',
      name: 'Sparkling Water',
      description: '500ml sparkling mineral water.',
      category: 'Drinks',
      kind: 'DRINK',
      price: 25,
      prepMinutes: 1,
    },
    {
      sku: 'DRINK-LEMONADE',
      name: 'Fresh Lemonade',
      description: 'Hand-squeezed lemonade with mint.',
      category: 'Drinks',
      kind: 'DRINK',
      price: 35,
      prepMinutes: 3,
    },
    {
      sku: 'DRINK-ICED-TEA',
      name: 'Iced Tea',
      description: 'House-brewed peach iced tea.',
      category: 'Drinks',
      kind: 'DRINK',
      price: 25,
      prepMinutes: 2,
    },
    {
      sku: 'SAUCE-GARLIC',
      name: 'Garlic Dip',
      description: 'Creamy roasted garlic dip.',
      category: 'Sauces',
      kind: 'SAUCE',
      price: 10,
      prepMinutes: 1,
    },
    {
      sku: 'SAUCE-RANCH',
      name: 'Ranch Dip',
      description: 'Buttermilk herb ranch.',
      category: 'Sauces',
      kind: 'SAUCE',
      price: 10,
      prepMinutes: 1,
    },
    {
      sku: 'SAUCE-HOT',
      name: 'Hot Sauce',
      description: 'House hot sauce, extra kick.',
      category: 'Sauces',
      kind: 'SAUCE',
      price: 8,
      prepMinutes: 1,
    },
    {
      sku: 'SAUCE-BBQ',
      name: 'BBQ Dip',
      description: 'Smoky barbecue dipping sauce.',
      category: 'Sauces',
      kind: 'SAUCE',
      price: 10,
      prepMinutes: 1,
    },
  ];

  const menuItems: Record<
    string,
    {
      id: string;
      name: string;
      kind: string;
      basePrice: number;
      cost: number;
      hasSizes: boolean;
      sizeIds: string[];
      sizeNames: string[];
      sizePrices: number[];
      sizeMultipliers: number[];
    }
  > = {};

  for (const spec of itemSpecs) {
    const categoryId = categories[spec.category]!;
    const hasSizes = Boolean(spec.prices);
    const basePrice = spec.prices ? spec.prices[1]! : spec.price!;
    const item = await prisma.menuItem.create({
      data: {
        sku: spec.sku,
        name: spec.name,
        nameAr: AR.menuItems[spec.name] ?? null,
        description: spec.description,
        descriptionAr: AR.menuDescriptions[spec.name] ?? null,
        categoryId,
        kind: spec.kind,
        basePrice: money(basePrice),
        prepMinutes: spec.prepMinutes ?? 12,
        isFeatured: spec.featured ?? false,
        imageUrl: itemImages[spec.sku] ? `forno-asset:${itemImages[spec.sku]}` : null,
        hasSizes,
        sizes: hasSizes
          ? {
              create: sizePresets.map((preset, index) => ({
                name: preset.name,
                nameAr: AR.sizes[preset.name] ?? null,
                price: money(spec.prices![index]!),
                ingredientMultiplier: preset.multiplier,
                isDefault: preset.name === 'Medium',
                sortOrder: preset.sortOrder,
              })),
            }
          : undefined,
      },
      include: { sizes: true },
    });

    let cost = 0;
    if (spec.recipe) {
      for (const [sku, qty] of spec.recipe) {
        cost += ingredients[sku]!.cost * qty;
      }
      const recipe = await prisma.recipe.create({
        data: { menuItemId: item.id, costPerUnit: cost.toFixed(3) },
      });
      for (const [sku, qty] of spec.recipe) {
        await prisma.recipeItem.create({
          data: { recipeId: recipe.id, ingredientId: ingredients[sku]!.id, quantity: qty },
        });
      }
      await prisma.menuItem.update({ where: { id: item.id }, data: { costPrice: money(cost) } });
    }

    menuItems[spec.sku] = {
      id: item.id,
      name: item.name,
      kind: item.kind,
      basePrice,
      cost: Math.round(cost * 100) / 100,
      hasSizes,
      sizeIds: item.sizes.map((size) => size.id),
      sizeNames: item.sizes.map((size) => size.name),
      sizePrices: item.sizes.map((size) => Number(size.price)),
      sizeMultipliers: item.sizes.map((size) => Number(size.ingredientMultiplier)),
    };
  }

  const customerRows = [
    ['Nour El Din', '+20 100 111 2233', '14 Sharia 26 July, Zamalek', 'Prefers extra crispy crust'],
    ['Salma Adel', '+20 101 222 3344', '5 Road 9, Maadi', null],
    ['Youssef Farouk', '+20 102 333 4455', '22 El Nasr Road, Nasr City', 'Allergic to shrimp'],
    ['Mariam Hany', '+20 106 444 5566', '8 Ahmed Orabi, Mohandessin', null],
    ['Karim Tarek', '+20 109 555 6677', '31 Baghdad Street, Korba', 'Call on arrival'],
    ['Dina Sami', '+20 111 666 7788', '7 Sphinx Street, Heliopolis', null],
    ['Ahmed Mostafa', '+20 112 777 8899', '19 Peace Road, New Cairo', 'Corporate account'],
    ['Hala Wagih', '+20 114 888 9900', '3 El Batal Ahmed, Agouza', null],
    ['Tamer Fouad', '+20 115 999 0011', '40 Abbas El Akkad, Nasr City', null],
    ['Rana Ibrahim', '+20 116 121 3141', '11 Syria Street, Mohandessin', 'No onions'],
    ['Omar Sherif', '+20 117 232 4252', '6 Nile Street, Giza', null],
    ['Farida Nabil', '+20 118 343 5363', '27 Road 200, Degla', null],
    ['Ali Gamal', '+20 119 454 6474', '2 Makram Ebeid, Nasr City', 'Delivery after 8pm'],
    ['Laila Hosny', '+20 120 565 7585', '16 Thawra Street, Heliopolis', null],
  ] as const;

  const customers: Array<{
    id: string;
    name: string;
    phone: string | null;
    address: string | null;
  }> = [];
  for (const [name, phone, address, notes] of customerRows) {
    const row = await prisma.customer.create({ data: { name, phone, address, notes } });
    customers.push(row);
  }

  const discountRows = [
    ['Student 10%', 'PERCENT', '10.00'],
    ['Staff Meal 15%', 'PERCENT', '15.00'],
    ['Grand Opening 20 EGP', 'FIXED', '20.00'],
    ['Family Tuesday 12%', 'PERCENT', '12.00'],
  ] as const;
  const discounts = await Promise.all(
    discountRows.map(([name, type, value]) =>
      prisma.discount.create({
        data: { name, nameAr: AR.discounts[name] ?? null, type, value },
      }),
    ),
  );

  const recipeRows = await prisma.recipe.findMany({
    include: { items: { include: { ingredient: true } } },
  });
  const recipeMap: Record<string, Array<{ ingredientId: string; quantity: number; unitCost: number }>> = {};
  for (const recipe of recipeRows) {
    recipeMap[recipe.menuItemId] = recipe.items.map((line) => ({
      ingredientId: line.ingredientId,
      quantity: Number(line.quantity),
      unitCost: Number(line.ingredient.costPerUnit),
    }));
  }

  const pizzaSkus = Object.keys(menuItems).filter((sku) => menuItems[sku]!.kind === 'PIZZA');
  const otherSkus = Object.keys(menuItems).filter((sku) => menuItems[sku]!.kind !== 'PIZZA');
  const toppingNames = Object.keys(toppings);
  const cashiers = [cashier1, cashier2];
  const orderCounters: Record<string, number> = {};

  function nextSequence(date: Date): number {
    const key = stamp(date);
    orderCounters[key] = (orderCounters[key] ?? 0) + 1;
    return orderCounters[key]!;
  }

  function round2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  interface OrderOptions {
    date: Date;
    status: OrderStatus;
    type: OrderType;
    cashierId: string;
    withInvoice: boolean;
    channel?: 'POS' | 'ONLINE';
    paymentStatus?: 'PAID' | 'PAID_ONLINE' | 'PENDING_PAYMENT';
  }

  async function createOrder(options: OrderOptions) {
    const seq = nextSequence(options.date);
    const dayKey = stamp(options.date);
    const orderNumber = 'ORD-' + dayKey + '-' + String(seq).padStart(4, '0');
    const invoiceNumber = 'INV-' + dayKey + '-' + String(seq).padStart(4, '0');

    const chosen = [] as Array<{ sku: string; sizeIndex: number; quantity: number; toppingNames: string[] }>;
    const itemCount = between(1, 4);
    for (let i = 0; i < itemCount; i += 1) {
      const usePizza = random() < 0.78;
      const sku = usePizza ? pick(pizzaSkus) : pick(otherSkus);
      const item = menuItems[sku]!;
      const sizeIndex = item.hasSizes ? between(0, 3) : 0;
      const quantity = between(1, 2);
      const selectedToppings: string[] = [];
      if (item.kind === 'PIZZA') {
        const toppingCount = random() < 0.45 ? 0 : between(1, 3);
        while (selectedToppings.length < toppingCount) {
          const name = pick(toppingNames);
          if (!selectedToppings.includes(name)) selectedToppings.push(name);
        }
      }
      chosen.push({ sku, sizeIndex, quantity, toppingNames: selectedToppings });
    }

    let subtotal = 0;
    const prepared = chosen.map((selection) => {
      const item = menuItems[selection.sku]!;
      const unitPrice = item.hasSizes ? item.sizePrices[selection.sizeIndex]! : item.basePrice;
      const toppingPrice = selection.toppingNames.reduce((sum, name) => sum + toppings[name]!.price, 0);
      const lineTotal = round2((unitPrice + toppingPrice) * selection.quantity);
      subtotal += lineTotal;

      const multiplier = item.hasSizes ? item.sizeMultipliers[selection.sizeIndex]! : 1;
      const recipe = recipeMap[item.id] ?? [];
      let unitCost = recipe.reduce((sum, line) => sum + line.quantity * line.unitCost * multiplier, 0);
      const movementLines = recipe.map((line) => ({
        ingredientId: line.ingredientId,
        quantity: -line.quantity * multiplier * selection.quantity,
        unitCost: line.unitCost,
        note: item.name,
      }));
      for (const name of selection.toppingNames) {
        const toppingRow = toppingRows.find((row) => row[0] === name)!;
        const ingredient = ingredients[toppingRow[2]]!;
        unitCost += toppingRow[3] * ingredient.cost;
        movementLines.push({
          ingredientId: ingredient.id,
          quantity: -toppingRow[3] * selection.quantity,
          unitCost: ingredient.cost,
          note: 'Topping: ' + name,
        });
      }

      return {
        item,
        sizeIndex: selection.sizeIndex,
        quantity: selection.quantity,
        unitPrice,
        toppingPrice,
        lineTotal,
        unitCost: round2(unitCost),
        toppingNames: selection.toppingNames,
        movementLines,
      };
    });

    subtotal = round2(subtotal);
    let discountAmount = 0;
    let discountLabel: string | null = null;
    let discountLabelAr: string | null = null;
    let discountId: string | null = null;
    if (random() < 0.28) {
      const discount = pick(discounts);
      discountAmount =
        discount.type === 'PERCENT'
          ? round2((subtotal * Number(discount.value)) / 100)
          : Math.min(Number(discount.value), subtotal);
      discountLabel = discount.name;
      discountLabelAr = AR.discounts[discount.name] ?? null;
      discountId = discount.id;
    }

    const taxable = Math.max(subtotal - discountAmount, 0);
    const tax = round2(taxable * 0.14);
    const deliveryFee = options.type === 'DELIVERY' ? 25 : 0;
    const total = round2(taxable + tax + deliveryFee);
    const onlinePaymentStatus = options.paymentStatus;
    const method: PaymentMethod =
      options.channel === 'ONLINE'
        ? 'CARD'
        : random() < 0.55
          ? 'CASH'
          : random() < 0.75
            ? 'CARD'
            : 'WALLET';
    const amountPaid =
      onlinePaymentStatus === 'PENDING_PAYMENT'
        ? 0
        : method === 'CASH'
          ? Math.ceil(total / 5) * 5
          : total;
    const changeDue = round2(amountPaid - total);
    const customer = random() < 0.6 ? pick(customers) : null;
    const type = options.type;

    const order = await prisma.order.create({
      data: {
        orderNumber,
        type,
        channel: options.channel ?? 'POS',
        status: options.status,
        branchId: mainBranch.id,
        customerId: customer?.id ?? null,
        customerName: customer?.name ?? null,
        customerPhone: customer?.phone ?? null,
        customerAddress:
          type === 'DELIVERY' ? customer?.address ?? '12 Nile Corniche, Zamalek' : null,
        tableNumber: type === 'DINE_IN' ? String(between(1, 14)) : null,
        cashierId: options.cashierId,
        subtotal: money(subtotal),
        discount: money(discountAmount),
        discountLabel,
        discountLabelAr,
        discountId,
        tax: money(tax),
        deliveryFee: money(deliveryFee),
        total: money(total),
        amountPaid: money(amountPaid),
        changeDue: money(changeDue),
        paymentMethod: method,
        paymentStatus: onlinePaymentStatus ?? 'PAID',
        inventoryDeducted: options.status === 'COMPLETED',
        completedAt: options.status === 'COMPLETED' ? options.date : null,
        paidOnlineAt: onlinePaymentStatus === 'PAID_ONLINE' ? options.date : null,
        createdAt: options.date,
        items: {
          create: prepared.map((line) => ({
            menuItemId: line.item.id,
            menuItemName: line.item.name,
            menuItemNameAr: AR.menuItems[line.item.name] ?? null,
            sizeId: line.item.hasSizes ? line.item.sizeIds[line.sizeIndex]! : null,
            sizeName: line.item.hasSizes ? line.item.sizeNames[line.sizeIndex]! : null,
            sizeNameAr: line.item.hasSizes
              ? (AR.sizes[line.item.sizeNames[line.sizeIndex]!] ?? null)
              : null,
            quantity: line.quantity,
            unitPrice: money(line.unitPrice),
            toppingsTotal: money(line.toppingPrice),
            lineTotal: money(line.lineTotal),
            unitCost: money(line.unitCost),
            toppings: {
              create: line.toppingNames.map((name) => ({
                toppingId: toppings[name]!.id,
                name,
                nameAr: AR.toppings[name] ?? null,
                price: money(toppings[name]!.price),
              })),
            },
          })),
        },
      },
      include: { items: true },
    });

    if (onlinePaymentStatus !== 'PENDING_PAYMENT') {
      await prisma.payment.create({ data: { orderId: order.id, method, amount: money(total) } });
    }

    if (options.channel === 'ONLINE') {
      await prisma.onlinePayment.create({
        data: {
          orderId: order.id,
          reference: 'BASATA-' + orderNumber,
          providerRef: onlinePaymentStatus === 'PAID_ONLINE' ? 'DEMO-' + orderNumber : null,
          status:
            onlinePaymentStatus === 'PAID_ONLINE'
              ? 'PAID'
              : onlinePaymentStatus === 'PENDING_PAYMENT'
                ? 'PENDING'
                : 'FAILED',
          amount: money(total),
          checkoutUrl:
            onlinePaymentStatus === 'PENDING_PAYMENT'
              ? 'https://checkout.basata.example/demo/' + orderNumber
              : null,
          paidAt: onlinePaymentStatus === 'PAID_ONLINE' ? options.date : null,
        },
      });
    }

    if (options.withInvoice) {
      await prisma.invoice.create({
        data: { orderId: order.id, invoiceNumber, issuedAt: options.date },
      });
    }

    if (options.status === 'COMPLETED') {
      const movements = prepared.flatMap((line) =>
        line.movementLines.map((movement) => ({
          ingredientId: movement.ingredientId,
          branchId: mainBranch.id,
          orderId: order.id,
          type: 'SALE_DEDUCTION' as const,
          quantity: movement.quantity.toFixed(3),
          unitCost: money(movement.unitCost),
          note: movement.note,
          userId: options.cashierId,
          createdAt: options.date,
        })),
      );
      if (movements.length > 0) {
        await prisma.inventoryMovement.createMany({ data: movements });
      }
    }

    return order;
  }

  console.log('Generating 30 days of order history...');
  for (let offset = 30; offset >= 1; offset -= 1) {
    const day = dayStart(offset);
    const ordersToday = between(10, 22);
    for (let i = 0; i < ordersToday; i += 1) {
      const typeRoll = random();
      const type: OrderType =
        typeRoll < 0.4 ? 'DELIVERY' : typeRoll < 0.72 ? 'TAKEAWAY' : 'DINE_IN';
      await createOrder({
        date: withTime(day, between(11, 22), between(0, 59)),
        status: 'COMPLETED',
        type,
        cashierId: pick(cashiers).id,
        withInvoice: true,
      });
    }
  }

  console.log("Generating today's completed and open orders...");
  const now = new Date();
  const todayStart = dayStart(0);
  function todayAt(hoursAgo: number, minutesAgo: number): Date {
    const value = new Date(now.getTime() - hoursAgo * 3_600_000 - minutesAgo * 60_000);
    return value.getTime() < todayStart.getTime() ? new Date(todayStart.getTime() + 3_600_000) : value;
  }

  for (let i = 0; i < 9; i += 1) {
    const typeRoll = random();
    const type: OrderType =
      typeRoll < 0.45 ? 'DELIVERY' : typeRoll < 0.75 ? 'TAKEAWAY' : 'DINE_IN';
    await createOrder({
      date: todayAt(between(1, 7), between(0, 59)),
      status: 'COMPLETED',
      type,
      cashierId: pick(cashiers).id,
      withInvoice: true,
    });
  }

  console.log('Generating online storefront demo orders...');
  for (let i = 0; i < 3; i += 1) {
    const type: OrderType = random() < 0.7 ? 'DELIVERY' : 'TAKEAWAY';
    await createOrder({
      date: todayAt(between(1, 6), between(0, 59)),
      status: 'COMPLETED',
      type,
      cashierId: onlineStore.id,
      withInvoice: true,
      channel: 'ONLINE',
      paymentStatus: 'PAID_ONLINE',
    });
  }
  await createOrder({
    date: todayAt(0, between(5, 25)),
    status: 'PENDING',
    type: 'DELIVERY',
    cashierId: onlineStore.id,
    withInvoice: false,
    channel: 'ONLINE',
    paymentStatus: 'PENDING_PAYMENT',
  });

  const openStatuses: OrderStatus[] = ['PENDING', 'PENDING', 'CONFIRMED', 'PREPARING', 'PREPARING', 'READY'];
  let openIndex = 0;
  for (const status of openStatuses) {
    const typeRoll = random();
    const type: OrderType =
      typeRoll < 0.45 ? 'DELIVERY' : typeRoll < 0.75 ? 'TAKEAWAY' : 'DINE_IN';
    await createOrder({
      date: todayAt(0, between(5, 50) + openIndex * 4),
      status,
      type,
      cashierId: pick(cashiers).id,
      withInvoice: false,
    });
    openIndex += 1;
  }

  const purchaseSkus = ['ING-FLOUR', 'ING-MOZZ', 'ING-TOMATO', 'ING-CHICKEN', 'ING-PEPPERONI'];
  for (const sku of purchaseSkus) {
    const ingredient = ingredients[sku]!;
    await prisma.inventoryMovement.create({
      data: {
        ingredientId: ingredient.id,
        type: 'PURCHASE',
        quantity: '25.000',
        unitCost: money(ingredient.cost),
        reference: 'PO-2026-' + sku.slice(4),
        note: 'Weekly stock replenishment',
        userId: admin.id,
        createdAt: dayStart(12),
      },
    });
  }

  const lowStock: Record<string, string> = {
    'ING-SHRIMP': '2.000',
    'ING-TRUFFLE': '0.300',
    'ING-BASIL': '0.800',
    'ING-FETA': '2.400',
  };
  for (const [sku, stock] of Object.entries(lowStock)) {
    await prisma.ingredientStock.update({
      where: {
        ingredientId_branchId: { ingredientId: ingredients[sku]!.id, branchId: mainBranch.id },
      },
      data: { currentStock: stock },
    });
  }

  for (const [sku, stock] of Object.entries(lowStock)) {
    await prisma.stockAlert.create({
      data: {
        ingredientId: ingredients[sku]!.id,
        branchId: mainBranch.id,
        type: Number(stock) <= 0 ? 'OUT' : 'LOW',
        currentStock: stock,
        threshold: '3.000',
        message: 'Stock below reorder level after today’s service.',
        createdAt: dayStart(1),
      },
    });
  }

  await prisma.hrSettings.create({
    data: {
      id: 'default',
      workStart: '09:00',
      workEnd: '17:00',
      graceMinutes: 10,
      lateDeductionPerMinute: '5.00',
      absenceDeductionMultiplier: '1.00',
      weeklyDaysOff: [5, 6],
    },
  });

  const employeeSeeds = [
    ['Ahmed Hassan', 'Head Chef', '14000.00', 'MONTHLY', 'ACTIVE', 720],
    ['Mona Salem', 'Cashier', '8000.00', 'MONTHLY', 'ACTIVE', 420],
    ['Youssef Ali', 'Delivery Driver', '450.00', 'DAILY', 'ACTIVE', 300],
    ['Sara Ibrahim', 'Kitchen Assistant', '6000.00', 'MONTHLY', 'ACTIVE', 260],
    ['Karim Mostafa', 'Waiter', '5000.00', 'MONTHLY', 'ACTIVE', 180],
    ['Nour Adel', 'Cleaning Staff', '400.00', 'DAILY', 'INACTIVE', 900],
  ] as const;
  const employees: Array<{ id: string; fullName: string }> = [];
  for (const [index, [fullName, jobTitle, basicSalary, salaryType, status, daysAgo]] of employeeSeeds.entries()) {
    const employee = await prisma.employee.create({
      data: {
        employeeCode: `EMP-${String(index + 1).padStart(4, '0')}`,
        fullName,
        phone: `010${String(12345670 + index).padStart(8, '0')}`,
        jobTitle,
        branchId: mainBranch.id,
        hireDate: dateOnly(daysAgo),
        basicSalary,
        salaryType,
        status,
      },
    });
    employees.push({ id: employee.id, fullName: employee.fullName });
  }

  // Six weeks of simple attendance: mostly present, some late arrivals and absences.
  const attendanceRows: Array<{
    employeeId: string;
    date: Date;
    checkIn: string | null;
    checkOut: string | null;
    status: 'PRESENT' | 'ABSENT' | 'LATE' | 'DAY_OFF';
    lateMinutes: number;
  }> = [];
  const activeEmployees = employees.slice(0, 5);
  for (const [employeeIndex, employee] of activeEmployees.entries()) {
    for (let offset = 1; offset <= 45; offset += 1) {
      const date = dateOnly(offset);
      const weekday = date.getUTCDay();
      if (weekday === 5 || weekday === 6) continue;
      const spin = (offset + employeeIndex * 2) % 11;
      if (spin === 0) {
        attendanceRows.push({
          employeeId: employee.id,
          date,
          checkIn: null,
          checkOut: null,
          status: 'ABSENT',
          lateMinutes: 0,
        });
      } else if (spin === 4) {
        attendanceRows.push({
          employeeId: employee.id,
          date,
          checkIn: '09:25',
          checkOut: '17:05',
          status: 'LATE',
          lateMinutes: 15,
        });
      } else {
        attendanceRows.push({
          employeeId: employee.id,
          date,
          checkIn: '08:55',
          checkOut: '17:05',
          status: 'PRESENT',
          lateMinutes: 0,
        });
      }
    }
  }
  await prisma.attendanceRecord.createMany({ data: attendanceRows });

  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  await prisma.employeeAdjustment.createMany({
    data: [
      {
        employeeId: activeEmployees[0]!.id,
        category: 'PERFORMANCE_BONUS',
        amount: '750.00',
        date: dateOnly(3),
        reason: 'Consistent kitchen quality and zero waste week.',
        payrollMonth: currentMonth,
      },
      {
        employeeId: activeEmployees[1]!.id,
        category: 'OTHER_DEDUCTION',
        amount: '120.00',
        date: dateOnly(6),
        reason: 'Damaged receipt roll and cash-drawer correction.',
        payrollMonth: currentMonth,
      },
      {
        employeeId: activeEmployees[2]!.id,
        category: 'OVERTIME',
        amount: '300.00',
        date: dateOnly(5),
        reason: 'Late deliveries during the weekend rush.',
        payrollMonth: currentMonth,
      },
      {
        employeeId: activeEmployees[3]!.id,
        category: 'LATE_ARRIVAL',
        amount: '50.00',
        date: dateOnly(8),
        reason: 'Repeated late clock-ins this month.',
        payrollMonth: currentMonth,
      },
    ],
  });

  const counts = {
    users: await prisma.user.count(),
    categories: await prisma.category.count(),
    menuItems: await prisma.menuItem.count(),
    toppings: await prisma.topping.count(),
    ingredients: await prisma.ingredient.count(),
    customers: await prisma.customer.count(),
    orders: await prisma.order.count(),
    onlineOrders: await prisma.order.count({ where: { channel: 'ONLINE' } }),
    invoices: await prisma.invoice.count(),
  };
  console.log('Seed complete:', counts);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
