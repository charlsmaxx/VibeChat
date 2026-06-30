# VibeChat calls: Agora + FCM push setup

## 1. Agora Console

1. Create a project at [Agora Console](https://console.agora.io/).
2. Copy **App ID** → set as `EXPO_PUBLIC_AGORA_APP_ID` in EAS env and local `.env`.
3. Enable **App Certificate** (primary certificate) and copy the certificate string.
4. Add Supabase Edge Function secrets (Dashboard → Project Settings → Edge Functions → Secrets):
   - `AGORA_APP_ID` = same App ID
   - `AGORA_APP_CERTIFICATE` = certificate string
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` (auto-injected on deploy in many setups)

Deploy functions:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy agora-token
supabase functions deploy notify-incoming-call
```

`agora-token` requires a logged-in user (JWT). The app calls it before joining a channel.

## 2. Expo / FCM (push when app is killed)

1. `EXPO_PUBLIC_EAS_PROJECT_ID` must match your Expo project (already used for push tokens).
2. Build with **EAS** (`eas build`) — push tokens do not work in Expo Go for production FCM.
3. **Android**: upload FCM credentials in Expo dashboard (EAS → Project → Credentials → Android → FCM V1).
4. **iOS**: upload APNs key in EAS credentials.
5. Run SQL: `calls_voip.sql` (if not already).

Each device registers its Expo push token in `push_tokens` on login.

## 3. Incoming call push (reliable when app is background/killed)

### A. App invokes edge function (already wired)

After creating a call, the app calls `notify-incoming-call` with `{ callId }`.

### B. Database Webhook (recommended — works if caller closes app)

1. Supabase Dashboard → **Database** → **Webhooks** → **Create hook**
2. Table: `calls`, event: **Insert**
3. URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/notify-incoming-call`
4. HTTP headers:
   - `Content-Type: application/json`
   - `x-webhook-secret: YOUR_RANDOM_SECRET` (match `CALL_WEBHOOK_SECRET` edge secret)
5. Payload: send `record` as body or configure to POST `{ "callId": "{{ record.id }}" }`

Add edge secret: `CALL_WEBHOOK_SECRET` = same value.

## 4. Test checklist

| Step | Expected |
|------|----------|
| User B logged in on physical device, notifications allowed | `push_tokens` row exists |
| User A starts voice call to B | B gets push / alert; Answer opens call |
| App killed on B | B still gets FCM notification (high priority channel) |
| Both join | Audio works; video shows tiles |
| Group call | All members except caller get push; Join banner in group chat |

## 5. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Failed to fetch Agora token` | Deploy `agora-token`, set `AGORA_APP_CERTIFICATE` |
| Join works on dev only | Disable certificate in Agora for testing OR use token function |
| No push when killed | FCM credentials on EAS, real device build, notification permission |
| Push but no ring | Android channel `incoming_calls`; disable battery optimization for app |
