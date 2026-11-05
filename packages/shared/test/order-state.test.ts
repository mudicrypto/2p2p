import { describe, it, expect } from 'vitest';
import { ORDER_STATUSES, ORDER_EVENTS, nextStatus, canTransition, TransitionError, isTerminal, OrderActor, OrderStatus, OrderEvent } from '../src';

const ACTORS: OrderActor[] = ['buyer', 'seller', 'system', 'verifier', 'arbiter'];

/** Exhaustive expected table: [from, event, actor] -> to. Anything not listed must be rejected. */
const LEGAL: Array<[OrderStatus, OrderEvent, OrderActor, OrderStatus]> = [
  ['CREATED', 'ESCROW_LOCKED', 'system', 'AWAITING_PAYMENT'],
  ['CREATED', 'TIMEOUT', 'system', 'CANCELLED'],
  ['CREATED', 'LINKED_LEG_FAILED', 'system', 'CANCELLED'],
  ['AWAITING_PAYMENT', 'MARK_PAID', 'buyer', 'PAID'],
  ['AWAITING_PAYMENT', 'VERIFIER_CONFIRMED', 'verifier', 'PAID'],
  ['AWAITING_PAYMENT', 'BUYER_CANCEL', 'buyer', 'CANCELLED'],
  ['AWAITING_PAYMENT', 'TIMEOUT', 'system', 'CANCELLED'],
  ['AWAITING_PAYMENT', 'LINKED_LEG_FAILED', 'system', 'CANCELLED'],
  ['PAID', 'RELEASE', 'seller', 'COMPLETED'],
  ['PAID', 'AUTO_RELEASE', 'verifier', 'COMPLETED'],
  ['PAID', 'AUTO_RELEASE', 'system', 'COMPLETED'],
  ['PAID', 'OPEN_DISPUTE', 'buyer', 'DISPUTED'],
  ['PAID', 'OPEN_DISPUTE', 'seller', 'DISPUTED'],
  ['PAID', 'OPEN_DISPUTE', 'system', 'DISPUTED'],
  ['DISPUTED', 'ARBITER_RELEASE', 'arbiter', 'COMPLETED'],
  ['DISPUTED', 'ARBITER_REFUND', 'arbiter', 'CANCELLED'],
  ['DISPUTED', 'ARBITER_SPLIT', 'arbiter', 'COMPLETED'],
];

describe('order state machine (exhaustive)', () => {
  const key = (f: string, e: string, a: string) => `${f}|${e}|${a}`;
  const legal = new Map(LEGAL.map(([f, e, a, t]) => [key(f, e, a), t]));
  for (const from of ORDER_STATUSES)
    for (const event of ORDER_EVENTS)
      for (const actor of ACTORS) {
        const expected = legal.get(key(from, event, actor));
        it(`${from} --${event}/${actor}--> ${expected ?? 'REJECT'}`, () => {
          if (expected) expect(nextStatus(from, event, actor)).toBe(expected);
          else expect(() => nextStatus(from, event, actor)).toThrow(TransitionError);
        });
      }
  it('buyer cannot cancel after PAID', () => {
    expect(canTransition('PAID', 'BUYER_CANCEL', 'buyer')).toBe(false);
  });
  it('terminal states have no exits', () => {
    for (const s of ORDER_STATUSES.filter(isTerminal))
      for (const e of ORDER_EVENTS) for (const a of ACTORS) expect(canTransition(s, e, a)).toBe(false);
  });
});
