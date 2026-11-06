import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, Db, participants, sq, uid } from './harness.ts';

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
const C = '00000000-0000-0000-0000-00000000000c';
const D = '00000000-0000-0000-0000-00000000000d'; // outsider
const E = '00000000-0000-0000-0000-00000000000e';

let db: Db;
let G: string; // main group, A creator+admin, B admin, C member
let G2: string; // second group created by D (cross-group isolation)

function mkGroup(owner: string, name = 'Flat 4B'): string {
  return db.rpc<string>(owner, 'create_group', `${sq(name)}`);
}
function invite(actor: string, group: string, maxUses = 'null', expires = `now() + interval '7 days'`): string {
  return db.rpc<string>(actor, 'create_group_invitation', `'${group}', ${expires}, ${maxUses}`);
}
function join(user: string, group: string, owner: string): void {
  const code = invite(owner, group);
  const req = db.rpc<string>(user, 'request_to_join_group', sq(code));
  db.rpc(owner, 'review_join_request', `'${req}', 'approved'`);
}
function exp(actor: string, group: string, o: {
  amount: number; payer: string; mode?: string; parts: Array<string | [string, number]>;
  key?: string; title?: string; at?: string; cat?: string;
}): string {
  const key = o.mode === 'amount' ? 'amount_paise' : o.mode === 'percent' ? 'percent_bps' : null;
  return db.rpc<string>(actor, 'create_expense',
    `'${group}', '${o.key ?? uid()}', ${sq(o.title ?? 'Test')}, ${o.amount}, '${o.cat ?? 'grocery'}', ${o.at ?? 'now()'}, '${o.payer}', '${o.mode ?? 'equal'}', ${participants(o.parts, key)}`);
}
function pay(actor: string, group: string, from: string, to: string, amount: number, extra = ''): string {
  return db.rpc<string>(actor, 'record_payment', `'${group}', '${uid()}', '${from}', '${to}', ${amount}, 'cash', now()${extra}`);
}
const balances = (actor: string, group: string, args = 'null, null') =>
  Object.fromEntries(db.rpc<any[]>(actor, 'get_group_balances', `'${group}', ${args}`).map((b) => [b.user_id, b]));

before(() => {
  db = createDb();
  db.user('a@t.dev', 'Asha', A); db.user('b@t.dev', 'Bala', B); db.user('c@t.dev', 'Chitra', C);
  db.user('d@t.dev', 'Dev', D); db.user('e@t.dev', 'Esha', E);
  G = mkGroup(A);
  join(B, G, A); join(C, G, A);
  db.rpc(A, 'set_group_member_role', `'${G}', '${B}', 'admin'`);
  G2 = mkGroup(D, 'Other flat');
});
after(() => db.drop());

