import 'server-only';

import {
  getNovaPoshtaConfig,
  NovaPoshtaConfigError,
} from '@/lib/env/nova-poshta';

type NovaPoshtaEnvelope<T> = {
  success: boolean;
  data?: T[];
  errors?: string[];
  warnings?: string[];
  info?: string[];
  errorCodes?: string[];
};

type InternetDocumentSaveItem = {
  Ref?: string;
  IntDocNumber?: string;
};

type SearchSettlementsAddress = {
  Ref?: string;
  Present?: string;
  MainDescription?: string;
  Area?: string;
  Region?: string;
  SettlementTypeDescription?: string;
};

type SearchSettlementsItem = {
  TotalCount?: number | string;
  Addresses?: SearchSettlementsAddress[];
};

export type NovaPoshtaSettlement = {
  ref: string;
  nameUa: string;
  nameRu: string | null;
  area: string | null;
  region: string | null;
  settlementType: string | null;
};

type WarehouseItem = {
  Ref?: string;
  SettlementRef?: string;
  CityRef?: string;
  Number?: string;
  CategoryOfWarehouse?: string;
  TypeOfWarehouse?: string;
  Description?: string;
  DescriptionRu?: string;
  ShortAddress?: string;
  ShortAddressRu?: string;
};

export type NovaPoshtaWarehouse = {
  ref: string;
  settlementRef: string | null;
  cityRef: string | null;
  number: string | null;
  type: string | null;
  name: string;
  nameRu: string | null;
  address: string | null;
  addressRu: string | null;
  isPostMachine: boolean;
};

export type NovaPoshtaCreateTtnInput = {
  payerType: 'Recipient';
  paymentMethod: 'Cash';
  cargoType: string;
  serviceType:
    | 'WarehouseWarehouse'
    | 'WarehouseDoors'
    | 'DoorsWarehouse'
    | 'DoorsDoors';
  seatsAmount: number;
  weightKg: number;
  description: string;
  declaredCostUah: number;
  sender: {
    cityRef: string;
    senderRef: string;
    warehouseRef: string;
    contactRef: string;
    phone: string;
  };
  recipient: {
    cityRef: string;
    warehouseRef?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    fullName: string;
    phone: string;
  };
};

export type NovaPoshtaCreatedTtn = {
  providerRef: string;
  trackingNumber: string;
};

export class NovaPoshtaApiError extends Error {
  status: number;
  code: string;

