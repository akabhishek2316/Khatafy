import type { SplitMode } from './splits';

export type Role = 'admin' | 'member';
export type MemberStatus = 'active' | 'left' | 'removed';
export type Lang = 'en' | 'hi';

export interface Profile { id: string; full_name: string; phone: string | null; avatar_url: string | null; preferred_language: Lang }

export interface GroupSummary {
  id: string; name: string; description: string | null; status: 'active' | 'archived';
  currency_code: string; timezone: string; role: Role; created_at: string; member_count: number;
}
export interface GroupDetail {
  id: string; name: string; description: string | null; status: 'active' | 'archived';
  currency_code: string; timezone: string; created_at: string; created_by: string; my_role: Role; member_count: number; pending_requests: number;
}
export interface Member {
  user_id: string; full_name: string; avatar_url: string | null; is_deleted: boolean;
  role: Role; status: MemberStatus; joined_at: string; left_at: string | null;
}
export interface JoinRequest { id: string; user_id: string; full_name: string; message: string | null; status: string; created_at: string; reviewed_at: string | null }
export interface MyJoinRequest { id: string; group_id: string; group_name: string; status: 'pending' | 'approved' | 'rejected' | 'cancelled'; message: string | null; created_at: string }
export interface Invitation {
  id: string; created_at: string; expires_at: string | null; max_uses: number | null; uses_count: number;
  revoked_at: string | null; created_by_name: string; state: 'active' | 'expired' | 'revoked' | 'used_up';
}
export interface ActivityItem {
  id: number; action: string; entity_type: string; entity_id: string | null; actor_id: string | null;
  actor_name: string | null; metadata: Record<string, any>; created_at: string;
}
export interface Category { key: string; name_en: string; name_hi: string }

export interface ExpenseListItem {
  id: string; title: string; amount_paise: number; category_key: string; spent_at: string;
  paid_by: string; paid_by_name: string; split_mode: SplitMode; status: 'active' | 'voided'; version: number;
  note: string | null; created_by: string; created_at: string;
  my_share_paise: number | null; participant_count: number; receipt_count: number;
}
export interface Page<T> { items: T[]; next: { ts: string; id: string } | null }
export interface ExpenseDetail {
  expense: {
    id: string; group_id: string; title: string; amount_paise: number; category_key: string; spent_at: string;
    paid_by: string; paid_by_name: string; split_mode: SplitMode; note: string | null; status: 'active' | 'voided';
    version: number; created_by: string; created_by_name: string; created_at: string; updated_at: string;
    void_reason: string | null; voided_at: string | null; voided_by_name: string | null;
  };
  splits: Array<{ user_id: string; full_name: string; share_paise: number; percent_bps: number | null }>;
  receipts: Array<{ id: string; file_name: string; mime_type: string; size_bytes: number; storage_path: string; uploaded_by: string; created_at: string }>;
  revisions: Array<{ id: number; version: number; change_type: 'edit' | 'void'; reason: string; changed_by: string; changed_by_name: string; created_at: string; snapshot: any }>;
}
export type PaymentStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled' | 'reversed';
export type PaymentMethod = 'cash' | 'upi' | 'bank' | 'other';
export interface Payment {
  id: string; from_user: string; from_name: string; to_user: string; to_name: string; amount_paise: number;
  method: PaymentMethod; paid_at: string; reference: string | null; note: string | null; status: PaymentStatus;
  created_by: string; decided_by: string | null; decided_at: string | null; decision_note: string | null;
  reverse_reason: string | null; created_at: string; receiver_active: boolean;
}
export interface LedgerEntry {
  kind: 'expense' | 'payment_out' | 'payment_in'; id: string; title: string; occurred_at: string;
  paid_paise: number; share_paise: number; effect_paise: number; status: string;
  counterparty_id: string | null; counterparty_name: string | null; category_key: string | null;
}
export interface MemberLedger {
  summary: { user_id: string; paid_paise: number; share_paise: number; settlement_paid_paise: number; settlement_received_paise: number; net_paise: number };
  entries: LedgerEntry[]; total: number; has_more: boolean;
}
export interface Report {
  month: string; from: string; to: string; timezone: string; total_paise: number; expense_count: number;
  by_category: Array<{ category_key: string; total_paise: number; count: number }>;
  by_member: Array<{ user_id: string; full_name: string; status: string; paid_paise: number; share_paise: number; net_paise: number }>;
  monthly_totals: Array<{ month: string; total_paise: number }>;
  budgets: Array<{ category_key: string | null; amount_paise: number; spent_paise: number }>;
}
export interface Budget { id: string; category_key: string | null; amount_paise: number }
export interface AppNotification { id: number; group_id: string | null; type: string; params: Record<string, any>; read_at: string | null; created_at: string }
export interface NotificationPage { items: AppNotification[]; unread_count: number; next_before_id: number | null }
export interface ShoppingItem {
  id: string; name: string; quantity: string | null; status: 'needed' | 'bought'; added_by: string; added_by_name: string;
  bought_by: string | null; bought_by_name: string | null; bought_at: string | null; created_at: string;
}
export interface ShoppingList { list_id: string | null; name: string | null; items: ShoppingItem[] }
export interface Notice { id: string; title: string; body: string; pinned: boolean; created_by: string; created_by_name: string; created_at: string; updated_at: string }

export interface ExpenseInput {
  title: string; amountPaise: number; categoryKey: string; spentAt: string; paidBy: string;
  splitMode: SplitMode; participants: Array<{ userId: string; amountPaise?: number; percentBps?: number }>; note?: string | null;
}
export interface PaymentInput {
  fromUser: string; toUser: string; amountPaise: number; method: PaymentMethod; paidAt: string; reference?: string | null; note?: string | null;
}

export interface Statement {
  group_name: string; timezone: string; from: string; to: string; total_paise: number; expense_count: number; truncated: boolean;
  expenses: Array<{
    id: string; title: string; category_key: string; spent_at: string; amount_paise: number; paid_by: string; paid_by_name: string;
    note: string | null; version: number; split_mode: SplitMode; splits: Array<{ user_id: string; full_name: string; share_paise: number }>;
  }>;
  members: Array<{ user_id: string; full_name: string; status: string; paid_paise: number; share_paise: number }>;
  payments: Array<{ id: string; from_user: string; from_name: string; to_user: string; to_name: string; amount_paise: number; paid_at: string; method: PaymentMethod }>;
}

export interface AdminOverview {
  users_total: number; users_7d: number; users_30d: number; groups_total: number; groups_active: number; groups_archived: number;
  expenses_30d: number; payments_30d: number; signups_14d: Array<{ day: string; signups: number }>;
}
export interface AdminGroup { id: string; status: 'active' | 'archived'; created_at: string; members: number; expenses_30d: number }
export interface AdminAuditRow { id: number; action: string; target: string | null; reason: string | null; created_at: string }

export interface CloseSummary {
  from_date: string | null; to_date: string; total_paise: number; expense_count: number; per_head_paise: number;
  members: Array<{ user_id: string; name: string; paid_paise: number; share_paise: number; net_paise: number }>;
  payments: Array<{ from_name: string; to_name: string; amount_paise: number; method: string; paid_at: string }>;
}
export interface PeriodClose {
  id: string; status: 'pending' | 'closed'; period_end: string; requested_at: string; effective_at: string; closed_at: string | null;
  requested_by_name: string; summary: CloseSummary | null; objection_count: number; my_objection: boolean;
  objections: Array<{ name: string; reason: string }>;
}