describe('Phase 1: identity, groups, invitations', () => {
  it('creates a profile automatically and hides phone numbers from other members', () => {
    assert.equal(db.scalar(`select full_name from public.profiles where id = '${A}'`), 'Asha');
    db.rpc(A, 'update_my_profile', `'Asha K', '+91 98765 43210', null, 'hi'`);
    assert.match(db.fails(`select phone from public.profiles where id = '${A}'`, B), /permission denied/);
    assert.equal(db.rpc(B, 'list_group_members', `'${G}'`).length, 3);
    assert.equal(db.rpc<any>(A, 'get_my_profile').phone, '+91 98765 43210');
    assert.equal(db.rpc<any>(A, 'get_my_profile').preferred_language, 'hi');
    assert.equal(db.fails(`select public.update_my_profile('', null, null, 'en')`, A), 'INVALID_NAME');
    assert.equal(db.fails(`select public.update_my_profile('X', 'abc', null, 'en')`, A), 'INVALID_PHONE');
  });

  it('creator becomes an admin atomically; there is no owner role; a user can be in several groups', () => {
    assert.equal(db.scalar(`select role from public.group_members where group_id='${G}' and user_id='${A}' and status='active'`), 'admin');
    assert.equal(db.scalar(`select count(*) from public.group_members where role='owner'`), '0');
    join(A, G2, D);
    assert.equal(db.rpc<any[]>(A, 'list_my_groups').length, 2);
    assert.match(db.fails(`update public.group_members set role='owner' where group_id='${G}' and user_id='${B}'`), /group_members_role_check|violates check/);
  });

  it('stores only the hash of the invitation code', () => {
    const code = invite(A, G);
    assert.equal(code.length, 48);
    assert.equal(db.scalar(`select count(*) from public.group_invitations where token_hash = '${code}'`), '0');
    assert.equal(db.scalar(`select count(*) from public.group_invitations where token_hash = encode(extensions.digest('${code}','sha256'),'hex')`), '1');
    // clients cannot read the table at all
    assert.match(db.fails(`select * from public.group_invitations`, A), /permission denied/);
    const list = db.rpc<any[]>(A, 'list_group_invitations', `'${G}'`);
    assert.ok(list.length >= 1);
    assert.ok(!JSON.stringify(list).includes('token_hash'));
  });

  it('join creates only a pending request; approval needs an admin; members cannot approve', () => {
    const code = invite(A, G);
    const req = db.rpc<string>(E, 'request_to_join_group', sq(code), );
    assert.equal(db.scalar(`select count(*) from public.group_members where group_id='${G}' and user_id='${E}'`), '0');
    assert.equal(db.rpcFails(C, 'review_join_request', `'${req}', 'approved'`), 'ADMIN_REQUIRED');
    assert.equal(db.rpcFails(D, 'review_join_request', `'${req}', 'approved'`), 'NOT_A_MEMBER');
    assert.equal(db.rpc<any[]>(B, 'list_join_requests', `'${G}'`).length, 1);
    db.rpc(B, 'review_join_request', `'${req}', 'rejected'`);
    assert.equal(db.scalar(`select count(*) from public.group_members where group_id='${G}' and user_id='${E}'`), '0');
    assert.match(db.rpcFails(B, 'review_join_request', `'${req}', 'approved'`), /already been reviewed/);
  });

  it('rejects expired, revoked and used-up invitations; archived groups refuse invitations and joins', () => {
    const expired = invite(A, G);
    db.run(`update public.group_invitations set expires_at = now() - interval '1 minute' where token_hash = encode(extensions.digest('${expired}','sha256'),'hex')`);
    assert.match(db.rpcFails(E, 'request_to_join_group', sq(expired)), /invalid, expired, revoked/);

    const toRevoke = invite(A, G);
    const id = db.scalar(`select id from public.group_invitations where token_hash = encode(extensions.digest('${toRevoke}','sha256'),'hex')`);
    assert.equal(db.rpcFails(C, 'revoke_group_invitation', `'${id}'`), 'ADMIN_REQUIRED');
    db.rpc(B, 'revoke_group_invitation', `'${id}'`);
    assert.match(db.rpcFails(E, 'request_to_join_group', sq(toRevoke)), /invalid, expired, revoked/);

    const g3 = mkGroup(A, 'Temp');
    const code3 = invite(A, g3);
    db.rpc(A, 'archive_group', `'${g3}'`);
    assert.match(db.rpcFails(E, 'request_to_join_group', sq(code3)), /invalid|not accepting/);
    assert.equal(db.rpcFails(A, 'create_group_invitation', `'${g3}', now() + interval '1 day', null`), 'GROUP_ARCHIVED');
  });

  it('enforces max_uses (sequential) and concurrent approvals cannot exceed it', async () => {
    const g = mkGroup(A, 'Limited');
    const code = invite(A, g, '1');
    const r1 = db.rpc<string>(B, 'request_to_join_group', sq(code));
    const r2 = db.rpc<string>(C, 'request_to_join_group', sq(code));
    const [x, y] = await Promise.all([
      db.runAsync(`select public.review_join_request('${r1}', 'approved')`, A),
      db.runAsync(`select public.review_join_request('${r2}', 'approved')`, A),
    ]);
    assert.equal([x, y].filter((r) => r.ok).length, 1, 'exactly one approval may succeed');
    assert.ok([x, y].some((r) => /usage limit reached/.test(r.err)));
    assert.equal(db.scalar(`select count(*) from public.group_members where group_id='${g}' and status='active'`), '2');
    assert.equal(db.scalar(`select uses_count from public.group_invitations where group_id='${g}'`), '1');
  });

  it('rate limits join request spam', () => {
    const code = invite(A, G);
    let last = '';
    for (let i = 0; i < 21; i++) {
      try { db.rpc(E, 'request_to_join_group', sq(code)); } catch (e) { last = (e as Error).message; }
    }
    assert.equal(last, 'RATE_LIMITED');
  });

  it('roles: admins promote members; admins cannot demote/remove each other; last admin cannot leave', () => {
    assert.equal(db.rpcFails(C, 'set_group_member_role', `'${G}', '${C}', 'admin'`), 'ADMIN_REQUIRED');
    assert.equal(db.rpcFails(B, 'set_group_member_role', `'${G}', '${A}', 'member'`), 'ADMIN_CANNOT_BE_DEMOTED'); // only the creator may demote/remove admins
    assert.equal(db.rpcFails(B, 'remove_group_member', `'${G}', '${A}'`), 'ADMIN_CANNOT_BE_REMOVED');
    assert.match(db.rpcFails(B, 'set_group_member_role', `'${G}', '${E}', 'admin'`), /target membership not found/);
    assert.match(db.rpcFails(B, 'set_group_member_role', `'${G}', '${C}', 'owner'`), /Role must be admin or member/);
    // the creator can demote another admin (and re-promote), and remove an admin outright
    db.rpc(A, 'set_group_member_role', `'${G}', '${B}', 'member'`);
    assert.equal(db.scalar(`select role from public.group_members where group_id='${G}' and user_id='${B}' and status='active'`), 'member');
    db.rpc(A, 'set_group_member_role', `'${G}', '${B}', 'admin'`);
    const gr = mkGroup(A, 'Founder'); join(B, gr, A); db.rpc(A, 'set_group_member_role', `'${gr}', '${B}', 'admin'`);
    db.rpc(A, 'remove_group_member', `'${gr}', '${B}'`);
    assert.equal(db.scalar(`select status from public.group_members where group_id='${gr}' and user_id='${B}'`), 'removed');
    // a second admin (not the creator) can promote
    db.rpc(B, 'set_group_member_role', `'${G}', '${C}', 'admin'`);
    assert.equal(db.scalar(`select role from public.group_members where group_id='${G}' and user_id='${C}' and status='active'`), 'admin');
    assert.equal(db.scalar(`select count(*) from public.notifications where user_id='${C}' and type='admin_granted'`), '1');
    // C steps down again (allowed: others remain)
    db.rpc(C, 'set_group_member_role', `'${G}', '${C}', 'member'`);
    assert.equal(db.scalar(`select role from public.group_members where group_id='${G}' and user_id='${C}' and status='active'`), 'member');
    // last-admin protection
    const g = mkGroup(E, 'Solo'); join(C, g, E);
    assert.equal(db.rpcFails(E, 'leave_group', `'${g}'`), 'LAST_ADMIN');
    assert.equal(db.rpcFails(E, 'set_group_member_role', `'${g}', '${E}', 'member'`), 'LAST_ADMIN');
    db.rpc(E, 'set_group_member_role', `'${g}', '${C}', 'admin'`);
    db.rpc(E, 'leave_group', `'${g}'`);
    assert.equal(db.scalar(`select status from public.group_members where group_id='${g}' and user_id='${E}'`), 'left');
  });

  it('leaving / removal keeps membership history; admins cannot remove admins', () => {
    const g = mkGroup(A, 'Hist');
    join(B, g, A); join(C, g, A);
    db.rpc(A, 'set_group_member_role', `'${g}', '${B}', 'admin'`);
    assert.equal(db.rpcFails(B, 'remove_group_member', `'${g}', '${A}'`), 'ADMIN_CANNOT_BE_REMOVED');
    db.rpc(C, 'leave_group', `'${g}'`);
    db.rpc(B, 'set_group_member_role', `'${g}', '${B}', 'member'`);
    db.rpc(A, 'remove_group_member', `'${g}', '${B}'`);
    assert.equal(db.scalar(`select count(*) from public.group_members where group_id='${g}'`), '3');
    assert.equal(db.scalar(`select count(*) from public.group_members where group_id='${g}' and status='active'`), '1');
    assert.equal(db.rpcFails(C, 'get_group', `'${g}'`), 'NOT_A_MEMBER');
    // rejoin creates a new row, old rows stay
    join(C, g, A);
    assert.equal(db.scalar(`select count(*) from public.group_members where group_id='${g}' and user_id='${C}'`), '2');
  });
});

