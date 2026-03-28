import 'server-only';

import {
  assertProductionLikeProviderPhone,
  assertProductionLikeProviderString,
  assertProductionLikeProviderUrl,
  isProductionLikeRuntime,
  ShopProviderConfigError,
} from '@/lib/env/provider-runtime';

const DEFAULT_NP_API_BASE = 'https://api.novaposhta.ua/v2.0/json/';

function nonEmpty(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export type ShopShippingFlags = {
  shippingEnabled: boolean;
  npEnabled: boolean;
  syncEnabled: boolean;
  retentionEnabled: boolean;
  retentionDays: number;
};

export type NovaPoshtaSenderConfig = {
  cityRef: string;
  warehouseRef: string;
  senderRef: string;
  contactRef: string;
  name: string;
  phone: string;
  edrpou: string | null;
};

export type NovaPoshtaConfig = {
  enabled: boolean;
  apiBaseUrl: string;
  apiKey: string | null;
  defaultCargoType: string;
  defaultWeightGrams: number;
  sender: NovaPoshtaSenderConfig | null;
};

export class NovaPoshtaConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NovaPoshtaConfigError';
  }
}

function assertNovaPoshtaRuntimeConfig(args: {
  apiBaseUrl: string;
  apiKey: string;
  sender: {
    cityRef: string;
    warehouseRef: string;
    senderRef: string;
    contactRef: string;
    name: string;
    phone: string;
  };
}) {
  try {
    assertProductionLikeProviderUrl({
      provider: 'nova_poshta',
      envName: 'NP_API_BASE',
      value: args.apiBaseUrl,
    });
    assertProductionLikeProviderString({
      provider: 'nova_poshta',
      envName: 'NP_API_KEY',
      value: args.apiKey,
      minLength: 8,
    });
    assertProductionLikeProviderString({
      provider: 'nova_poshta',
      envName: 'NP_SENDER_CITY_REF',
      value: args.sender.cityRef,
      minLength: 8,
    });
    assertProductionLikeProviderString({
      provider: 'nova_poshta',
      envName: 'NP_SENDER_WAREHOUSE_REF',
      value: args.sender.warehouseRef,
      minLength: 8,
    });
    assertProductionLikeProviderString({
      provider: 'nova_poshta',
      envName: 'NP_SENDER_REF',
      value: args.sender.senderRef,
      minLength: 8,
    });
    assertProductionLikeProviderString({
      provider: 'nova_poshta',
      envName: 'NP_SENDER_CONTACT_REF',
      value: args.sender.contactRef,
      minLength: 8,
    });
    assertProductionLikeProviderString({
      provider: 'nova_poshta',
      envName: 'NP_SENDER_NAME',
      value: args.sender.name,
      minLength: 2,
    });
    assertProductionLikeProviderPhone({
      provider: 'nova_poshta',
      envName: 'NP_SENDER_PHONE',
      value: args.sender.phone,
    });
  } catch (error) {
    if (error instanceof ShopProviderConfigError) {
      throw new NovaPoshtaConfigError(error.message);
    }
    throw error;
  }
}

export function getShopShippingFlags(): ShopShippingFlags {
  const retentionDays = Math.max(
    1,
    Math.min(
      3650,
      parsePositiveInt(process.env.SHOP_SHIPPING_RETENTION_DAYS, 180)
    )
  );

  return {
    shippingEnabled: process.env.SHOP_SHIPPING_ENABLED === 'true',
    npEnabled: process.env.SHOP_SHIPPING_NP_ENABLED === 'true',
    syncEnabled: process.env.SHOP_SHIPPING_SYNC_ENABLED === 'true',
    retentionEnabled: process.env.SHOP_SHIPPING_RETENTION_ENABLED === 'true',
    retentionDays,
  };
}

export function getNovaPoshtaConfig(): NovaPoshtaConfig {
  const flags = getShopShippingFlags();

  const apiBaseUrl = nonEmpty(process.env.NP_API_BASE) ?? DEFAULT_NP_API_BASE;
  const defaultCargoType =
    nonEmpty(process.env.NP_DEFAULT_CARGO_TYPE) ?? 'Cargo';
  const defaultWeightGrams = parsePositiveInt(
    process.env.NP_DEFAULT_WEIGHT_GRAMS,
    1000
  );

  if (!flags.shippingEnabled || !flags.npEnabled) {
    return {
      enabled: false,
      apiBaseUrl,
      apiKey: null,
      defaultCargoType,
      defaultWeightGrams,
      sender: null,
    };
  }

  const apiKey = nonEmpty(process.env.NP_API_KEY);
  const sender = {
    cityRef: nonEmpty(process.env.NP_SENDER_CITY_REF),
    warehouseRef: nonEmpty(process.env.NP_SENDER_WAREHOUSE_REF),
    senderRef: nonEmpty(process.env.NP_SENDER_REF),
    contactRef: nonEmpty(process.env.NP_SENDER_CONTACT_REF),
    name: nonEmpty(process.env.NP_SENDER_NAME),
    phone: nonEmpty(process.env.NP_SENDER_PHONE),
    edrpou: nonEmpty(process.env.NP_SENDER_EDRPOU),
  };

  const missing: string[] = [];
  if (!apiKey) missing.push('NP_API_KEY');
  if (!sender.cityRef) missing.push('NP_SENDER_CITY_REF');
  if (!sender.warehouseRef) missing.push('NP_SENDER_WAREHOUSE_REF');
  if (!sender.senderRef) missing.push('NP_SENDER_REF');
  if (!sender.contactRef) missing.push('NP_SENDER_CONTACT_REF');
  if (!sender.name) missing.push('NP_SENDER_NAME');
  if (!sender.phone) missing.push('NP_SENDER_PHONE');

  if (missing.length > 0) {
    throw new NovaPoshtaConfigError(
      `Nova Poshta is enabled but required env vars are missing: ${missing.join(', ')}`
    );
  }

  assertNovaPoshtaRuntimeConfig({
    apiBaseUrl,
    apiKey: apiKey!,
    sender: {
      cityRef: sender.cityRef!,
      warehouseRef: sender.warehouseRef!,
      senderRef: sender.senderRef!,
      contactRef: sender.contactRef!,
      name: sender.name!,
      phone: sender.phone!,
    },
  });

  return {
    enabled: true,
    apiBaseUrl,
    apiKey,
    defaultCargoType,
    defaultWeightGrams,
    sender: {
      cityRef: sender.cityRef!,
      warehouseRef: sender.warehouseRef!,
      senderRef: sender.senderRef!,
      contactRef: sender.contactRef!,
      name: sender.name!,
      phone: sender.phone!,
      edrpou: sender.edrpou ?? null,
    },
  };
}

export function assertNovaPoshtaProductionLikeReady(): void {
  const flags = getShopShippingFlags();
  if (!flags.shippingEnabled || !flags.npEnabled) return;
  if (!isProductionLikeRuntime()) return;
  getNovaPoshtaConfig();
}
