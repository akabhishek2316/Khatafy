import type { Dict } from './i18n';
import { errorMessages } from './messages.errors';
import { uiMessages } from './messages.ui';
import { notificationMessages } from './messages.notifications';
import { extraMessages } from './messages.extra';

export const messages: Dict = { ...errorMessages, ...notificationMessages, ...uiMessages, ...extraMessages };
export * from './i18n';