describe('Security: isolation and privileges', () => {
  it('outsiders are rejected by every group-scoped read RPC', () => {
    const calls: Array<[string, string]> = [
      ['get_group', `'${G}'`], ['list_group_members', `'${G}'`], ['list_join_requests', `'${G}', 'pending'`],
      ['list_group_invitations', `'${G}'`], ['list_group_activity', `'${G}', 10, null`],
      ['list_expenses', `'${G}'`], ['get_group_balances', `'${G}', null, null`],
      ['get_member_ledger', `'${G}', '${A}'`], ['list_payments', `'${G}'`], ['get_group_report', `'${G}', current_date`],
      ['list_group_budgets', `'${G}'`], ['get_shopping_list', `'${G}'`], ['list_notices', `'${G}'`],
    ];
    for (const [fn, args] of calls) {
      assert.equal(db.rpcFails(D, fn, args), 'NOT_A_MEMBER', fn);
    }
    const e = exp(A, G, { amount: 100, payer: A, parts: [A, B] });
    assert.equal(db.rpcFails(D, 'get_expense', `'${e}'`), 'NOT_A_MEMBER');
  });

  it('outsiders and members cannot write via the API', () => {
    assert.equal(db.rpcFails(D, 'create_expense', `'${G}', '${uid()}', 'x', 100, 'rent', now(), '${D}', 'equal', ${participants([D])}`.replace('now()', 'now()')), 'NOT_A_MEMBER');
    assert.equal(db.rpcFails(D, 'record_payment', `'${G}', '${uid()}', '${D}', '${A}', 100, 'cash', now()`), 'NOT_A_MEMBER');
    assert.equal(db.rpcFails(D, 'create_notice', `'${G}', 't', 'b', false`), 'NOT_A_MEMBER');
    assert.equal(db.rpcFails(C, 'set_group_budget', `'${G}', null, 100000`), 'ADMIN_REQUIRED');
    assert.equal(db.rpcFails(C, 'update_group', `'${G}', 'Hacked', null, null`), 'ADMIN_REQUIRED');
  });

  it('direct table access is read-only and membership scoped (RLS)', () => {
    exp(A, G, { amount: 100, payer: A, parts: [A, B] });
    assert.ok(Number(db.scalar(`select count(*) from public.expenses`, A)) >= 1);
    assert.equal(db.scalar(`select count(*) from public.expenses where group_id='${G}'`, D), '0');
    assert.equal(db.scalar(`select count(*) from public.expense_splits where group_id='${G}'`, D), '0');
    assert.equal(db.scalar(`select count(*) from public.payments where group_id='${G}'`, D), '0');
    assert.equal(db.scalar(`select count(*) from public.audit_logs where group_id='${G}'`, D), '0');
    assert.equal(db.scalar(`select count(*) from public.group_members where group_id='${G}'`, D), '0');
    assert.match(db.fails(`insert into public.expenses (group_id) values ('${G}')`, A), /permission denied/);
    assert.match(db.fails(`update public.group_members set role='owner' where user_id='${C}'`, C), /permission denied/);
    assert.match(db.fails(`delete from public.audit_logs`, A), /permission denied/);
    assert.match(db.fails(`update public.audit_logs set action='x'`, A), /permission denied/);
    assert.match(db.fails(`select * from public.rate_limits`, A), /permission denied/);
    assert.match(db.fails(`select * from public.push_tokens`, A), /permission denied/);
    assert.match(db.fails(`update public.groups set status='archived' where id='${G}'`, A), /permission denied/);
  });

  it('anon cannot execute any function; internal helpers are not callable by clients', () => {
    const anonFns = db.run(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and has_function_privilege('anon', p.oid, 'execute')`);
    assert.equal(anonFns, '');
    const internal = db.run(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and (p.proname like 'kh\\_%' or p.proname in ('write_group_audit_log','handle_new_user','set_updated_at',
        'enforce_expense_members','enforce_split_member','block_hard_delete','block_row_update','guard_expense_update','check_expense_split_sum',
        'enforce_payment_members','guard_payment_update','validate_profile_row','validate_group_row'))
      and has_function_privilege('authenticated', p.oid, 'execute')`);
    assert.equal(internal, '');
    assert.match(db.fails(`select public.kh_notify('${A}', null, 'x', '{}', null)`, A), /permission denied/);
    assert.equal(db.fails(`select public.get_my_profile()`, 'anon'), 'permission denied for function get_my_profile');
  });

  it('SECURITY DEFINER functions all pin an empty search_path', () => {
    const bad = db.run(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c = 'search_path=""')`);
    assert.equal(bad, '');
  });

  it('RLS is enabled on every public table', () => {
    assert.equal(db.run(`select tablename from pg_tables where schemaname='public' and not rowsecurity`), '');
  });
});

describe('Split engine', () => {
  const splits = (mode: string, amount: number, parts: Array<string | [string, number]>) => {
    const key = mode === 'amount' ? 'amount_paise' : mode === 'percent' ? 'percent_bps' : null;
    return db.json<any[]>(`select jsonb_agg(jsonb_build_object('u', user_id, 's', share_paise) order by user_id) from public.compute_splits('${mode}', ${amount}, ${participants(parts, key)})`, A);
  };
  it('equal split: INR 100 among 3 = 3334/3333/3333 with deterministic remainder', () => {
    const r = splits('equal', 10000, [C, A, B]);
    assert.deepEqual(r.map((x) => x.s), [3334, 3333, 3333]);
    assert.equal(r[0].u, A);
  });
  it('custom amounts must sum exactly', () => {
    assert.deepEqual(splits('amount', 1000, [[A, 250], [B, 750]]).map((x) => x.s), [250, 750]);
    assert.equal(db.fails(`select * from public.compute_splits('amount', 1000, ${participants([[A, 250], [B, 749]], 'amount_paise')})`, A), 'SPLIT_SUM_MISMATCH');
    assert.equal(db.fails(`select * from public.compute_splits('amount', 1000, '[{"user_id":"${A}","amount_paise":-5},{"user_id":"${B}","amount_paise":1005}]'::jsonb)`, A), 'INVALID_SPLIT');
    assert.equal(db.fails(`select * from public.compute_splits('amount', 1000, '[{"user_id":"${A}","amount_paise":500.5},{"user_id":"${B}","amount_paise":499.5}]'::jsonb)`, A), 'INVALID_SPLIT');
  });
  it('percentages must total exactly 100.00% and use largest-remainder rounding', () => {
    assert.equal(db.fails(`select * from public.compute_splits('percent', 1000, ${participants([[A, 5000], [B, 4999]], 'percent_bps')})`, A), 'PERCENT_SUM_INVALID');
    // 100 paise in thirds: 33.34 / 33.33 / 33.33 %
    const r = splits('percent', 100, [[A, 3334], [B, 3333], [C, 3333]]);
    assert.equal(r.reduce((s, x) => s + x.s, 0), 100);
    // 1 paise split 50/50: the tie goes to the lowest user id
    assert.deepEqual(splits('percent', 1, [[B, 5000], [A, 5000]]).map((x) => x.s), [1, 0]);
  });
  it('rejects duplicates, empty lists and bad amounts', () => {
    assert.equal(db.fails(`select * from public.compute_splits('equal', 100, ${participants([A, A])})`, A), 'DUPLICATE_PARTICIPANT');
    assert.equal(db.fails(`select * from public.compute_splits('equal', 100, '[]'::jsonb)`, A), 'NO_PARTICIPANTS');
    assert.equal(db.fails(`select * from public.compute_splits('equal', 0, ${participants([A])})`, A), 'INVALID_AMOUNT');
    assert.equal(db.fails(`select * from public.compute_splits('equal', 10000000001, ${participants([A])})`, A), 'INVALID_AMOUNT');
    assert.equal(db.fails(`select * from public.compute_splits('weird', 100, ${participants([A])})`, A), 'INVALID_SPLIT_MODE');
  });
  it('property test: shares always sum to the amount (all modes, 400 random cases)', () => {
    const out = db.scalar(`
      with cases as (
        select g as n, (1 + (random()*9)::int) as k, (1 + (random()*99999999)::bigint) as amt from generate_series(1, 400) g
      ), parts as (
        select c.n, c.amt, c.k, row_number() over (partition by c.n) as i
        from cases c, lateral generate_series(1, c.k)
      ), eq as (
        select p.n, p.amt, jsonb_agg(jsonb_build_object('user_id', gen_random_uuid())) as j from parts p group by p.n, p.amt
      ), res as (
        select e.n, e.amt, (select sum(share_paise) from public.compute_splits('equal', e.amt, e.j)) as s,
               (select max(share_paise) - min(share_paise) from public.compute_splits('equal', e.amt, e.j)) as spread from eq e
      )
      select count(*) filter (where s <> amt or spread > 1) from res`, A);
    assert.equal(out, '0');
    const pct = db.scalar(`
      with cases as (select g as n, (1 + (random()*99999999)::bigint) as amt, (1 + (random()*9998)::int) as a from generate_series(1,400) g),
      res as (select c.n, c.amt, (select sum(share_paise) from public.compute_splits('percent', c.amt,
         jsonb_build_array(jsonb_build_object('user_id','${A}','percent_bps',c.a), jsonb_build_object('user_id','${B}','percent_bps',10000 - c.a)))) as s from cases c)
      select count(*) filter (where s <> amt) from res`, A);
    assert.equal(pct, '0');
  });
});

describe('Expenses', () => {
  it('creates an expense with an immutable snapshot of splits', () => {
    const id = exp(A, G, { amount: 10000, payer: A, parts: [A, B, C], title: 'Rice' });
    const d = db.rpc<any>(C, 'get_expense', `'${id}'`);
    assert.equal(d.expense.version, 1);
    assert.deepEqual(d.splits.map((s: any) => s.share_paise), [3334, 3333, 3333]);
    assert.match(d.expense.paid_by_name, /^Asha/);
  });

  it('validates payer, participants, group and archived state', () => {
    assert.equal(db.rpcFails(A, 'create_expense', `'${G}', '${uid()}', 'x', 100, 'rent', now(), '${D}', 'equal', ${participants([A])}`), 'PAYER_NOT_MEMBER');
    assert.equal(db.rpcFails(A, 'create_expense', `'${G}', '${uid()}', 'x', 100, 'rent', now(), '${A}', 'equal', ${participants([A, D])}`), 'PARTICIPANT_NOT_MEMBER');
    assert.equal(db.rpcFails(A, 'create_expense', `'${G}', '${uid()}', 'x', 100, 'nope', now(), '${A}', 'equal', ${participants([A])}`), 'INVALID_CATEGORY');
    assert.equal(db.rpcFails(A, 'create_expense', `'${G}', '${uid()}', '', 100, 'rent', now(), '${A}', 'equal', ${participants([A])}`), 'INVALID_TITLE');
    assert.equal(db.rpcFails(A, 'create_expense', `'${G}', '${uid()}', 'x', 100, 'rent', now() + interval '5 days', '${A}', 'equal', ${participants([A])}`), 'INVALID_DATE');
    assert.equal(db.rpcFails(A, 'create_expense', `'${G}', null, 'x', 100, 'rent', now(), '${A}', 'equal', ${participants([A])}`), 'IDEMPOTENCY_KEY_REQUIRED');
    // cross-group: a member of G2 only cannot be used in G
    assert.equal(db.rpcFails(A, 'create_expense', `'${G}', '${uid()}', 'x', 100, 'rent', now(), '${A}', 'equal', ${participants([A, D])}`), 'PARTICIPANT_NOT_MEMBER');
    const g = mkGroup(A, 'Arch');
    join(B, g, A);
    db.rpc(A, 'archive_group', `'${g}'`);
    assert.equal(db.rpcFails(A, 'create_expense', `'${g}', '${uid()}', 'x', 100, 'rent', now(), '${A}', 'equal', ${participants([A])}`), 'GROUP_ARCHIVED');
    assert.equal(db.rpcFails(A, 'record_payment', `'${g}', '${uid()}', '${A}', '${B}', 100, 'cash', now()`), 'GROUP_ARCHIVED');
  });

  it('is idempotent: same key returns the same expense, also under concurrency', async () => {
    const key = uid();
    const a = exp(A, G, { amount: 500, payer: A, parts: [A, B], key });
    const b = exp(A, G, { amount: 500, payer: A, parts: [A, B], key });
    assert.equal(a, b);
    assert.equal(db.scalar(`select count(*) from public.expenses where idempotency_key='${key}'`), '1');
    const key2 = uid();
    const sql = `select public.create_expense('${G}', '${key2}', 'Dup', 700, 'food', now(), '${A}', 'equal', ${participants([A, B])})`;
    const rs = await Promise.all([db.runAsync(sql, A), db.runAsync(sql, A), db.runAsync(sql, A)]);
    assert.ok(rs.every((r) => r.ok), JSON.stringify(rs));
    assert.equal(new Set(rs.map((r) => r.out)).size, 1);
    assert.equal(db.scalar(`select count(*) from public.expenses where idempotency_key='${key2}'`), '1');
    assert.equal(db.scalar(`select count(*) from public.expense_splits s join public.expenses e on e.id=s.expense_id where e.idempotency_key='${key2}'`), '2');
  });

  it('edit requires a reason, detects conflicts, keeps history and old split rows', () => {
    const id = exp(B, G, { amount: 3000, payer: B, parts: [A, B, C], title: 'Gas' });
    const args = (ver: number, reason: string, amount = 6000) =>
      `'${id}', ${ver}, ${sq(reason)}, 'Gas refill', ${amount}, 'gas', now(), '${B}', 'equal', ${participants([A, B, C])}`;
    assert.equal(db.rpcFails(C, 'edit_expense', args(1, 'fix amount')), 'EDIT_NOT_ALLOWED');
    assert.equal(db.rpcFails(B, 'edit_expense', args(1, '')), 'REASON_REQUIRED');
    assert.equal(db.rpcFails(B, 'edit_expense', args(7, 'fix amount')), 'VERSION_CONFLICT');
    assert.equal(db.rpc(B, 'edit_expense', args(1, 'Amount was wrong')), 2);
    assert.equal(db.rpcFails(B, 'edit_expense', args(1, 'again with stale version')), 'VERSION_CONFLICT');
    // an admin who did not create it may edit too
    assert.equal(db.rpc(A, 'edit_expense', args(2, 'Admin correction', 6600)), 3);
    const d = db.rpc<any>(A, 'get_expense', `'${id}'`);
    assert.equal(d.expense.version, 3);
    assert.equal(d.expense.amount_paise, 6600);
    assert.equal(d.revisions.length, 2);
    assert.equal(d.revisions[1].reason, 'Amount was wrong');
    assert.equal(d.revisions[1].snapshot.amount_paise, 3000);
    // old split versions are still stored
    assert.equal(db.scalar(`select count(*) from public.expense_splits where expense_id='${id}'`), '9');
    assert.equal(db.scalar(`select count(*) from public.audit_logs where entity_id='${id}' and action='expense.edited'`), '2');
  });

  it('concurrent edits: exactly one wins, the other gets VERSION_CONFLICT', async () => {
    const id = exp(A, G, { amount: 1000, payer: A, parts: [A, B] });
    const mk = (t: string) => `select public.edit_expense('${id}', 1, 'concurrent test', '${t}', 2000, 'food', now(), '${A}', 'equal', ${participants([A, B])})`;
    const [x, y] = await Promise.all([db.runAsync(mk('one'), A), db.runAsync(mk('two'), A)]);
    assert.equal([x, y].filter((r) => r.ok).length, 1);
    assert.ok([x, y].some((r) => r.err === 'VERSION_CONFLICT'));
  });

  it('void needs a reason, is audited, excluded from balances and cannot be edited', () => {
    const before = balances(A, G);
    const id = exp(A, G, { amount: 9000, payer: A, parts: [A, B, C] });
    assert.equal(db.rpcFails(C, 'void_expense', `'${id}', 1, 'mistake here'`), 'EDIT_NOT_ALLOWED');
    assert.equal(db.rpcFails(A, 'void_expense', `'${id}', 1, ''`), 'REASON_REQUIRED');
    db.rpc(A, 'void_expense', `'${id}', 1, 'Entered twice'`);
    assert.equal(db.rpcFails(A, 'void_expense', `'${id}', 1, 'again'`), 'EXPENSE_VOIDED');
    assert.equal(db.rpcFails(A, 'edit_expense', `'${id}', 1, 'reason', 'x', 100, 'food', now(), '${A}', 'equal', ${participants([A])}`), 'EXPENSE_VOIDED');
    const after = balances(A, G);
    assert.equal(after[A].net_paise, before[A].net_paise);
    const d = db.rpc<any>(A, 'get_expense', `'${id}'`);
    assert.equal(d.expense.status, 'voided');
    assert.equal(d.expense.void_reason, 'Entered twice');
    assert.equal(d.revisions[0].change_type, 'void');
    assert.equal(db.scalar(`select count(*) from public.audit_logs where entity_id='${id}' and action='expense.voided'`), '1');
  });

  it('financial rows can never be hard-deleted or rewritten (even by an admin)', () => {
    const id = exp(A, G, { amount: 1000, payer: A, parts: [A, B] });
    assert.equal(db.fails(`delete from public.expenses where id='${id}'`), 'HARD_DELETE_FORBIDDEN');
    assert.equal(db.fails(`delete from public.expense_splits where expense_id='${id}'`), 'HARD_DELETE_FORBIDDEN');
    assert.equal(db.fails(`update public.expense_splits set share_paise = 1 where expense_id='${id}'`), 'IMMUTABLE_RECORD');
    assert.equal(db.fails(`update public.expenses set amount_paise = 999 where id='${id}'`), 'VERSION_CONFLICT');
    assert.equal(db.fails(`delete from public.expense_revisions`), 'HARD_DELETE_FORBIDDEN');
  });

  it('commit-time constraint: split rows must sum to the amount', () => {
    const k = uid();
    const err = db.fails(`
      insert into public.expenses (id, group_id, title, amount_paise, category_key, spent_at, paid_by, split_mode, idempotency_key, created_by)
      values ('${uid()}', '${G}', 'bad', 1000, 'food', now(), '${A}', 'amount', '${k}', '${A}')`);
    assert.equal(err, 'NO_PARTICIPANTS');
    const id = uid();
    const err2 = db.fails(`
      begin;
      insert into public.expenses (id, group_id, title, amount_paise, category_key, spent_at, paid_by, split_mode, idempotency_key, created_by)
      values ('${id}', '${G}', 'bad', 1000, 'food', now(), '${A}', 'amount', '${uid()}', '${A}');
      insert into public.expense_splits (expense_id, group_id, version, user_id, share_paise) values ('${id}', '${G}', 1, '${A}', 999);
      commit`);
    assert.equal(err2, 'SPLIT_SUM_MISMATCH');
    // cross-group participant cannot be injected even with direct SQL
    const id3 = uid();
    const err3 = db.fails(`
      begin;
      insert into public.expenses (id, group_id, title, amount_paise, category_key, spent_at, paid_by, split_mode, idempotency_key, created_by)
      values ('${id3}', '${G}', 'bad', 1000, 'food', now(), '${A}', 'amount', '${uid()}', '${A}');
      insert into public.expense_splits (expense_id, group_id, version, user_id, share_paise) values ('${id3}', '${G}', 1, '${D}', 1000);
      commit`);
    assert.equal(err3, 'PARTICIPANT_NOT_MEMBER');
  });

  it('list_expenses paginates by keyset, filters and searches', () => {
    const g = mkGroup(A, 'Paging');
    for (let i = 0; i < 7; i++) {
      exp(A, g, { amount: 100 + i, payer: A, parts: [A], title: i % 2 ? 'Milk run' : 'Veg', at: `now() - interval '${i} hours'`, cat: i % 2 ? 'food' : 'grocery' });
    }
    const p1 = db.rpc<any>(A, 'list_expenses', `'${g}', 3`);
    assert.equal(p1.items.length, 3);
    assert.ok(p1.next);
    const p2 = db.rpc<any>(A, 'list_expenses', `'${g}', 3, '${p1.next.ts}', '${p1.next.id}'`);
    const p3 = db.rpc<any>(A, 'list_expenses', `'${g}', 3, '${p2.next.ts}', '${p2.next.id}'`);
    assert.equal(p3.items.length, 1);
    assert.equal(p3.next, null);
    const ids = [...p1.items, ...p2.items, ...p3.items].map((x: any) => x.id);
    assert.equal(new Set(ids).size, 7);
    assert.equal(db.rpc<any>(A, 'list_expenses', `'${g}', 30, null, null, 'milk'`).items.length, 3);
    assert.equal(db.rpc<any>(A, 'list_expenses', `'${g}', 30, null, null, null, 'grocery'`).items.length, 4);
    assert.equal(db.rpc<any>(A, 'list_expenses', `'${g}', 30, null, null, '%'`).items.length, 0);
  });

  it('receipts: path, type, size and permissions are validated server-side', () => {
    const id = exp(B, G, { amount: 800, payer: B, parts: [A, B] });
    const ok = `'${G}/${id}/r1.jpg', 'r1.jpg', 'image/jpeg', 1000`;
    assert.equal(db.rpcFails(C, 'add_expense_receipt', `'${id}', ${ok}`), 'EDIT_NOT_ALLOWED');
    assert.equal(db.rpcFails(B, 'add_expense_receipt', `'${id}', '${G2}/${id}/x.jpg', 'x.jpg', 'image/jpeg', 1000`), 'INVALID_RECEIPT_PATH');
    assert.equal(db.rpcFails(B, 'add_expense_receipt', `'${id}', '${G}/${id}/x.exe', 'x.exe', 'application/x-msdownload', 1000`), 'INVALID_FILE_TYPE');
    assert.equal(db.rpcFails(B, 'add_expense_receipt', `'${id}', '${G}/${id}/x.jpg', 'x.jpg', 'image/jpeg', 6000000`), 'FILE_TOO_LARGE');
    const rid = db.rpc<string>(B, 'add_expense_receipt', `'${id}', ${ok}`);
    assert.equal(db.rpc<any>(A, 'get_expense', `'${id}'`).receipts.length, 1);
    db.rpc(B, 'remove_expense_receipt', `'${rid}'`);
    assert.equal(db.rpc<any>(A, 'get_expense', `'${id}'`).receipts.length, 0);
    assert.equal(db.fails(`delete from public.expense_receipts`), 'HARD_DELETE_FORBIDDEN');
  });

  it('storage policies: receipts readable only by active members of the group folder', () => {
    const id = exp(B, G, { amount: 800, payer: B, parts: [A, B] });
    db.run(`insert into storage.objects (bucket_id, name) values ('receipts', '${G}/${id}/seed.jpg')`);
    assert.equal(db.scalar(`select count(*) from storage.objects where bucket_id='receipts' and name like '${G}/%'`, A), '1');
    assert.equal(db.scalar(`select count(*) from storage.objects where bucket_id='receipts' and name like '${G}/%'`, D), '0');
    db.run(`insert into storage.objects (bucket_id, name) values ('receipts', '${G}/${id}/c.jpg')`, C);
    assert.match(db.fails(`insert into storage.objects (bucket_id, name) values ('receipts', '${G}/${id}/d.jpg')`, D), /row-level security/);
    assert.match(db.fails(`insert into storage.objects (bucket_id, name) values ('receipts', '${G2}/${id}/d.jpg')`, A), /row-level security/);
    db.run(`delete from storage.objects where bucket_id='receipts'`, A); // no delete policy: removes nothing
    assert.equal(db.scalar(`select count(*) from storage.objects where bucket_id='receipts' and name like '${G}/%'`, A), '2');
    assert.match(db.fails(`insert into storage.objects (bucket_id, name) values ('avatars', '${B}/a.png')`, A), /row-level security/);
    db.run(`insert into storage.objects (bucket_id, name) values ('avatars', '${A}/a.png')`, A);
  });
});

describe('Ledger, payments and balances', () => {
  let g: string;
  before(() => {
    g = mkGroup(A, 'Money');
    join(B, g, A); join(C, g, A);
  });

  it('formula: paid - share + settlements paid out - settlements received; nets always sum to 0', () => {
    exp(A, g, { amount: 30000, payer: A, parts: [A, B, C] });
    let b = balances(B, g);
    assert.equal(b[A].net_paise, 20000);
    assert.equal(b[B].net_paise, -10000);
    assert.equal(b[C].net_paise, -10000);
    assert.equal(Object.values(b).reduce((s: number, x: any) => s + x.net_paise, 0), 0);

    // B says "I paid A 100": pending -> balances unchanged
    const p = pay(B, g, B, A, 10000);
    b = balances(B, g);
    assert.equal(b[B].net_paise, -10000);
    // only the receiver (A) may confirm
    assert.equal(db.rpcFails(B, 'update_payment_status', `'${p}', 'confirm'`), 'PAYMENT_ACTION_NOT_ALLOWED');
    assert.equal(db.rpcFails(C, 'update_payment_status', `'${p}', 'confirm'`), 'PAYMENT_ACTION_NOT_ALLOWED');
    db.rpc(A, 'update_payment_status', `'${p}', 'confirm'`);
    b = balances(B, g);
    assert.equal(b[B].net_paise, 0, 'a full settlement brings the debtor to zero');
    assert.equal(b[A].net_paise, 10000);
    assert.equal(db.rpcFails(A, 'update_payment_status', `'${p}', 'confirm'`), 'PAYMENT_NOT_PENDING');
  });

  it('partial settlement; reject / cancel never change balances; reversal undoes confirmed payments', () => {
    const before = balances(A, g);
    const p1 = pay(C, g, C, A, 4000);
    db.rpc(A, 'update_payment_status', `'${p1}', 'confirm'`);
    let b = balances(A, g);
    assert.equal(b[C].net_paise, before[C].net_paise + 4000);

    const p2 = pay(C, g, C, A, 3000);
    assert.equal(db.rpcFails(A, 'update_payment_status', `'${p2}', 'reject', ''`), 'REASON_REQUIRED');
    db.rpc(A, 'update_payment_status', `'${p2}', 'reject', 'Not received'`);
    const p3 = pay(C, g, C, A, 2000);
    assert.equal(db.rpcFails(B, 'update_payment_status', `'${p3}', 'cancel'`), 'PAYMENT_ACTION_NOT_ALLOWED');
    db.rpc(C, 'update_payment_status', `'${p3}', 'cancel'`);
    assert.deepEqual(balances(A, g)[C].net_paise, b[C].net_paise);

    assert.equal(db.rpcFails(C, 'update_payment_status', `'${p1}', 'reverse', 'oops sorry'`), 'PAYMENT_ACTION_NOT_ALLOWED');
    assert.equal(db.rpcFails(A, 'update_payment_status', `'${p1}', 'reverse'`), 'REASON_REQUIRED');
    db.rpc(A, 'update_payment_status', `'${p1}', 'reverse', 'Entered wrong amount'`);
    assert.equal(balances(A, g)[C].net_paise, before[C].net_paise);
    assert.equal(db.rpcFails(A, 'update_payment_status', `'${p1}', 'reverse', 'twice again'`), 'PAYMENT_NOT_CONFIRMED');
    assert.equal(db.fails(`update public.payments set status='pending' where id='${p1}'`), 'INVALID_PAYMENT_TRANSITION');
    assert.equal(db.fails(`update public.payments set amount_paise=1 where id='${p1}'`), 'IMMUTABLE_RECORD');
    assert.equal(db.fails(`delete from public.payments`), 'HARD_DELETE_FORBIDDEN');
    const list = db.rpc<any>(A, 'list_payments', `'${g}', 50`);
    assert.deepEqual(new Set(list.items.map((x: any) => x.status)), new Set(['confirmed', 'rejected', 'cancelled', 'reversed']));
  });

  it('payment parties: third members cannot record; receiver-recorded is auto-confirmed; non-members rejected', () => {
    assert.equal(db.rpcFails(C, 'record_payment', `'${g}', '${uid()}', '${A}', '${B}', 100, 'cash', now()`), 'PAYMENT_ACTION_NOT_ALLOWED');
    assert.equal(db.rpcFails(A, 'record_payment', `'${g}', '${uid()}', '${A}', '${D}', 100, 'cash', now()`), 'PAYMENT_PARTY_NOT_MEMBER');
    assert.equal(db.rpcFails(A, 'record_payment', `'${g}', '${uid()}', '${A}', '${A}', 100, 'cash', now()`), 'INVALID_PAYMENT_PARTIES');
    assert.equal(db.rpcFails(A, 'record_payment', `'${g}', '${uid()}', '${B}', '${A}', 0, 'cash', now()`), 'INVALID_AMOUNT');
    assert.equal(db.rpcFails(A, 'record_payment', `'${g}', '${uid()}', '${B}', '${A}', 100, 'bitcoin', now()`), 'INVALID_METHOD');
    const before = balances(A, g);
    const id = pay(A, g, B, A, 500); // A records "B paid me"
    assert.equal(db.scalar(`select status from public.payments where id='${id}'`), 'confirmed');
    assert.equal(balances(A, g)[B].net_paise, before[B].net_paise + 500);
    // idempotent
    const key = uid();
    const a1 = db.rpc(B, 'record_payment', `'${g}', '${key}', '${B}', '${C}', 100, 'upi', now(), 'UTR1', null`);
    const a2 = db.rpc(B, 'record_payment', `'${g}', '${key}', '${B}', '${C}', 100, 'upi', now(), 'UTR1', null`);
    assert.equal(a1, a2);
  });

  it('transfers are not expenses: report totals ignore payments', () => {
    const month = db.scalar(`select to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-01')`);
    const r = db.rpc<any>(A, 'get_group_report', `'${g}', '${month}'`);
    assert.equal(r.total_paise, 30000);
    assert.equal(r.expense_count, 1);
  });

  it('member ledger lists expenses and payments with signed effects', () => {
    const l = db.rpc<any>(B, 'get_member_ledger', `'${g}', '${B}', 50, 0`);
    assert.equal(l.summary.user_id, B);
    const eff = l.entries.filter((e: any) => e.status !== 'rejected' && e.status !== 'cancelled').reduce((s: number, e: any) => s + e.effect_paise, 0);
    assert.equal(eff, l.summary.net_paise);
    assert.ok(l.entries.some((e: any) => e.kind === 'expense'));
    assert.ok(l.entries.some((e: any) => e.kind === 'payment_out'));
    assert.equal(db.rpcFails(B, 'get_member_ledger', `'${g}', '${D}'`), 'NOT_A_MEMBER');
  });

  it('month filter differs from lifetime and follows the group timezone', () => {
    const g2 = mkGroup(A, 'Months');
    join(B, g2, A);
    // 2026-09-30 19:00 UTC == 2026-10-01 00:30 in Asia/Kolkata -> belongs to OCTOBER for this group
    exp(A, g2, { amount: 10000, payer: A, parts: [A, B], at: `'2026-09-30T19:00:00Z'::timestamptz`, title: 'Boundary' });
    exp(A, g2, { amount: 20000, payer: A, parts: [A, B], at: `'2026-09-15T10:00:00Z'::timestamptz`, title: 'Sept' });
    const oct = db.rpc<any>(A, 'get_group_report', `'${g2}', '2026-10-15'`);
    const sep = db.rpc<any>(A, 'get_group_report', `'${g2}', '2026-09-01'`);
    assert.equal(oct.total_paise, 10000);
    assert.equal(sep.total_paise, 20000);
    assert.equal(oct.monthly_totals.length, 6);
    assert.deepEqual(oct.monthly_totals.slice(-2).map((m: any) => [m.month, m.total_paise]), [['2026-09', 20000], ['2026-10', 10000]]);
    const life = balances(A, g2);
    assert.equal(life[A].net_paise, 15000);
    const octBal = balances(A, g2, `'2026-09-30T18:30:00Z', '2026-10-31T18:30:00Z'`);
    assert.equal(octBal[A].net_paise, 5000);
    db.run(`update public.groups set timezone='America/New_York' where id='${g2}'`);
    assert.equal(db.rpc<any>(A, 'get_group_report', `'${g2}', '2026-10-15'`).total_paise, 0);
    assert.equal(db.rpc<any>(A, 'get_group_report', `'${g2}', '2026-09-15'`).total_paise, 30000);
  });

  it('old shares never change when members leave; leavers stay in the ledger; new expenses exclude them', () => {
    const g3 = mkGroup(A, 'Leavers');
    join(B, g3, A); join(C, g3, A);
    const id = exp(A, g3, { amount: 9000, payer: A, parts: [A, B, C] });
    db.rpc(C, 'leave_group', `'${g3}'`);
    const d = db.rpc<any>(A, 'get_expense', `'${id}'`);
    assert.deepEqual(d.splits.map((s: any) => s.share_paise), [3000, 3000, 3000]);
    const b = balances(A, g3);
    assert.equal(b[C].net_paise, -3000);
    assert.equal(b[C].status, 'left');
    assert.equal(db.rpcFails(A, 'create_expense', `'${g3}', '${uid()}', 'x', 100, 'food', now(), '${A}', 'equal', ${participants([A, C])}`), 'PARTICIPANT_NOT_MEMBER');
    // existing participants who left remain valid when correcting the old expense
    assert.equal(db.rpc(A, 'edit_expense', `'${id}', 1, 'Fix title only', 'Fixed', 9000, 'food', now(), '${A}', 'equal', ${participants([A, B, C])}`), 2);
    // settling with a departed member: an admin records it, receiver has left -> admin can confirm
    const p = db.rpc<string>(A, 'record_payment', `'${g3}', '${uid()}', '${C}', '${A}', 3000, 'cash', now()`);
    assert.equal(db.scalar(`select status from public.payments where id='${p}'`), 'confirmed');
    assert.equal(balances(A, g3)[C].net_paise, 0);
  });

  it('reminders only target debtors and are rate limited', () => {
    assert.equal(db.rpcFails(A, 'send_payment_reminder', `'${g}', '${A}'`), 'INVALID_PAYMENT_PARTIES');
    const nets = balances(A, g);
    const debtor = [B, C].find((u) => nets[u].net_paise < 0)!;
    const creditor = [A, B, C].find((u) => nets[u].net_paise > 0)!;
    assert.equal(db.rpcFails(A, 'send_payment_reminder', `'${g}', '${creditor}'`.replace(`'${creditor}'`, `'${creditor}'`)), creditor === A ? 'INVALID_PAYMENT_PARTIES' : 'NOTHING_TO_REMIND');
    db.rpc(A, 'send_payment_reminder', `'${g}', '${debtor}'`);
    assert.equal(db.rpcFails(A, 'send_payment_reminder', `'${g}', '${debtor}'`), 'RATE_LIMITED');
    const n = db.rpc<any>(debtor, 'list_notifications');
    assert.ok(n.items.some((x: any) => x.type === 'payment_reminder'));
  });
});

