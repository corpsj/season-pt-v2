"use client";

/**
 * 루트 레이아웃까지 무너졌을 때의 최후 방어선. 루트 레이아웃을 통째로 대체하므로
 * globals.css/Tailwind가 로드되지 않는다 — 인라인 스타일만 사용한다(브랜드 토큰 하드코딩).
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#faf8f4",
          color: "#4b3b2e",
          fontFamily:
            "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', system-ui, sans-serif",
          textAlign: "center",
          padding: "24px",
        }}
      >
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>화면을 불러오지 못했어요</div>
          <p style={{ margin: "10px 0 0", fontSize: 13.5, lineHeight: 1.6, color: "#847a66" }}>
            일시적인 문제일 수 있어요.
            <br />
            잠시 후 다시 시도해 주세요.
          </p>
          {error?.digest ? (
            <p style={{ margin: "8px 0 0", fontSize: 11, color: "#b3aa9c" }}>
              오류 코드 {error.digest}
            </p>
          ) : null}
          <button
            onClick={() => unstable_retry()}
            style={{
              marginTop: 22,
              height: 48,
              padding: "0 28px",
              borderRadius: 15,
              border: "none",
              background: "#768c6a",
              color: "#faf8f4",
              fontSize: 15,
              fontWeight: 600,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
