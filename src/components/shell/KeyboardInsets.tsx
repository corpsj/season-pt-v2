"use client";
import { useEffect } from "react";

/**
 * iOS 키보드 대응. iOS 키보드는 레이아웃 뷰포트를 줄이지 않고 위에 겹쳐 뜨므로
 * (globals.css가 셸을 100dvh + overflow:hidden으로 잠근 상태) 하단 입력행이 가려진다.
 *
 * visualViewport로 키보드가 덮은 높이(kb)를 계산해 <html>에 `--kb` 변수와 `.kb-open`
 * 클래스로 노출한다 → globals.css가 셸 높이를 kb만큼 줄여 ChatInput/Footer를 키보드 위로
 * 올린다. 키보드가 닫히면 iOS가 남긴 webview 팬을 scrollTo(0,0)로 되돌린다.
 *
 * visualViewport 미지원 환경(구형 Safari/데스크톱)에서는 아무것도 하지 않는다.
 */
export function KeyboardInsets() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return; // 미지원 가드
    const root = document.documentElement;

    const overlap = () => Math.max(0, window.innerHeight - vv.height - vv.offsetTop);

    let open = false;
    const update = () => {
      const kb = overlap();
      root.style.setProperty("--kb", `${Math.round(kb)}px`);
      const nowOpen = kb > 0.5;
      if (nowOpen !== open) {
        open = nowOpen;
        root.classList.toggle("kb-open", nowOpen);
        if (nowOpen) {
          // 키보드가 막 열렸으니 채팅 등 하단 고정 입력 화면이 최신으로 다시 스크롤하도록 알림
          window.dispatchEvent(new Event("spt:kbopen"));
        } else {
          window.scrollTo(0, 0); // 닫힐 때 iOS가 남긴 webview 팬 원복
        }
      }
    };

    // 입력에서 포커스가 빠지면 키보드가 닫히며 남는 팬을 한 번 더 정리(resize가 안 오는 경우 대비)
    const onFocusOut = () => {
      setTimeout(() => {
        if (overlap() <= 0.5) window.scrollTo(0, 0);
      }, 0);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      document.removeEventListener("focusout", onFocusOut);
      root.classList.remove("kb-open");
      root.style.removeProperty("--kb");
    };
  }, []);

  return null;
}
