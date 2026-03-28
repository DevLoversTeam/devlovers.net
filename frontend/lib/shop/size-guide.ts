import { defaultLocale, type Locale, locales } from '@/i18n/config';
import { SIZES } from '@/lib/config/catalog';
import type { ShopProduct } from '@/lib/validation/shop';

export type ApparelSizeGuideSize = (typeof SIZES)[number];

export type ApparelSizeGuideChartRow = {
  size: ApparelSizeGuideSize;
  chestWidthCm: number;
  bodyLengthCm: number;
};

export type ApparelSizeGuide = {
  label: string;
  title: string;
  intro: string;
  measurementNote: string;
  fitNotes: string[];
  chart: {
    caption: string;
    unit: 'cm';
    columns: {
      size: string;
      chestWidth: string;
      bodyLength: string;
    };
    rows: ApparelSizeGuideChartRow[];
  };
};

const APPAREL_SIZE_GUIDE_ROWS: ApparelSizeGuideChartRow[] = [
  { size: 'XS', chestWidthCm: 49, bodyLengthCm: 66 },
  { size: 'S', chestWidthCm: 52, bodyLengthCm: 69 },
  { size: 'M', chestWidthCm: 55, bodyLengthCm: 72 },
  { size: 'L', chestWidthCm: 58, bodyLengthCm: 74 },
  { size: 'XL', chestWidthCm: 61, bodyLengthCm: 76 },
  { size: 'XXL', chestWidthCm: 64, bodyLengthCm: 78 },
];

const APPAREL_SIZE_GUIDE_CONTENT: Record<Locale, ApparelSizeGuide> = {
  en: {
    label: 'Size guide',
    title: 'Apparel size guide',
    intro:
      'Use this guide for our unisex tees and hoodies. Compare the chart to a garment you already own for the most reliable fit.',
    measurementNote:
      'Measurements are garment measurements in centimeters, taken flat. Chest width is measured pit-to-pit, and body length is measured from the highest shoulder point to the hem.',
    fitNotes: [
      'If you prefer a relaxed fit or you are between sizes, choose the larger size.',
      'Hoodies can feel slightly roomier than tees in the same size because of the heavier fabric.',
      'Allow a small production tolerance of around 1-2 cm.',
    ],
    chart: {
      caption: 'Unisex apparel measurements',
      unit: 'cm',
      columns: {
        size: 'Size',
        chestWidth: 'Chest width',
        bodyLength: 'Body length',
      },
      rows: APPAREL_SIZE_GUIDE_ROWS,
    },
  },
  uk: {
    label: 'Гід по розмірах',
    title: 'Гід по розмірах одягу',
    intro:
      'Використовуйте цей гід для наших унісекс футболок і худі. Найкраще порівнювати таблицю з річчю, яка вже добре вам підходить.',
    measurementNote:
      'Усі значення — це виміри виробу в сантиметрах у розкладеному вигляді. Ширина грудей вимірюється від пахви до пахви, а довжина виробу — від найвищої точки плеча до нижнього краю.',
    fitNotes: [
      'Якщо любите більш вільну посадку або вагаєтесь між двома розмірами, обирайте більший.',
      'Худі можуть відчуватися трохи вільніше, ніж футболки того самого розміру, через щільнішу тканину.',
      'Допускайте невелику виробничу похибку близько 1-2 см.',
    ],
    chart: {
      caption: 'Виміри унісекс одягу',
      unit: 'cm',
      columns: {
        size: 'Розмір',
        chestWidth: 'Ширина грудей',
        bodyLength: 'Довжина виробу',
      },
      rows: APPAREL_SIZE_GUIDE_ROWS,
    },
  },
  pl: {
    label: 'Tabela rozmiarów',
    title: 'Tabela rozmiarów odzieży',
    intro:
      'Korzystaj z tej tabeli dla naszych koszulek i bluz unisex. Najpewniejszy wybór uzyskasz, porównując wymiary z ubraniem, które już dobrze na Ciebie leży.',
    measurementNote:
      'Wszystkie wartości to wymiary gotowego produktu w centymetrach, mierzone na płasko. Szerokość klatki mierzymy od pachy do pachy, a długość od najwyższego punktu ramienia do dołu.',
    fitNotes: [
      'Jeśli wolisz luźniejszy fason albo jesteś między rozmiarami, wybierz większy.',
      'Bluzy mogą wydawać się nieco luźniejsze niż koszulki w tym samym rozmiarze ze względu na grubszą tkaninę.',
      'Uwzględnij niewielką tolerancję produkcyjną około 1-2 cm.',
    ],
    chart: {
      caption: 'Wymiary odzieży unisex',
      unit: 'cm',
      columns: {
        size: 'Rozmiar',
        chestWidth: 'Szerokość klatki',
        bodyLength: 'Długość',
      },
      rows: APPAREL_SIZE_GUIDE_ROWS,
    },
  },
};

function isSupportedLocale(locale: string): locale is Locale {
  return locales.some(candidate => candidate === locale);
}

export function getApparelSizeGuide(locale: string): ApparelSizeGuide {
  const normalized = isSupportedLocale(locale) ? locale : defaultLocale;

  return APPAREL_SIZE_GUIDE_CONTENT[normalized];
}

export function getApparelSizeGuideForProduct(
  product: Pick<ShopProduct, 'sizes'> | null | undefined,
  locale: string
): ApparelSizeGuide | null {
  if (!product?.sizes || product.sizes.length === 0) {
    return null;
  }

  return getApparelSizeGuide(locale);
}

export { APPAREL_SIZE_GUIDE_CONTENT };
