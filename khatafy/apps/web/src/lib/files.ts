import { newId } from '@khatafy/core';
import { api, supabase } from './supabase';

export const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

export function receiptProblem(f: File): 'INVALID_FILE_TYPE' | 'FILE_TOO_LARGE' | null {
  if (!RECEIPT_TYPES.includes(f.type)) return 'INVALID_FILE_TYPE';
  if (f.size < 1 || f.size > MAX_RECEIPT_BYTES) return 'FILE_TOO_LARGE';
  return null;
}

export async function uploadReceipt(groupId: string, expenseId: string, file: File) {
  const path = `${groupId}/${expenseId}/${newId()}.${EXT[file.type] ?? 'bin'}`;
  const { error } = await supabase.storage.from('receipts').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return api.addReceipt(expenseId, path, file.name.slice(0, 200), file.type, file.size);
}

export async function signedReceiptUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, 3600);
  return error ? null : data?.signedUrl ?? null;
}

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('INVALID_FILE_TYPE');
  if (file.size > 2 * 1024 * 1024) throw new Error('FILE_TOO_LARGE');
  const path = `${userId}/${newId()}.${EXT[file.type]}`;
  const { error } = await supabase.storage.from('avatars').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
