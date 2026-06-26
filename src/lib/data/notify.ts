export const LOW_THRESHOLD = 3;
export const EXPIRY_DAYS = 7;
export const isLowSessions = (remaining: number, threshold = LOW_THRESHOLD) => remaining <= threshold;
export const isExpiringSoon = (dDay: number, withinDays = EXPIRY_DAYS) => dDay >= 0 && dDay <= withinDays;

// 대시보드/회원목록 "만료 임박" 판정의 단일 기준(이미 만료된 음수 dDay 제외 → "D--10" 방지).
export const EXPIRING_WINDOW_DAYS = 14;
export const isExpiringWindow = (dDay: number, withinDays = EXPIRING_WINDOW_DAYS) => dDay >= 0 && dDay <= withinDays;
