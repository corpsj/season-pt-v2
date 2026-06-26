-- 0011: per-member notification preferences.
-- The background notification scan (scanExpiringMemberships / notifyLowSessions) runs outside
-- any member request, so member toggles must be DB-backed (not cookies) to be honored.
-- jsonb map of { [notificationKey]: boolean }; absent key = generator default (on).
alter table members add column if not exists notif_prefs jsonb not null default '{}'::jsonb;
