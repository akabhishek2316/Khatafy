# Privacy notes (for the operator)

* Stored per user: name, email (Supabase Auth), optional phone/avatar, language, group data they enter.
* Export: `export_my_data()` returns profile, groups, expenses, payments, notifications as JSON (Profile page).
* Delete: `delete_my_account()` — blocked while you are the only admin of a group with other members (make someone else admin first). Sole-member groups are archived, the profile is anonymised to "Deleted user", and the auth user is removed. Other members keep seeing the shared expense history (needed for their balances) with the name replaced.
* Receipts are only readable by members of the group they were uploaded to.
* No analytics/tracking scripts are included.
