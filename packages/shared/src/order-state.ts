/**
 * Order state machine — the single source of truth (spec section 4).
 * Pure: it answers "is this transition legal for this actor?"; persistence enforces it
 * with `WHERE status = :expected` optimistic checks.
 */
export const ORDER_STATUSES = ['CREATED', 'AWAITING_PAYMENT', 'PAID', 'COMPLETED', 'CANCELLED', 'DISPUTED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const TERMINAL_STATUSES: readonly OrderStatus[] = ['COMPLETED', 'CANCELLED'];

export type OrderActor = 'buyer' | 'seller' | 'system' | 'verifier' | 'arbiter';

export const ORDER_EVENTS = [
  'ESCROW_LOCKED', // CREATED -> AWAITING_PAYMENT
  'MARK_PAID', // buyer
  'VERIFIER_CONFIRMED', // PaymentVerifier: AWAITING_PAYMENT -> PAID
  'BUYER_CANCEL',
  'TIMEOUT',
  'RELEASE', // seller
  'AUTO_RELEASE', // verifier full match, PAID -> COMPLETED
  'OPEN_DISPUTE',
  'ARBITER_RELEASE',
  'ARBITER_REFUND',
  'ARBITER_SPLIT',
  'LINKED_LEG_FAILED', // corridor rollback (M11)
] as const;
export type OrderEvent = (typeof ORDER_EVENTS)[number];

interface TransitionRule {
  from: OrderStatus;
  to: OrderStatus;
  actors: readonly OrderActor[];
}

export const TRANSITIONS: Record<OrderEvent, TransitionRule[]> = {
  ESCROW_LOCKED: [{ from: 'CREATED', to: 'AWAITING_PAYMENT', actors: ['system'] }],
  MARK_PAID: [{ from: 'AWAITING_PAYMENT', to: 'PAID', actors: ['buyer'] }],
  VERIFIER_CONFIRMED: [{ from: 'AWAITING_PAYMENT', to: 'PAID', actors: ['verifier'] }],
  BUYER_CANCEL: [{ from: 'AWAITING_PAYMENT', to: 'CANCELLED', actors: ['buyer'] }],
  TIMEOUT: [
    { from: 'AWAITING_PAYMENT', to: 'CANCELLED', actors: ['system'] },
    { from: 'CREATED', to: 'CANCELLED', actors: ['system'] },
  ],
  RELEASE: [{ from: 'PAID', to: 'COMPLETED', actors: ['seller'] }],
  AUTO_RELEASE: [{ from: 'PAID', to: 'COMPLETED', actors: ['verifier', 'system'] }],
  OPEN_DISPUTE: [{ from: 'PAID', to: 'DISPUTED', actors: ['buyer', 'seller', 'system'] }],
  ARBITER_RELEASE: [{ from: 'DISPUTED', to: 'COMPLETED', actors: ['arbiter'] }],
  ARBITER_REFUND: [{ from: 'DISPUTED', to: 'CANCELLED', actors: ['arbiter'] }],
  ARBITER_SPLIT: [{ from: 'DISPUTED', to: 'COMPLETED', actors: ['arbiter'] }],
  LINKED_LEG_FAILED: [
    { from: 'CREATED', to: 'CANCELLED', actors: ['system'] },
    { from: 'AWAITING_PAYMENT', to: 'CANCELLED', actors: ['system'] },
  ],
};

export class TransitionError extends Error {
  constructor(
    public readonly from: OrderStatus,
    public readonly event: OrderEvent,
    public readonly actor: OrderActor,
    message?: string,
  ) {
    super(message ?? `illegal transition: ${event} by ${actor} from ${from}`);
  }
}

/** Returns the target status or throws TransitionError. */
export function nextStatus(from: OrderStatus, event: OrderEvent, actor: OrderActor): OrderStatus {
  const rule = TRANSITIONS[event]?.find((r) => r.from === from);
  if (!rule || !rule.actors.includes(actor)) throw new TransitionError(from, event, actor);
  return rule.to;
}

export function canTransition(from: OrderStatus, event: OrderEvent, actor: OrderActor): boolean {
  try {
    nextStatus(from, event, actor);
    return true;
  } catch {
    return false;
  }
}

export function isTerminal(s: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(s);
}

/** Money effect of a transition — drives which ledger op runs. */
export type EscrowEffect = 'lock' | 'release' | 'refund' | 'split' | 'none';
export function escrowEffect(event: OrderEvent): EscrowEffect {
  switch (event) {
    case 'ESCROW_LOCKED':
      return 'lock';
    case 'RELEASE':
    case 'AUTO_RELEASE':
    case 'ARBITER_RELEASE':
      return 'release';
    case 'BUYER_CANCEL':
    case 'TIMEOUT':
    case 'ARBITER_REFUND':
    case 'LINKED_LEG_FAILED':
      return 'refund';
    case 'ARBITER_SPLIT':
      return 'split';
    default:
      return 'none';
  }
}

/** Default appeal wait before a PAID order can be disputed (minutes). */
export const DEFAULT_APPEAL_WAIT_MIN = 10;
