export const LOW_THRESHOLD = 3;
export const EXPIRY_DAYS = 7;
export const isLowSessions = (remaining: number, threshold = LOW_THRESHOLD) => remaining <= threshold;
export const isExpiringSoon = (dDay: number, withinDays = EXPIRY_DAYS) => dDay >= 0 && dDay <= withinDays;
