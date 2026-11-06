export const CATEGORY_ICON: Record<string, string> = {
  rent: '🏠', grocery: '🛒', food: '🍲', electricity: '💡', water: '💧', gas: '🔥', internet: '📶', cleaning: '🧹', travel: '🚌', other: '🧾',
};
export const catIcon = (k: string) => CATEGORY_ICON[k] ?? '🧾';
