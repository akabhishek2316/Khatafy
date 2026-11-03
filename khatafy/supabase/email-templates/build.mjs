// Generates the branded Supabase email templates (HTML, inline CSS, table layout = works in Gmail/Outlook/mobile).
//   node supabase/email-templates/build.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url));
// Public URL where /icons/logo-mark.png is served. Emails need an ABSOLUTE https URL for images.
const SITE = (process.env.SITE_URL || 'https://khatafy-sable.vercel.app').replace(/\/$/, '');

const shell = ({ preheader, title, titleHi, lines, linesHi, button, note, noteHi }) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light only">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4fb;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f3f4fb;">${preheader}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4fb;padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;">
      <tr><td align="center" style="padding:0 0 18px;">
        <table role="presentation" cellspacing="0" cellpadding="0"><tr>
          <td style="vertical-align:middle;"><img src="${SITE}/icons/logo-mark.png" width="48" height="48" alt="Khatafy" style="display:block;border:0;outline:none;width:48px;height:48px;border-radius:10px;"></td>
          <td style="padding-left:12px;font:800 24px 'Segoe UI',Roboto,Arial,sans-serif;color:#1b1d3a;letter-spacing:-0.3px;">Khatafy</td>
        </tr></table>
      </td></tr>
      <tr><td style="background:#ffffff;border-radius:20px;border:1px solid #e4e6f4;padding:36px 32px;box-shadow:0 8px 30px rgba(49,46,129,0.08);">
        <h1 style="margin:0 0 14px;font:700 22px/1.3 'Segoe UI',Roboto,Arial,sans-serif;color:#1b1d3a;">${title}</h1>
        ${lines.map((l) => `<p style="margin:0 0 14px;font:400 15px/1.6 'Segoe UI',Roboto,Arial,sans-serif;color:#4b5075;">${l}</p>`).join('\n        ')}
        ${button ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:26px 0;"><tr><td style="border-radius:12px;background:#1d5fe0;background-image:linear-gradient(135deg,#1d5fe0,#19a0f0);">
          <a href="${button.href}" style="display:inline-block;padding:14px 30px;font:700 16px 'Segoe UI',Roboto,Arial,sans-serif;color:#ffffff;text-decoration:none;border-radius:12px;">${button.label}</a>
        </td></tr></table>
        <p style="margin:0 0 6px;font:400 12.5px/1.5 'Segoe UI',Roboto,Arial,sans-serif;color:#7a7fa3;">If the button does not work, copy this link into your browser:</p>
        <p style="margin:0 0 18px;font:400 12.5px/1.5 'Segoe UI',Roboto,Arial,sans-serif;word-break:break-all;"><a href="${button.href}" style="color:#1d5fe0;">${button.href}</a></p>` : ''}
        <hr style="border:0;border-top:1px solid #eceef8;margin:22px 0;">
        <h2 style="margin:0 0 8px;font:700 16px/1.4 'Noto Sans Devanagari','Segoe UI',Arial,sans-serif;color:#1b1d3a;">${titleHi}</h2>
        ${linesHi.map((l) => `<p style="margin:0 0 10px;font:400 14.5px/1.7 'Noto Sans Devanagari','Segoe UI',Arial,sans-serif;color:#4b5075;">${l}</p>`).join('\n        ')}
        <p style="margin:18px 0 0;font:400 12.5px/1.6 'Segoe UI',Arial,sans-serif;color:#7a7fa3;">${note}<br><span style="font-family:'Noto Sans Devanagari','Segoe UI',Arial,sans-serif;">${noteHi}</span></p>
      </td></tr>
      <tr><td align="center" style="padding:20px 8px 0;font:400 12px/1.6 'Segoe UI',Arial,sans-serif;color:#8c91b3;">
        Khatafy &mdash; Saath Raho. Hisab Saaf Rakho.<br>You received this email because someone used this address on Khatafy.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
`;

const T = {
  'confirm-signup': shell({
    preheader: 'Confirm your email to start using Khatafy.',
    title: 'Confirm your email', titleHi: 'अपना ईमेल पक्का करें',
    lines: ['Welcome to Khatafy! Tap the button below to confirm <strong>{{ .Email }}</strong> and activate your account.'],
    linesHi: ['Khatafy में आपका स्वागत है! खाता चालू करने के लिए नीचे का बटन दबाकर <strong>{{ .Email }}</strong> पक्का करें।'],
    button: { href: '{{ .ConfirmationURL }}', label: 'Confirm my email' },
    note: 'If you did not create this account, you can safely ignore this email.', noteHi: 'अगर आपने खाता नहीं बनाया है तो इस ईमेल को अनदेखा करें।',
  }),
  'reset-password': shell({
    preheader: 'Reset your Khatafy password.',
    title: 'Reset your password', titleHi: 'पासवर्ड रीसेट करें',
    lines: ['We received a request to reset the password for <strong>{{ .Email }}</strong>. Tap the button to choose a new one. The link works for a short time only.'],
    linesHi: ['<strong>{{ .Email }}</strong> का पासवर्ड रीसेट करने का अनुरोध मिला है। नया पासवर्ड चुनने के लिए बटन दबाएँ। यह लिंक थोड़े समय के लिए ही चलेगा।'],
    button: { href: '{{ .ConfirmationURL }}', label: 'Choose a new password' },
    note: 'Did not ask for this? Ignore this email — your password stays the same.', noteHi: 'आपने नहीं माँगा? इस ईमेल को अनदेखा करें — आपका पासवर्ड वैसा ही रहेगा।',
  }),
  'magic-link': shell({
    preheader: 'Your one-tap sign-in link for Khatafy.',
    title: 'Sign in to Khatafy', titleHi: 'Khatafy में लॉगिन करें',
    lines: ['Tap the button below to sign in as <strong>{{ .Email }}</strong>. This link can be used once.'],
    linesHi: ['<strong>{{ .Email }}</strong> के रूप में लॉगिन करने के लिए बटन दबाएँ। यह लिंक एक ही बार चलेगा।'],
    button: { href: '{{ .ConfirmationURL }}', label: 'Sign in' },
    note: 'If you did not request this, ignore this email.', noteHi: 'आपने नहीं माँगा तो इसे अनदेखा करें।',
  }),
  'change-email': shell({
    preheader: 'Confirm your new email address.',
    title: 'Confirm your new email', titleHi: 'नया ईमेल पक्का करें',
    lines: ['You asked to change your Khatafy email from <strong>{{ .Email }}</strong> to <strong>{{ .NewEmail }}</strong>. Confirm below to finish.'],
    linesHi: ['आपने अपना Khatafy ईमेल <strong>{{ .Email }}</strong> से <strong>{{ .NewEmail }}</strong> करने को कहा है। पूरा करने के लिए नीचे पक्का करें।'],
    button: { href: '{{ .ConfirmationURL }}', label: 'Confirm new email' },
    note: 'If this was not you, please change your password right away.', noteHi: 'यह आप नहीं थे तो तुरंत अपना पासवर्ड बदलें।',
  }),
  'invite-user': shell({
    preheader: 'You have been invited to Khatafy.',
    title: 'You are invited to Khatafy', titleHi: 'आपको Khatafy पर बुलाया गया है',
    lines: ['Someone invited you to Khatafy &mdash; the easy way to keep shared room expenses clear. Accept the invite to create your account.'],
    linesHi: ['किसी ने आपको Khatafy पर बुलाया है — साझा खर्च का हिसाब साफ़ रखने का आसान तरीका। खाता बनाने के लिए निमंत्रण स्वीकार करें।'],
    button: { href: '{{ .ConfirmationURL }}', label: 'Accept invitation' },
    note: 'If you were not expecting this, you can ignore this email.', noteHi: 'उम्मीद नहीं थी तो इसे अनदेखा करें।',
  }),
  'reauthentication': shell({
    preheader: 'Your Khatafy confirmation code.',
    title: 'Your confirmation code', titleHi: 'आपका पुष्टि कोड',
    lines: ['Enter this code to confirm it is you:', '<span style="display:inline-block;font:700 30px/1 \'Courier New\',monospace;letter-spacing:6px;color:#1d5fe0;background:#eef0ff;border-radius:12px;padding:14px 20px;">{{ .Token }}</span>'],
    linesHi: ['यह आप ही हैं, पक्का करने के लिए ऊपर का कोड डालें।'],
    note: 'Never share this code with anyone.', noteHi: 'यह कोड किसी को न बताएँ।',
  }),
};
for (const [name, html] of Object.entries(T)) writeFileSync(join(dir, `${name}.html`), html);
console.log('Wrote', Object.keys(T).length, 'templates');
