/** Admin sections. `roles` hides menu items client-side; the API enforces permissions server-side. */
export interface Action { label: string; method: 'POST' | 'PUT' | 'PATCH'; path: (row: any) => string; body?: (row: any) => Promise<unknown> | unknown; danger?: boolean }
export interface Section { key: string; title: string; roles: string[]; list: string; search?: boolean; actions?: Action[]; editor?: { path: string; method: 'PUT' | 'PATCH'; template: unknown } }
const ask = (q: string) => { const v = window.prompt(q); if (!v) throw new Error('cancelled'); return v; };
export const SECTIONS: Section[] = [
  { key: 'users', title: 'Users', roles: ['support', 'compliance'], list: '/users?q=', search: true, actions: [
    { label: 'Freeze', method: 'POST', path: (r) => `/users/${r.id}/status`, body: () => ({ status: 'frozen', reason: ask('Reason') }), danger: true },
    { label: 'Unfreeze', method: 'POST', path: (r) => `/users/${r.id}/status`, body: () => ({ status: 'active', reason: ask('Reason') }) },
  ] },
  { key: 'kyc', title: 'KYC review', roles: ['compliance'], list: '/kyc', actions: [
    { label: 'Approve', method: 'POST', path: (r) => `/kyc/${r.id}/review`, body: () => ({ approve: true, note: ask('Note') }) },
    { label: 'Reject', method: 'POST', path: (r) => `/kyc/${r.id}/review`, body: () => ({ approve: false, note: ask('Reason') }), danger: true },
  ] },
  { key: 'withdrawals', title: 'Withdrawal approvals', roles: ['finance', 'compliance'], list: '/withdrawals', actions: [
    { label: 'Approve', method: 'POST', path: (r) => `/withdrawals/${r.id}/approve` },
    { label: 'Reject', method: 'POST', path: (r) => `/withdrawals/${r.id}/reject`, body: () => ({ note: ask('Reason') }), danger: true },
  ] },
  { key: 'deposits', title: 'Held deposits', roles: ['compliance'], list: '/deposits/held', actions: [
    { label: 'Credit', method: 'POST', path: (r) => `/deposits/${r.id}/review`, body: () => ({ decision: 'credit', note: ask('Note') }) },
    { label: 'Reject', method: 'POST', path: (r) => `/deposits/${r.id}/review`, body: () => ({ decision: 'reject', note: ask('Note') }), danger: true },
  ] },
  { key: 'disputes', title: 'Arbiter queue', roles: ['arbiter'], list: '/disputes', actions: [
    { label: 'Assign to me', method: 'POST', path: (r) => `/disputes/${r.id}/assign` },
    { label: 'Release to buyer', method: 'POST', path: (r) => `/disputes/${r.id}/decide`, body: () => ({ decision: 'release', note: ask('Decision reason (sent to both parties)') }) },
    { label: 'Refund seller', method: 'POST', path: (r) => `/disputes/${r.id}/decide`, body: () => ({ decision: 'refund', note: ask('Decision reason (sent to both parties)') }) },
    { label: 'Split', method: 'POST', path: (r) => `/disputes/${r.id}/decide`, body: () => ({ decision: 'split', splitBuyerBps: Number(ask('Buyer share in bps (0-10000)')), note: ask('Decision reason') }) },
  ] },
  { key: 'freeze-reports', title: 'Freeze reports', roles: ['arbiter', 'compliance'], list: '/freeze-reports', actions: [
    { label: 'Approve payout', method: 'POST', path: (r) => `/freeze-reports/${r.id}/review`, body: () => ({ approve: true, payoutAsset: ask('Asset (USDT/BTC/ETH)'), payoutAmount: ask('Amount'), note: ask('Note') }) },
    { label: 'Reject', method: 'POST', path: (r) => `/freeze-reports/${r.id}/review`, body: () => ({ approve: false, note: ask('Reason') }), danger: true },
  ] },
  { key: 'flags', title: 'Risk flags', roles: ['compliance'], list: '/flags', actions: [{ label: 'Resolve', method: 'POST', path: (r) => `/flags/${r.id}/resolve`, body: () => ({ note: ask('Note') }) }] },
  { key: 'limits', title: 'Limits', roles: ['compliance', 'finance'], list: '/limits', actions: [
    { label: 'Edit', method: 'PUT', path: (r) => `/limits/${r.tier}`, body: () => ({ daily: ask('Daily USD'), monthly: ask('Monthly USD'), perOrder: ask('Per order USD'), withdrawDaily: ask('Withdraw daily USD') }) },
  ] },
  { key: 'countries', title: 'Country rules', roles: ['compliance', 'finance'], list: '/country-rules', editor: { path: '/country-rules/', method: 'PUT', template: { status: 'allowed', tier0Allowed: true, limitMultiplierBps: 10000, launchEnabled: true } }, actions: [
    { label: 'Block', method: 'PUT', path: (r) => `/country-rules/${r.country}`, body: () => ({ status: 'blocked' }), danger: true },
    { label: 'Allow', method: 'PUT', path: (r) => `/country-rules/${r.country}`, body: () => ({ status: 'allowed' }) },
  ] },
  { key: 'payment-methods', title: 'Payment methods', roles: ['finance', 'compliance'], list: '/payment-method-types', actions: [
    { label: 'Disable', method: 'PATCH', path: (r) => `/payment-method-types/${r.code}`, body: () => ({ enabled: false }), danger: true },
    { label: 'Enable', method: 'PATCH', path: (r) => `/payment-method-types/${r.code}`, body: () => ({ enabled: true }) },
  ] },
  { key: 'fees', title: 'Fees', roles: ['finance', 'compliance'], list: '/config/fees', editor: { path: '/config/fees', method: 'PUT', template: { makerBps: 10, takerBps: 0, insuranceShareBps: 1000 } } },
  { key: 'withdrawal-config', title: 'Withdrawal switches', roles: ['finance', 'compliance'], list: '/config/withdrawals', editor: { path: '/config/withdrawals', method: 'PUT', template: { paused: false } } },
  { key: 'audit', title: 'Audit log', roles: ['compliance'], list: '/audit?limit=200' },
  { key: 'admins', title: 'Admins', roles: [], list: '/admins' },
];
