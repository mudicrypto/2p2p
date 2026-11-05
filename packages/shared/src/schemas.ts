import { z } from 'zod';
import { ASSET_LIST, NETWORK_LIST } from './assets';

const decimalStr = z.string().regex(/^\d+(\.\d+)?$/, 'decimal string expected');
export const zAsset = z.enum(ASSET_LIST as [string, ...string[]]);
export const zNetwork = z.enum(NETWORK_LIST as [string, ...string[]]);
export const zFiat = z.string().regex(/^[A-Z]{3}$/);
export const zCountry = z.string().regex(/^[A-Z]{2}$/);
export const zUuid = z.string().uuid();

// ---- auth
export const SignupEmailSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(10).max(256),
  country: zCountry,
  locale: z.string().max(16).optional(),
});
export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totp: z.string().regex(/^\d{6}$/).optional(),
  deviceFingerprint: z.string().max(256).optional(),
});
export const VerifyEmailSchema = z.object({ token: z.string().min(10) });
export const PhoneStartSchema = z.object({ phone: z.string().regex(/^\+[1-9]\d{6,14}$/) });
export const PhoneVerifySchema = z.object({ phone: z.string(), code: z.string().regex(/^\d{6}$/) });
export const TelegramAuthSchema = z.object({ initData: z.string().min(10), country: zCountry.optional() });
export const TotpConfirmSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

// ---- ads
export const CreateAdSchema = z
  .object({
    side: z.enum(['buy', 'sell']),
    asset: zAsset,
    fiat: zFiat,
    priceType: z.enum(['fixed', 'floating']),
    price: decimalStr.optional(),
    marginBps: z.number().int().min(-2000).max(2000).optional(),
    minAmount: decimalStr, // fiat
    maxAmount: decimalStr, // fiat
    totalAmount: decimalStr, // crypto
    paymentMethodIds: z.array(zUuid).min(1).max(5),
    paymentWindowMin: z.number().int().min(5).max(180).default(15),
    terms: z.string().max(2000).default(''),
    minCounterpartyTier: z.number().int().min(0).max(3).default(0),
  })
  .refine((a) => (a.priceType === 'fixed' ? !!a.price : a.marginBps !== undefined), {
    message: 'fixed ads need price; floating ads need marginBps',
  });
export type CreateAdInput = z.infer<typeof CreateAdSchema>;

export const OrderBookQuerySchema = z.object({
  side: z.enum(['buy', 'sell']),
  asset: zAsset,
  fiat: zFiat,
  paymentType: z.string().max(64).optional(),
  amount: decimalStr.optional(), // fiat amount the taker wants
  minTier: z.coerce.number().int().min(0).max(3).optional(),
  merchantOnly: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export const CreateOrderSchema = z
  .object({
    adId: zUuid,
    fiatAmount: decimalStr.optional(),
    cryptoAmount: decimalStr.optional(),
    paymentMethodId: zUuid.optional(),
  })
  .refine((o) => !!o.fiatAmount !== !!o.cryptoAmount, { message: 'provide exactly one of fiatAmount, cryptoAmount' });

export const OpenDisputeSchema = z.object({
  reason: z.enum(['not_paid', 'not_released', 'wrong_amount', 'third_party_payment', 'fraud', 'other']),
  note: z.string().min(1).max(4000),
  evidenceKeys: z.array(z.string()).min(1).max(10),
});

export const ChatMessageSchema = z.object({ body: z.string().max(2000).default(''), attachmentKey: z.string().optional() });

export const WithdrawSchema = z.object({
  asset: zAsset,
  network: zNetwork,
  address: z.string().min(10).max(128),
  amount: decimalStr,
  totp: z.string().regex(/^\d{6}$/),
});
export const InternalTransferSchema = z.object({
  asset: zAsset,
  toUserId: zUuid,
  amount: decimalStr,
  totp: z.string().regex(/^\d{6}$/),
});
