# VibeChat MVP

Production-ready Expo + Supabase + Agora chat foundation with strict TypeScript and scalable architecture.

## Stack

- Expo + React Native
- TypeScript (strict)
- Zustand stores
- Supabase Auth/Postgres/Realtime/Storage
- Agora SDK (audio/video call scaffolding)
- Expo Notifications, Contacts, Image Picker, AV

## Structure

`src/components`, `src/screens`, `src/navigation`, `src/hooks`, `src/store`, `src/services`, `src/utils`, `src/constants`, `src/types`

## Setup

1. Install:
   - `npm install`
2. Copy `.env.example` to `.env`
3. Configure env:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `EXPO_PUBLIC_AGORA_APP_ID`
   - `EXPO_PUBLIC_USE_PHONE_OTP_AUTH`
   - `EXPO_PUBLIC_EAS_PROJECT_ID`
4. Run SQL in `supabase/schema.sql`
5. Start app:
   - `npx expo start`

## Features Included

- Email/password auth flow with persistent session bootstrapping
- Realtime 1:1/group-ready messaging base
- Pagination (20 messages/batch)
- Optimistic send + offline queue persistence
- Contacts sync + invite SMS deep-link service
- Push token registration to Supabase
- Agora call service wrapper and state store

## Production Notes

- Add Supabase Edge Function for server-side push fanout on new messages.
- For Agora production builds in Expo, use EAS + prebuild/native config.
- Expand `messages` statuses to delivered/read update flows via realtime acknowledgements.
