export type ChatDayKeys = {
  todayKey: string;
  yesterdayKey: string;
};

export function currentKstDayKeys(nowMs = Date.now()): ChatDayKeys {
  return {
    todayKey: new Date(nowMs + 9 * 3600000).toISOString().slice(0, 10),
    yesterdayKey: new Date(nowMs - 86400000 + 9 * 3600000).toISOString().slice(0, 10),
  };
}

/** KST calendar day (YYYY-MM-DD) for a message; optimistic messages fold into today. */
export function kstDayKey(iso: string | undefined, todayKey: string): string {
  if (!iso) return todayKey;
  return new Date(new Date(iso).getTime() + 9 * 3600000).toISOString().slice(0, 10);
}

export function dayChipLabel(key: string, { todayKey, yesterdayKey }: ChatDayKeys): string {
  if (key === todayKey) return "오늘";
  if (key === yesterdayKey) return "어제";
  const [, mo, d] = key.split("-");
  return `${Number(mo)}월 ${Number(d)}일`;
}
