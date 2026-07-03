"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/Button";
import { searchAll, type SearchHit } from "@/lib/data/groups/console-actions";

const GROUP_LABEL: Record<SearchHit["group"], string> = {
  member: "회원",
  trainer: "강사",
  request: "요청",
  message: "메시지",
};
const GROUP_ICON: Record<SearchHit["group"], IconName> = {
  member: "person",
  trainer: "persons",
  request: "refresh",
  message: "message",
};

/** 콘솔 헤더 전역 검색 — 300ms 디바운스 후 searchAll, 그룹 드롭다운 + ↑↓/Enter/Esc. */
export function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);

  // 디바운스 + stale 응답 폐기(reqId).
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++reqId.current;
    const timer = setTimeout(async () => {
      try {
        const res = await searchAll(term);
        if (reqId.current !== id) return;
        setHits(res);
        setActive(0);
      } catch {
        if (reqId.current === id) setHits([]);
      } finally {
        if (reqId.current === id) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  // 바깥 클릭 시 닫기.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function go(hit: SearchHit) {
    setOpen(false);
    setQ("");
    setHits([]);
    router.push(hit.href);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      e.currentTarget.blur();
      return;
    }
    if (!open || hits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const h = hits[active];
      if (h) go(h);
    }
  }

  const showDropdown = open && q.trim().length >= 2;

  return (
    <div ref={boxRef} className="relative flex-none">
      <div className="flex w-[240px] items-center gap-[7px] rounded-[11px] border border-[rgba(75,59,46,0.09)] bg-white px-[13px] py-[9px] focus-within:border-sage/50">
        <Icon name="search" size={15} className="flex-none text-[#A89F92]" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder="회원·강사·요청·메시지 검색"
          aria-label="전역 검색"
          className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-ink placeholder:text-[#B3AA9C] focus:outline-none"
        />
        {loading ? (
          <Spinner size={14} />
        ) : q ? (
          <button
            type="button"
            aria-label="검색어 지우기"
            onClick={() => {
              setQ("");
              setHits([]);
            }}
            className="flex-none text-[#B3AA9C] transition hover:text-[#847A66]"
          >
            <Icon name="close" size={14} />
          </button>
        ) : null}
      </div>

      {showDropdown ? (
        <div className="absolute right-0 top-[calc(100%+6px)] z-[80] w-[320px] overflow-hidden rounded-[14px] border border-[rgba(75,59,46,0.1)] bg-white py-1.5 shadow-[0_18px_44px_-14px_rgba(38,35,30,0.4)]">
          {hits.length > 0 ? (
            hits.map((h, i) => (
              <button
                key={`${h.group}-${h.id}`}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(h)}
                className={`flex w-full items-center gap-2.5 px-3.5 py-[9px] text-left transition-colors ${i === active ? "bg-[#F4F0E8]" : ""}`}
              >
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-[8px] bg-[#EDF4E3] text-sage-deep">
                  <Icon name={GROUP_ICON[h.group]} size={14} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-ink">{h.title}</span>
                  {h.sub ? <span className="block truncate text-[11.5px] font-medium text-[#9A917F]">{h.sub}</span> : null}
                </span>
                <span className="flex-none text-[10.5px] font-semibold text-[#B3AA9C]">{GROUP_LABEL[h.group]}</span>
              </button>
            ))
          ) : loading ? (
            <div className="px-3.5 py-3 text-[12.5px] font-medium text-[#A89F92]">검색 중…</div>
          ) : (
            <div className="px-3.5 py-3 text-[12.5px] font-medium text-[#A89F92]">검색 결과 없음</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