describe('Budgets, notifications, activity, utilities', () => {
  it('budget alerts fire once per level per month and only for admins', () => {
    const g = mkGroup(A, 'Budget');
    join(B, g, A);
    assert.equal(db.rpcFails(B, 'set_group_budget', `'${g}', null, 100000`), 'ADMIN_REQUIRED');
    db.rpc(A, 'set_group_budget', `'${g}', null, 100000`);
    exp(A, g, { amount: 85000, payer: A, parts: [A, B] });
    exp(A, g, { amount: 1000, payer: A, parts: [A, B] });
    const n80 = db.rpc<any>(A, 'list_notifications').items.filter((x: any) => x.type === 'budget_alert' && x.params.level === 80);
    assert.equal(n80.length, 1);
    exp(A, g, { amount: 20000, payer: A, parts: [A, B] });
    assert.equal(db.rpc<any>(A, 'list_notifications').items.filter((x: any) => x.type === 'budget_alert' && x.params.level === 100).length, 1);
    assert.equal(db.rpc<any>(B, 'list_notifications').items.filter((x: any) => x.type === 'budget_alert').length, 0);
    assert.equal(db.rpc<any>(A, 'list_group_budgets', `'${g}'`).length, 1);
    db.rpc(A, 'set_group_budget', `'${g}', null, 0`);
    assert.equal(db.rpc<any>(A, 'list_group_budgets', `'${g}'`).length, 0);
  });

  it('notifications: delivered to participants, readable only by owner, can be marked read', () => {
    const g = mkGroup(A, 'Notify');
    join(B, g, A);
    exp(A, g, { amount: 2000, payer: A, parts: [A, B], title: 'Soap' });
    const n = db.rpc<any>(B, 'list_notifications');
    assert.ok(n.unread_count >= 1);
    assert.ok(n.items.some((x: any) => x.type === 'expense_added' && x.params.title === 'Soap'));
    assert.equal(db.scalar(`select count(*) from public.notifications where user_id='${B}'`, A), '0');
    db.rpc(B, 'mark_notifications_read');
    assert.equal(db.rpc<any>(B, 'list_notifications').unread_count, 0);
    db.rpc(B, 'register_push_token', `'ExponentPushToken[abcdefghijk]', 'android'`);
    db.rpc(B, 'unregister_push_token', `'ExponentPushToken[abcdefghijk]'`);
  });

  it('audit trail records who changed what for roles and membership', () => {
    const act = db.rpc<any>(A, 'list_group_activity', `'${G}', 100, null`);
    assert.ok(act.items.length > 5);
    const roleChange = act.items.find((i: any) => i.entity_type === 'group_members' && i.metadata.changes?.role);
    assert.ok(roleChange, 'role changes carry old/new values');
    assert.ok(act.items.some((i: any) => i.action === 'invitation.created'));
    assert.ok(!JSON.stringify(act).includes('token_hash'));
  });

  it('shopping list: any member can add and tick, only adder/admin removes', () => {
    const g = mkGroup(A, 'Shop');
    join(B, g, A); join(C, g, A);
    const i1 = db.rpc<string>(B, 'add_shopping_item', `'${g}', 'Milk', '2 L'`);
    db.rpc(C, 'add_shopping_item', `'${g}', 'Rice', null`);
    db.rpc(C, 'set_shopping_item_status', `'${i1}', true`);
    assert.equal(db.rpcFails(C, 'remove_shopping_item', `'${i1}'`), 'EDIT_NOT_ALLOWED');
    const list = db.rpc<any>(A, 'get_shopping_list', `'${g}'`);
    assert.equal(list.items.length, 2);
    assert.equal(list.items[0].name, 'Rice');
    assert.equal(list.items[1].bought_by_name, 'Chitra');
    assert.equal(db.rpc(A, 'clear_bought_items', `'${g}'`), 1);
    db.rpc(A, 'remove_shopping_item', `'${list.items[0].id}'`);
    assert.equal(db.rpc<any>(A, 'get_shopping_list', `'${g}'`).items.length, 0);
    assert.equal(db.rpcFails(D, 'add_shopping_item', `'${g}', 'x', null`), 'NOT_A_MEMBER');
  });

  it('notices: members post, only admins pin, author/admin edit and delete', () => {
    const g = mkGroup(A, 'Board');
    join(B, g, A); join(C, g, A);
    assert.equal(db.rpcFails(C, 'create_notice', `'${g}', 'Hi', 'Body', true`), 'ADMIN_REQUIRED');
    const n = db.rpc<string>(C, 'create_notice', `'${g}', 'Wifi password', 'abc123', false`);
    assert.equal(db.rpcFails(B, 'update_notice', `'${n}', 'x', 'y', null`), 'EDIT_NOT_ALLOWED');
    db.rpc(A, 'update_notice', `'${n}', 'Wifi password', 'new123', true`);
    assert.equal(db.rpc<any>(B, 'list_notices', `'${g}'`)[0].pinned, true);
    assert.equal(db.rpcFails(C, 'update_notice', `'${n}', 'Wifi', 'z', false`), 'ADMIN_REQUIRED');
    db.rpc(C, 'delete_notice', `'${n}'`);
    assert.equal(db.rpc<any>(B, 'list_notices', `'${g}'`).length, 0);
    assert.ok(db.rpc<any>(B, 'list_notifications').items.some((x: any) => x.type === 'notice_posted'));
  });

  it('group update validates timezone and archived groups are frozen', () => {
    const g = mkGroup(A, 'Tz');
    assert.equal(db.rpcFails(A, 'update_group', `'${g}', 'Tz2', null, 'Mars/Base'`), 'INVALID_TIMEZONE');
    db.rpc(A, 'update_group', `'${g}', 'Tz2', 'desc', 'Asia/Dubai'`);
    assert.equal(db.rpc<any>(A, 'get_group', `'${g}'`).timezone, 'Asia/Dubai');
    db.rpc(A, 'archive_group', `'${g}'`);
    assert.equal(db.rpcFails(A, 'update_group', `'${g}', 'Tz3', null, null`), 'GROUP_ARCHIVED');
  });
});

