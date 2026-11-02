# Khatafy email templates

Professional, mobile-friendly (English + Hindi) emails. Supabase cannot load these automatically — paste them once:

Supabase Dashboard → **Authentication → Emails → Templates**, open each template, paste the HTML (the *Source* tab), set the subject, **Save**.

| Supabase template | File | Suggested subject |
|---|---|---|
| Confirm sign up | `confirm-signup.html` | Confirm your Khatafy account / अपना Khatafy खाता पक्का करें |
| Reset password | `reset-password.html` | Reset your Khatafy password |
| Magic link | `magic-link.html` | Your Khatafy sign-in link |
| Change email address | `change-email.html` | Confirm your new email |
| Invite user | `invite-user.html` | You are invited to Khatafy |
| Reauthentication | `reauthentication.html` | Your Khatafy confirmation code |

Also set the **sender name** to `Khatafy` in Authentication → SMTP Settings.
Edit text in `build.mjs` and run `node supabase/email-templates/build.mjs` to regenerate.