  constructor(
    code: string,
    message: string,
    status = 503,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'NovaPoshtaApiError';
    this.status = status;
    this.code = code;
  }
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isPostMachineByLabels(
  ...labels: Array<string | null | undefined>
): boolean {
  const haystack = labels
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map(v => v.toLowerCase())
    .join(' | ');

  if (!haystack) return false;

  return (
    haystack.includes('поштомат') ||
    haystack.includes('постомат') ||
    haystack.includes('postomat') ||
    haystack.includes('parcel locker') ||
    haystack.includes('post machine') ||
    haystack.includes('postmachine') ||
    haystack.includes('locker') ||
    haystack.includes('postfinance') ||
    haystack.includes('post finance')
  );
}

function firstMessage(
  errors?: string[],
  warnings?: string[],
  info?: string[]
): string {
  const candidate =
    errors?.find(x => x.trim().length > 0) ??
    warnings?.find(x => x.trim().length > 0) ??
    info?.find(x => x.trim().length > 0);
  return candidate ?? 'Nova Poshta request failed';
}

function normalizeNpBusinessErrorCode(args: {
  rawCode: string | null | undefined;
  message: string;
}): string {
  const rawCode = readString(args.rawCode);
  const msg = args.message.toLowerCase();

  if (
    msg.includes('телефон') ||
    msg.includes('phone') ||
    msg.includes('mobile')
  ) {
    return 'NP_RECIPIENT_PHONE_INVALID';
  }

  if (
    msg.includes('отримувач') ||
    msg.includes('получател') ||
    msg.includes('recipient') ||
    msg.includes('full name') ||
    msg.includes("ім'я") ||
    msg.includes('имя')
  ) {
    return 'NP_RECIPIENT_INVALID';
  }

  if (
    msg.includes('поштомат') ||
    msg.includes('постомат') ||
    msg.includes('відділен') ||
    msg.includes('отделен') ||
    msg.includes('warehouse') ||
    msg.includes('branch') ||
    msg.includes('locker')
  ) {
    return 'NP_WAREHOUSE_INVALID';
  }

  if (
    msg.includes('міст') ||
    msg.includes('город') ||
    msg.includes('населен') ||
    msg.includes('city') ||
    msg.includes('settlement')
  ) {
    return 'NP_CITY_INVALID';
  }

  if (
    msg.includes('адрес') ||
    msg.includes('address') ||
    msg.includes('courier') ||
    msg.includes('вулиц') ||
    msg.includes('street')
  ) {
    return 'NP_ADDRESS_INVALID';
  }

  if (
    msg.includes('invalid') ||
    msg.includes('невір') ||
    msg.includes('некорект') ||
    msg.includes('required') ||
    msg.includes('обов') ||
    msg.includes('помилк') ||
    msg.includes('ошиб')
  ) {
    return 'NP_VALIDATION_ERROR';
  }

  return rawCode ?? 'NP_API_ERROR';
}

async function callNp<T>(params: {
  modelName: string;
  calledMethod: string;
  methodProperties: Record<string, unknown>;
}): Promise<T[]> {
  const config = getNovaPoshtaConfig();
  if (!config.enabled || !config.apiKey) {
    throw new NovaPoshtaConfigError('Nova Poshta shipping is not configured');
  }

  let response: Response;
  try {
    response = await fetch(config.apiBaseUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        apiKey: config.apiKey,
        modelName: params.modelName,
        calledMethod: params.calledMethod,
        methodProperties: params.methodProperties,
      }),
      cache: 'no-store',
    });
  } catch (error) {
    throw new NovaPoshtaApiError('NP_FETCH_FAILED', 'fetch failed', 0, {
      cause: error,
    });
  }

  if (!response.ok) {
    throw new NovaPoshtaApiError(
      'NP_HTTP_ERROR',
      `Nova Poshta HTTP error ${response.status}`,
      503
    );
  }

  let payload: NovaPoshtaEnvelope<T>;
  try {
    payload = (await response.json()) as NovaPoshtaEnvelope<T>;
  } catch {
    throw new NovaPoshtaApiError(
      'NP_INVALID_JSON',
      'Nova Poshta response parsing failed',
      503
    );
  }

  if (!payload.success) {
    const message = firstMessage(
      payload.errors,
      payload.warnings,
      payload.info
    );

    throw new NovaPoshtaApiError(
      normalizeNpBusinessErrorCode({
        rawCode: payload.errorCodes?.[0],
        message,
      }),
      message,
      503
    );
  }

  return payload.data ?? [];
}

export async function searchSettlements(args: {
  q: string;
  page?: number;
  limit?: number;
}): Promise<NovaPoshtaSettlement[]> {
  const rows = await callNp<SearchSettlementsItem>({
    modelName: 'Address',
    calledMethod: 'searchSettlements',
    methodProperties: {
      CityName: args.q,
      Page: Math.max(1, Math.floor(args.page ?? 1)),
      Limit: Math.max(1, Math.min(50, Math.floor(args.limit ?? 20))),
    },
  });

  const addresses = rows.flatMap(row =>
    Array.isArray(row.Addresses) ? row.Addresses : []
  );

  const out: NovaPoshtaSettlement[] = [];
  const seen = new Set<string>();

  for (const item of addresses) {
    const ref = readString(item.Ref);
    const present = readString(item.Present);
    const mainDescription = readString(item.MainDescription);
    const name = present ?? mainDescription;
    if (!ref || !name || seen.has(ref)) continue;
    seen.add(ref);

    out.push({
      ref,
      nameUa: name,
      nameRu: null,
      area: readString(item.Area),
      region: readString(item.Region),
      settlementType: readString(item.SettlementTypeDescription),
    });
  }

  return out;
}

