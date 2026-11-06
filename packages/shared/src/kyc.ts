export const KYC_TIERS = [0, 1, 2, 3] as const;
export type KycTier = (typeof KYC_TIERS)[number];

export const TIER_REQUIREMENTS: Record<KycTier, string[]> = {
  0: ['email', 'phone', '2fa'],
  1: ['liveness', 'id_document'],
  2: ['proof_of_address'],
  3: ['video_call', 'security_deposit'],
};

/** Default limits in USD cents. Real values live in limits_config (admin editable). */
export const DEFAULT_TIER_LIMITS_USD_CENTS: Record<KycTier, { daily: bigint; monthly: bigint; perOrder: bigint; withdrawDaily: bigint }> = {
  0: { daily: 50_000n, monthly: 500_000n, perOrder: 50_000n, withdrawDaily: 50_000n },
  1: { daily: 1_000_000n, monthly: 10_000_000n, perOrder: 1_000_000n, withdrawDaily: 1_000_000n },
  2: { daily: 10_000_000n, monthly: 100_000_000n, perOrder: 10_000_000n, withdrawDaily: 10_000_000n },
  3: { daily: 100_000_000n, monthly: 1_000_000_000n, perOrder: 100_000_000n, withdrawDaily: 100_000_000n },
};

export const tierCanCreateAds = (t: number) => t >= 1;
export const tierRequires2fa = (t: number) => t >= 1;