describe('Privacy: export and account deletion', () => {
  it('exports the user data', () => {
    const x = db.rpc<any>(B, 'export_my_data');
    assert.equal(x.profile.full_name, 'Bala');
    assert.ok(x.memberships.length >= 1);
    assert.ok(x.my_expense_shares.length >= 1);
  });

  it('the last admin with other members must hand over first; deletion anonymises and keeps ledgers readable', () => {
    const g = mkGroup(E, 'Eshas');
    join(C, g, E);
    exp(C, g, { amount: 4000, payer: C, parts: [C, E] });
    assert.equal(db.rpcFails(E, 'delete_my_account'), 'LAST_ADMIN');
    db.rpc(C, 'delete_my_account');
    assert.equal(db.scalar(`select count(*) from auth.users where id='${C}'`), '0');
    assert.equal(db.scalar(`select full_name from public.profiles where id='${C}'`), 'Deleted user');
    assert.equal(db.scalar(`select count(*) from public.group_members where user_id='${C}' and status='active'`), '0');
    const b = balances(E, g);
    assert.equal(b[C].is_deleted, true);
    assert.equal(b[C].net_paise, 2000);
    const members = db.rpc<any[]>(E, 'list_group_members', `'${g}'`);
    assert.equal(members.find((m) => m.user_id === C).is_deleted, true);
    // sole member can delete: group gets archived
    db.rpc(E, 'delete_my_account');
    assert.equal(db.scalar(`select status from public.groups where id='${g}'`), 'archived');
  });
});