/**
 * NP method:
 * - modelName: Address
 * - calledMethod: getWarehouses
 * Key fields mapped:
 * - Ref, SettlementRef, CityRef
 * - Number, TypeOfWarehouse/CategoryOfWarehouse
 * - Description/DescriptionRu, ShortAddress/ShortAddressRu
 */
export async function getWarehousesBySettlementRef(
  settlementRef: string
): Promise<NovaPoshtaWarehouse[]> {
  const rows = await callNp<WarehouseItem>({
    modelName: 'Address',
    calledMethod: 'getWarehouses',
    methodProperties: {
      SettlementRef: settlementRef,
      Limit: 500,
      Page: 1,
      Language: 'ua',
    },
  });

  const out: NovaPoshtaWarehouse[] = [];
  const seen = new Set<string>();

  for (const item of rows) {
    const ref = readString(item.Ref);
    const description = readString(item.Description);
    if (!ref || !description || seen.has(ref)) continue;
    seen.add(ref);

    const category = readString(item.CategoryOfWarehouse);
    const type = readString(item.TypeOfWarehouse);
    const descriptionRu = readString(item.DescriptionRu);
    const shortAddress = readString(item.ShortAddress);
    const shortAddressRu = readString(item.ShortAddressRu);

    const isPostMachine = isPostMachineByLabels(
      category,
      type,
      description,
      descriptionRu,
      shortAddress,
      shortAddressRu
    );

    out.push({
      ref,
      settlementRef: readString(item.SettlementRef),
      cityRef: readString(item.CityRef),
      number: readString(item.Number),
      type: type ?? category,
      name: description,
      nameRu: descriptionRu,
      address: shortAddress,
      addressRu: shortAddressRu,
      isPostMachine,
    });
  }

  return out;
}

export async function createInternetDocument(
  input: NovaPoshtaCreateTtnInput
): Promise<NovaPoshtaCreatedTtn> {
  const rows = await callNp<InternetDocumentSaveItem>({
    modelName: 'InternetDocument',
    calledMethod: 'save',
    methodProperties: {
      PayerType: input.payerType,
      PaymentMethod: input.paymentMethod,
      CargoType: input.cargoType,
      ServiceType: input.serviceType,
      SeatsAmount: String(Math.max(1, Math.trunc(input.seatsAmount))),
      Weight: Number(input.weightKg.toFixed(3)),
      Description: input.description,
      Cost: Math.max(0, Math.trunc(input.declaredCostUah)),

      CitySender: input.sender.cityRef,
      Sender: input.sender.senderRef,
      SenderAddress: input.sender.warehouseRef,
      ContactSender: input.sender.contactRef,
      SendersPhone: input.sender.phone,

      CityRecipient: input.recipient.cityRef,
      RecipientAddress: input.recipient.warehouseRef ?? undefined,
      RecipientAddressName:
        input.recipient.addressLine1 ||
        input.recipient.addressLine2 ||
        undefined,
      RecipientFullName: input.recipient.fullName,
      RecipientName: input.recipient.fullName,
      RecipientsPhone: input.recipient.phone,
    },
  });

  const first = rows[0];
  const providerRef = readString(first?.Ref);
  const trackingNumber = readString(first?.IntDocNumber);

  if (!providerRef || !trackingNumber) {
    throw new NovaPoshtaApiError(
      'NP_INVALID_TTN_RESPONSE',
      'Nova Poshta response missing TTN identifiers',
      503
    );
  }

  return {
    providerRef,
    trackingNumber,
  };
}
