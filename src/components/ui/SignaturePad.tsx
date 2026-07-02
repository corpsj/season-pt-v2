import { useEffect, useRef, useState } from "react";

/**
 * 회원 확인 서명 패드 — 스트로크가 끝날 때마다 PNG data URL을 onChange로 전달(지우면 null).
 * 흰 배경으로 export되므로 어디서 봐도 읽을 수 있다.
 */
export function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * dpr;
    c.height = c.offsetHeight * dpr;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, c.offsetWidth, c.offsetHeight);
    ctx.strokeStyle = "#26231E";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  function pos(e: React.PointerEvent) {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function down(e: React.PointerEvent) {
    const c = canvasRef.current!;
    drawing.current = true;
    c.setPointerCapture(e.pointerId);
    const ctx = c.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.1, p.y + 0.1); // 점 찍기도 획으로
    ctx.stroke();
    setEmpty(false);
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvasRef.current!.toDataURL("image/png"));
  }
  function clear() {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, c.offsetWidth, c.offsetHeight);
    setEmpty(true);
    onChange(null);
  }

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className="h-[160px] w-full touch-none rounded-[15px] border border-ink/[0.12] bg-white"
      />
      {empty ? (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[14px] font-medium text-muted3">
          회원이 여기에 서명해주세요
        </span>
      ) : (
        <button
          type="button"
          onClick={clear}
          className="absolute right-2.5 top-2.5 rounded-[9px] bg-[#F4EFE6] px-2.5 py-[5px] text-[12px] font-semibold text-[#766D60]"
        >
          지우기
        </button>
      )}
    </div>
  );
}
