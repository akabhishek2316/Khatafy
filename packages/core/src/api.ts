// Typed wrapper over the Supabase RPC surface. Works with ANY client that has `.rpc()`
// (supabase-js in production, a fake in tests), so web and mobile share one implementation.
import { KhError, toKhError } from './errors';
import { toRpcParticipants } from './splits';
import type * as T from './types';

export interface RpcClient {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: any; error: { message: string; code?: string } | null }>;
}

export function createApi(client: RpcClient) {
  async function call<R = void>(name: string, args: Record<string, unknown> = {}): Promise<R> {
    let res;
    try {
      res = await client.rpc(name, args);
    } catch (e) {
      throw toKhError(e);
    }
    if (res.error) throw toKhError(res.error);
    return res.data as R;
  }
  const id = <X>(x: X) => x;
  void id;

  return {
    // ---- profile
    getMyProfile: () => call<T.Profile>('get_my_profile'),
    updateMyProfile: (p: { fullName: string; phone?: string | null; avatarUrl?: string | null; language?: T.Lang }) =>
      call('update_my_profile', { p_full_name: p.fullName, p_phone: p.phone ?? null, p_avatar_url: p.avatarUrl ?? null, p_preferred_language: p.language ?? null }),
    exportMyData: () => call<Record<string, unknown>>('export_my_data'),
    deleteMyAccount: () => call('delete_my_account'),

    // ---- groups
    listMyGroups: () => call<T.GroupSummary[]>('list_my_groups'),
    getGroup: (groupId: string) => call<T.GroupDetail>('get_group', { p_group_id: groupId }),
    createGroup: (name: string, description?: string | null) => call<string>('create_group', { p_name: name, p_description: description ?? null }),
    updateGroup: (groupId: string, name: string, description: string | null, timezone: string | null) =>
      call('update_group', { p_group_id: groupId, p_name: name, p_description: description, p_timezone: timezone }),
    archiveGroup: (groupId: string) => call('archive_group', { p_group_id: groupId }),
    leaveGroup: (groupId: string) => call('leave_group', { p_group_id: groupId }),
    listMembers: (groupId: string) => call<T.Member[]>('list_group_members', { p_group_id: groupId }),
    removeMember: (groupId: string, userId: string) => call('remove_group_member', { p_group_id: groupId, p_user_id: userId }),
    setMemberRole: (groupId: string, userId: string, role: 'admin' | 'member') =>
      call('set_group_member_role', { p_group_id: groupId, p_user_id: userId, p_new_role: role }),
    listActivity: (groupId: string, beforeId?: number | null) =>
      call<{ items: T.ActivityItem[]; next_before_id: number | null }>('list_group_activity', { p_group_id: groupId, p_limit: 40, p_before_id: beforeId ?? null }),

    // ---- invitations & join requests
    createInvitation: (groupId: string, expiresAt: string | null, maxUses: number | null) =>
      call<string>('create_group_invitation', { p_group_id: groupId, p_expires_at: expiresAt, p_max_uses: maxUses }),
    revokeInvitation: (invitationId: string) => call('revoke_group_invitation', { p_invitation_id: invitationId }),
    listInvitations: (groupId: string) => call<T.Invitation[]>('list_group_invitations', { p_group_id: groupId }),
    requestToJoin: (code: string, message?: string | null) => call<string>('request_to_join_group', { p_invitation_code: code, p_message: message ?? null }),
    listJoinRequests: (groupId: string, status: string | null = 'pending') => call<T.JoinRequest[]>('list_join_requests', { p_group_id: groupId, p_status: status }),
    listMyJoinRequests: () => call<T.MyJoinRequest[]>('list_my_join_requests'),
    reviewJoinRequest: (requestId: string, decision: 'approved' | 'rejected') => call('review_join_request', { p_request_id: requestId, p_decision: decision }),
    cancelJoinRequest: (requestId: string) => call('cancel_join_request', { p_request_id: requestId }),

    // ---- expenses
    listCategories: () => call<T.Category[]>('list_expense_categories'),
    listExpenses: (groupId: string, f: { limit?: number; before?: { ts: string; id: string } | null; search?: string; category?: string | null; memberId?: string | null; from?: string | null; to?: string | null; status?: string | null } = {}) =>
      call<T.Page<T.ExpenseListItem>>('list_expenses', {
        p_group_id: groupId, p_limit: f.limit ?? 30, p_before_ts: f.before?.ts ?? null, p_before_id: f.before?.id ?? null,
        p_search: f.search || null, p_category_key: f.category ?? null, p_member_id: f.memberId ?? null,
        p_from: f.from ?? null, p_to: f.to ?? null, p_status: f.status ?? null,
      }),
    getExpense: (expenseId: string) => call<T.ExpenseDetail>('get_expense', { p_expense_id: expenseId }),
    createExpense: (groupId: string, idempotencyKey: string, e: T.ExpenseInput) =>
      call<string>('create_expense', {
        p_group_id: groupId, p_idempotency_key: idempotencyKey, p_title: e.title, p_amount_paise: e.amountPaise,
        p_category_key: e.categoryKey, p_spent_at: e.spentAt, p_paid_by: e.paidBy, p_split_mode: e.splitMode,
        p_participants: toRpcParticipants(e.splitMode, e.participants), p_note: e.note ?? null,
      }),
    editExpense: (expenseId: string, expectedVersion: number, reason: string, e: T.ExpenseInput) =>
      call<number>('edit_expense', {
        p_expense_id: expenseId, p_expected_version: expectedVersion, p_reason: reason, p_title: e.title,
        p_amount_paise: e.amountPaise, p_category_key: e.categoryKey, p_spent_at: e.spentAt, p_paid_by: e.paidBy,
        p_split_mode: e.splitMode, p_participants: toRpcParticipants(e.splitMode, e.participants), p_note: e.note ?? null,
      }),
    voidExpense: (expenseId: string, expectedVersion: number, reason: string) =>
      call('void_expense', { p_expense_id: expenseId, p_expected_version: expectedVersion, p_reason: reason }),
    addReceipt: (expenseId: string, path: string, fileName: string, mime: string, size: number) =>
      call<string>('add_expense_receipt', { p_expense_id: expenseId, p_storage_path: path, p_file_name: fileName, p_mime_type: mime, p_size_bytes: size }),
    removeReceipt: (receiptId: string) => call('remove_expense_receipt', { p_receipt_id: receiptId }),

    // ---- balances, ledger, payments, reports
    getBalances: (groupId: string, from: string | null = null, to: string | null = null) =>
      call<import('./balances').MemberBalance[]>('get_group_balances', { p_group_id: groupId, p_from: from, p_to: to }),
    getMemberLedger: (groupId: string, userId: string, offset = 0, limit = 50) =>
      call<T.MemberLedger>('get_member_ledger', { p_group_id: groupId, p_user_id: userId, p_limit: limit, p_offset: offset, p_from: null, p_to: null }),
    listPayments: (groupId: string, f: { limit?: number; before?: { ts: string; id: string } | null; status?: string | null; memberId?: string | null } = {}) =>
      call<T.Page<T.Payment>>('list_payments', {
        p_group_id: groupId, p_limit: f.limit ?? 30, p_before_ts: f.before?.ts ?? null, p_before_id: f.before?.id ?? null,
        p_status: f.status ?? null, p_member_id: f.memberId ?? null,
      }),
    recordPayment: (groupId: string, idempotencyKey: string, p: T.PaymentInput) =>
      call<string>('record_payment', {
        p_group_id: groupId, p_idempotency_key: idempotencyKey, p_from_user: p.fromUser, p_to_user: p.toUser,
        p_amount_paise: p.amountPaise, p_method: p.method, p_paid_at: p.paidAt, p_reference: p.reference ?? null, p_note: p.note ?? null,
      }),
    updatePaymentStatus: (paymentId: string, action: 'confirm' | 'reject' | 'cancel' | 'reverse', note?: string | null) =>
      call('update_payment_status', { p_payment_id: paymentId, p_action: action, p_note: note ?? null }),
    sendReminder: (groupId: string, toUser: string) => call('send_payment_reminder', { p_group_id: groupId, p_to_user: toUser }),
    getStatement: (groupId: string, from: string, to: string) => call<T.Statement>('get_group_statement', { p_group_id: groupId, p_from: from, p_to: to }),
    getReport: (groupId: string, month: string) => call<T.Report>('get_group_report', { p_group_id: groupId, p_month: month }),
    listBudgets: (groupId: string) => call<T.Budget[]>('list_group_budgets', { p_group_id: groupId }),
    setBudget: (groupId: string, categoryKey: string | null, amountPaise: number) =>
      call('set_group_budget', { p_group_id: groupId, p_category_key: categoryKey, p_amount_paise: amountPaise }),

    // ---- notifications
    listNotifications: (beforeId?: number | null) => call<T.NotificationPage>('list_notifications', { p_limit: 30, p_before_id: beforeId ?? null }),
    markNotificationsRead: (ids: number[] | null = null) => call('mark_notifications_read', { p_ids: ids }),
    deleteNotifications: (ids: number[] | null = null) => call<number>('delete_notifications', { p_ids: ids }),
    // ---- app status + platform admin (aggregate-only, see migration 0011)
    getAppStatus: () => call<{ maintenance: boolean; announcement: string }>('get_app_status'),
    amIPlatformAdmin: () => call<boolean>('am_i_platform_admin'),
    adminOverview: () => call<T.AdminOverview>('admin_overview'),
    adminListGroups: (offset = 0) => call<T.AdminGroup[]>('admin_list_groups', { p_limit: 50, p_offset: offset }),
    adminSetGroupStatus: (groupId: string, status: 'active' | 'archived', reason: string) => call('admin_set_group_status', { p_group_id: groupId, p_status: status, p_reason: reason }),
    adminSetAppStatus: (maintenance: boolean, announcement: string) => call('admin_set_app_status', { p_maintenance: maintenance, p_announcement: announcement }),
    adminListAudit: () => call<T.AdminAuditRow[]>('admin_list_audit', { p_limit: 50 }),
    registerPushToken: (token: string, platform: 'android' | 'ios' | 'web') => call('register_push_token', { p_token: token, p_platform: platform }),
    unregisterPushToken: (token: string) => call('unregister_push_token', { p_token: token }),

    // ---- shopping & notices
    getShoppingList: (groupId: string) => call<T.ShoppingList>('get_shopping_list', { p_group_id: groupId }),
    addShoppingItem: (groupId: string, name: string, quantity?: string | null) => call<string>('add_shopping_item', { p_group_id: groupId, p_name: name, p_quantity: quantity ?? null }),
    setShoppingItemBought: (itemId: string, bought: boolean) => call('set_shopping_item_status', { p_item_id: itemId, p_bought: bought }),
    removeShoppingItem: (itemId: string) => call('remove_shopping_item', { p_item_id: itemId }),
    clearBoughtItems: (groupId: string) => call<number>('clear_bought_items', { p_group_id: groupId }),
    listNotices: (groupId: string) => call<T.Notice[]>('list_notices', { p_group_id: groupId }),
    createNotice: (groupId: string, title: string, body: string, pinned = false) => call<string>('create_notice', { p_group_id: groupId, p_title: title, p_body: body, p_pinned: pinned }),
    updateNotice: (noticeId: string, title: string, body: string, pinned: boolean | null = null) => call('update_notice', { p_notice_id: noticeId, p_title: title, p_body: body, p_pinned: pinned }),
    deleteNotice: (noticeId: string) => call('delete_notice', { p_notice_id: noticeId }),
  };
}

export type Api = ReturnType<typeof createApi>;
export { KhError };