describe('Edit window and statement', () => {
  it('editing works for one hour after adding, then is locked; cancelling still works', () => {
    const g = mkGroup(A, 'Window');
    join(B, g, A);
    const id = exp(B, g, { amount: 3000, payer: B, parts: [A, B], title: 'Chai' });
    const args = (ver: number, amount: number) =>
      `'${id}', ${ver}, 'Correction', 'Chai', ${amount}, 'food', now(), '${B}', 'equal', ${participants([A, B])}`;
    assert.equal(db.rpc(B, 'edit_expense', args(1, 3200)), 2); // inside the window
    // pretend the expense was added 61 minutes ago (bypassing the immutability trigger as superuser)
    db.run(`alter table public.expenses disable trigger trg_expenses_guard;
            update public.expenses set created_at = now() - interval '61 minutes' where id='${id}';
            alter table public.expenses enable trigger trg_expenses_guard`);
    assert.equal(db.rpcFails(B, 'edit_expense', args(2, 3400)), 'EDIT_WINDOW_EXPIRED');
    assert.equal(db.rpcFails(A, 'edit_expense', args(2, 3400)), 'EDIT_WINDOW_EXPIRED', 'admins are locked out as well');
    // just inside the window still works
    db.run(`alter table public.expenses disable trigger trg_expenses_guard;
            update public.expenses set created_at = now() - interval '59 minutes' where id='${id}';
            alter table public.expenses enable trigger trg_expenses_guard`);
    assert.equal(db.rpc(B, 'edit_expense', args(2, 3400)), 3);
    db.run(`alter table public.expenses disable trigger trg_expenses_guard;
            update public.expenses set created_at = now() - interval '5 hours' where id='${id}';
            alter table public.expenses enable trigger trg_expenses_guard`);
    db.rpc(B, 'void_expense', `'${id}', 3, 'Duplicate entry'`); // voiding is not time-limited
    assert.equal(db.scalar(`select status from public.expenses where id='${id}'`), 'voided');
  });

  it('statement: date range in group time zone, who paid for whom, totals, access control', () => {
    const g = mkGroup(A, 'Statement');
    join(B, g, A); join(C, g, A);
    db.run(`update public.groups set timezone='Asia/Kolkata' where id='${g}'`);
    exp(A, g, { amount: 3000, payer: A, parts: [A, B, C], title: 'Rice', at: `'2026-03-31T20:30:00Z'` });   // = 1 Apr 02:00 IST
    exp(B, g, { amount: 1000, payer: B, parts: [A, B], title: 'Milk', at: `'2026-04-15T06:00:00Z'` });
    exp(C, g, { amount: 900, payer: C, parts: [C], title: 'March thing', at: `'2026-03-31T10:00:00Z'` });
    const x = db.rpc<any>(B, 'get_group_statement', `'${g}', '2026-04-01', '2026-04-30'`);
    assert.equal(x.expense_count, 2);
    assert.equal(x.total_paise, 4000);
    assert.deepEqual(x.expenses.map((e: any) => e.title), ['Rice', 'Milk']);
    const rice = x.expenses[0];
    assert.equal(rice.splits.reduce((s: number, p: any) => s + p.share_paise, 0), 3000);
    assert.equal(rice.paid_by, A);
    const m = Object.fromEntries(x.members.map((r: any) => [r.user_id, r]));
    assert.equal(m[A].paid_paise, 3000); assert.equal(m[A].share_paise, 1500);
    assert.equal(m[B].paid_paise, 1000); assert.equal(m[B].share_paise, 1500);
    assert.equal(m[C].paid_paise, 0); assert.equal(m[C].share_paise, 1000);
    const march = db.rpc<any>(B, 'get_group_statement', `'${g}', '2026-03-01', '2026-03-31'`);
    assert.deepEqual(march.expenses.map((e: any) => e.title), ['March thing']);
    // voided expenses are not part of the statement
    const id = exp(A, g, { amount: 500, payer: A, parts: [A], title: 'Oops', at: `'2026-04-20T06:00:00Z'` });
    db.rpc(A, 'void_expense', `'${id}', 1, 'Entered by mistake'`);
    assert.equal(db.rpc<any>(A, 'get_group_statement', `'${g}', '2026-04-01', '2026-04-30'`).expense_count, 2);
    // access / validation
    assert.equal(db.rpcFails(D, 'get_group_statement', `'${g}', '2026-04-01', '2026-04-30'`), 'NOT_A_MEMBER');
    assert.equal(db.rpcFails(A, 'get_group_statement', `'${g}', '2026-04-30', '2026-04-01'`), 'INVALID_DATE_RANGE');
    assert.equal(db.rpcFails(A, 'get_group_statement', `'${g}', '2020-01-01', '2026-04-01'`), 'DATE_RANGE_TOO_LARGE');
    assert.equal(db.rpcFails('anon', 'get_group_statement', `'${g}', '2026-04-01', '2026-04-30'`), 'permission denied for function get_group_statement');
  });
});
