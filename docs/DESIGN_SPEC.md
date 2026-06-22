# 계절 PT & 필라테스 — 트레이너/회원 앱 (C안) · 구현 명세서

> **출처:** `_handoff_v2/3/project/트레이너 앱 (C안) 인터랙티브.dc.html` (1420줄) + `support.js` (dc-runtime) + `pt-icons.js` (81 아이콘) + Wanted Design System 토큰.
> **권위 순서:** 인라인 `style=""`의 hex/px 값이 최종 진실. Wanted DS 토큰 파일은 *참조용 베이스*일 뿐 — **이 앱은 DS의 파란색(#3366FF) 시스템을 쓰지 않고**, 자체 웜/세이지(warm/sage) 팔레트를 인라인으로 전부 재정의한다. DS에서 실제로 차용한 것은 (a) Pretendard 본문, (b) 4px 그리드 감각, (c) 부드러운 저-alpha 그림자, (d) 아이콘 세트(monoline + `-fill` 페어, `currentColor`)뿐이다.
> **타깃:** Next.js + Tailwind. 단일 모바일 프레임(380×812). 1뷰 1주요액션. 한국어 해요체.

---

## A. 디자인 토큰

### A.1 컬러 팔레트 (인라인에서 추출한 모든 distinct hex)

| 시맨틱 이름 | hex | 용도 |
|---|---|---|
| **frame-shell** | `#26231E` | 폰 프레임 본체(베젤), 토스트 배경 |
| **island / notch** | `#15130F` | Dynamic Island |
| **bg-canvas** | `#EAE5DB` | `.stage` 바깥 배경(웜 베이지) |
| **surface / screen** | `#FAF8F4` | `.screen` 화면 바탕, 버튼 위 텍스트색(역상), 탭바 배경(94% alpha) |
| **card** | `#fff` | 카드/입력/리스트 행 배경 |
| **ink** (본문 메인) | `#4B3B2E` | 제목·주요 텍스트(웜 다크브라운) |
| **ink-soft** | `#5B4B38` | 강조 보조 텍스트(배너 내 굵은 글씨) |
| **ink-row** | `#6B6258` | 캘린더 평일 날짜 숫자 |
| **primary / sage** | `#768C6A` | 주 버튼(.pbtn), 선택/활성 채움, 아바타, 매출카드/배너 |
| **sage-deep** | `#6B785E` | 탭바 활성색, 보조버튼(.obtn) 텍스트, 강조 라벨 |
| **sage-soft** | `#8FA187` | 캘린더 점(dot), 영문 italic 태그라인, 입력 아이콘 |
| **sage-mid** | `#79836B` | 회원 아바타 기본 배경(일부) |
| **sage-leaf** | `#9DB089` | 빈상태 체크 아이콘, 토스트 체크, "· 아이디" 헬퍼 |
| **sage-line** | `#A9B89B` | 입력 focus 보더 |
| **muted-1** | `#847A66` | 보조 텍스트(서브타이틀·메타) |
| **muted-2** | `#8A8175` | 본문 설명 단락 텍스트 |
| **muted-3** | `#8A8473` / `#8E8473` | `.kick` 라벨, info 아이콘 |
| **muted-4** | `#8B8374` | 검색 아이콘, 작은 보조 |
| **muted-5** | `#766D60` | 입력 라벨, 비선택 옵션 텍스트 |
| **muted-6** | `#787063` | 취소선(변경 전) 텍스트 |
| **placeholder** | `#B3AA9C` | placeholder, 비활성 탭 색, 작은 시각 |
| **chevron-muted** | `#C2BAAD` | 비활성 chevron, 취소선 색, ± 감소버튼 |
| **disabled-stroke** | `#D6CFC2` | 라디오/체크박스 빈 테두리 |
| **terracotta / alert** | `#C67352` | 알림 뱃지/배지(D-≤5), 만료 경고, 취소요청, 임시PW 아이콘 |
| **terracotta-deep** | `#9A5A38` | 만료배너 굵은 텍스트 |
| **terracotta-text** | `#B08465` | 만료배너 보조 텍스트 |
| **terracotta-link** | `#B5612F` / `#9A7B66` | "거절하기" 텍스트 / 경고배너 보조 |
| **sunday-red** | `#C0796A` | 캘린더 일요일 헤더/숫자 |
| **info-blue band** | `#E7EDF2` | 2:1 팀 안내 배너 배경 |
| **info-blue ink** | `#48586A` | 2:1 안내 텍스트 |
| **info-blue accent** | `#5C7286` | 2:1 뱃지/아이콘 |
| **team-bar** | `#6E8AA0` / `#6E8AA0` | 캘린더 2:1 수업 바색 |
| **warm-banner (terracotta tint)** | `#FBF3E9` | 만료/임시PW/취소요청 배너 배경 |
| **sage-banner-1** | `#F8F4EC` | 중립 info 배너, 회원로그인 안내 |
| **sage-banner-2 (green tint)** | `#EDF4E3` | 선택 옵션 배경, 강조 칩, 잔여뱃지, info 강조 |
| **green-active-bg** | `#E4EFE3` | "활성"/강사 뱃지 배경 |
| **green-active-text** | `#5C9166` | "활성"/강사 뱃지 텍스트 |
| **gold-bg (owner)** | `#F4EEE3` | 대표 뱃지/배너 배경 |
| **gold-text (owner)** | `#8A6F3E` / `#5B4B38` | 대표 왕관/텍스트 |
| **gold-pending-bg** | `#F3EAD2` | "응답 대기"/"초대 대기" 뱃지 배경 |
| **gold-pending-text** | `#9A7B2E` | "응답 대기"/D-(6~)임박 텍스트 |
| **pending-avatar** | `#A89A80` | 초대대기 강사 아바타 |
| **gold-avatar** | `#A88B57` | 이지수 아바타 배경 |
| **chip-soft-bg** | `#F1ECE2` | 빈상태 아이콘 원, 채팅 날짜칩, "지금" 등 |
| **chip-stepper-bg** | `#FAF7F0` | 운동기록 스테퍼 배경 |
| **bar-empty** | `#EAF0E0` | 실적 막대그래프(비강조) |
| **bar-track** | `rgba(250,248,244,.2)` | 회원권 진행바 트랙(카드 위) |
| **bar-fill (progress)** | `#F0E0C8` / `#F0E0C8` | 회원권 잔여 진행바 채움(웜 골드) |
| **disabled-send** | `#E4DFD2` | 비활성 전송버튼 배경 |
| **plus-icon** | `#9A917F` | 채팅 + 버튼 아이콘 |
| **gradient progress text** | `#F0E6CF` | 매출/만료 카드 위 골드 텍스트 |
| **chart-deep** | `#5B6452` | info 강조배너 텍스트 |

저-alpha 라인/그림자 토큰(반복):
- 카드 보더: `rgba(75,59,46,.055)`~`.06`~`.07`~`.08`~`.1`~`.12`~`.14` (ink을 alpha로)
- 디바이더: `rgba(75,59,46,.07)`~`.08`
- sage 보더(.obtn): `rgba(107,120,94,.45)` / `.4`
- terracotta 보더: `rgba(198,115,82,.18)` / `.25`

### A.2 타이포그래피

- **본문 폰트:** `Pretendard` (CDN: `pretendard@v1.3.9 .../pretendard.min.css`), fallback `-apple-system,sans-serif`. `-webkit-font-smoothing:antialiased`.
- **serif(숫자·강조):** `.serif { font-family:'Cormorant Garamond',serif }` (CDN Google Fonts, italic 400/500/600). 큰 수치(매출·잔여·통계·영문 태그라인)에 사용.
- 모든 텍스트는 `font:<weight> <size>[/line] Pretendard` shorthand로 인라인 지정. **실제 사용된 스케일:**

| 역할 | 스펙 | 색 |
|---|---|---|
| 화면 대제목(로그인류) | `700 25px` ls `-.01em` | ink |
| 헤더 타이틀(서브페이지) | `700 19px` | ink |
| 탭 화면 타이틀 | `700 21px` | ink |
| 브랜드명(시작) | `700 22px` ls `-.01em` | ink |
| 성공화면 제목 | `700 23px` ls `-.01em` | ink |
| 카드 굵은 라벨 | `700 13.5~17px` | ink |
| 리스트 이름 | `700 14px` | ink |
| 본문 설명 단락 | `400 14px/1.6` | muted-2 |
| 작은 본문 | `400~500 12~13.5px/1.5~1.6` | muted |
| `.kick` (섹션 라벨) | `600 12px` ls `.08em` UPPERCASE | `#8E8473` |
| 입력 라벨 | `600 12~12.5px` | muted-5 |
| 뱃지/칩 | `600~700 9~12.5px` | 가변 |
| serif 대수치 | `36~44px` w600, line `.8` | 가변(역상/ink) |
| serif 통계 | `20~23px` w600 | 가변 |
| 캘린더 날짜 | `500 12.5px` (선택 `700 13px`) | ink-row/sunday/역상 |
| 채팅 버블 | `500 13.5px/1.5` | ink/역상 |

웜 정렬: 거의 모든 자간 0, 큰 제목만 `-.01em`, `.kick`만 `+.08em`.

### A.3 간격 · 라운드 · 그림자 · 보더

| 토큰 | 값 |
|---|---|
| 프레임 라운드 | `54px` (외부 `.frame`), `46px` (내부 `.screen`) |
| 카드 라운드 | `18px` (`.card`) |
| 큰 카드/배너 | `16px` |
| 리스트 행 | `13~15px` |
| 버튼 라운드 | `15px` (`.pbtn`/`.obtn`) |
| 입력/필드 | `12~13px` (라운드), 패딩 `13~15px 14~16px` |
| 작은 카드/배너 | `12~14px` |
| 칩(필터/사유) | `20px` (pill), 패딩 `7px 13px` |
| 세그먼트 토글 | `11px`, 패딩 `9px 0` |
| 뱃지/필 | `6~9px`(사각), `999/9px`(원형 카운터) |
| 아바타 | 원형(`50%`) |
| 채팅 버블 | 내꺼 `16px 16px 4px 16px`, 상대 `4px 16px 16px 16px` |
| 아이콘 버튼(.bk) | `38px` 정사각, 라운드 `11px` |
| 헤더 액션버튼 | `42px` 정사각, 라운드 `13px` |
| 카드 그림자 | `0 1px 2px rgba(75,59,46,.04), 0 10px 24px -14px rgba(75,59,46,.16)` |
| 프레임 그림자 | `0 2px 3px rgba(38,35,30,.22), 0 40px 80px -30px rgba(38,35,30,.55)` |
| 성공 원 그림자 | `0 16px 30px -12px rgba(118,140,106,.6)` (sage glow) |
| 토스트 그림자 | `0 14px 30px -10px rgba(38,35,30,.5)` |
| 상대 채팅 버블 | `0 1px 2px rgba(75,59,46,.04)` |
| 본문 패딩 | `8px 18px 0`(탭/리스트), `8px 22px 0`(로그인 폼) |
| 푸터 패딩 | `12px 18~22px 30px` (하단 safe-area 30px) |
| 탭바 패딩 | `10px 12px 24px` |

### A.4 애니메이션 / 키프레임

| 키프레임 | 정의 | 적용 |
|---|---|---|
| `ptPulse` | 0/100% scale1 opacity.95 → 50% scale1.55 opacity.4 | `.pt-live` (1.5s infinite) — 라이브 점 펄스 |
| `ptPop` | scale.3 op0 → 55% scale1.14 → scale1 op1 | `.pt-pop` (.55s cubic `.2,.9,.3,1.35`) — 성공 체크 원 등장 |
| `ptGrow` | width:0 → 자연폭 | `.pt-grow` (1.2s) — 회원권 잔여 진행바 채움 |
| `ptUp` | translateY(14px) op0 → 0 op1 | `.scr` (.26s) — **모든 화면 전환 진입** |
| `toastIn` | translate(-50%,12px) op0 → (-50%,0) op1 | 토스트 (.26s) |

전이: `.pbtn/.obtn/.bk/.tap/.chip` 공통 `transform .13s, filter .15s, bg .15s, box-shadow .18s`. hover: `.pbtn` brightness1.05, `.obtn` bg `rgba(118,140,106,.07)`, `.bk` `#F4F0E8`, `.tap` brightness.985. active: `scale(.975)`(버튼), `scale(.9)`(탭), `scale(.92)`(send).

---

## B. 컴포넌트 카탈로그

### 셸 / 레이아웃
- **`.frame`** `380×812`, bg `#26231E`, radius 54, padding 9, frame 그림자. `position:relative; flex:none`.
- **`.screen`** 100% bg `#FAF8F4`, radius 46, `overflow:hidden`, `flex column`.
- **`.island`** 절대배치 top12 중앙, `106×30`, bg `#15130F`, radius16, z8.
- **`<pt-statusbar>`** 상태바(9:41 · 신호/와이파이/배터리). 커스텀 엘리먼트 → 재구현: 좌측 시각, 우측 셀룰러/와이파이/배터리 글리프.
- **`<pt-home>`** 하단 홈 인디케이터 바. 화면 최하단 고정 글리프.
- **`.page`** `flex column; flex:1`. **`.body`** `flex:1; overflow-y:auto; scrollbar 숨김`.

### `.card`
bg `#fff`, radius18, 보더 `1px rgba(75,59,46,.055)`, 카드 그림자. 패딩은 호출부 인라인.

### 버튼
- **`.pbtn`** (주) `width100% h52 radius15 bg#768C6A color#FAF8F4 font:600 16px gap7`. hover brightness1.05, active scale.975. 아이콘+텍스트 가능.
- **`.obtn`** (보조) 같은 치수, `border1.5px rgba(107,120,94,.45) transparent color#6B785E`. hover bg `rgba(118,140,106,.07)`.
- **인라인 소형버튼**: 출석 `bg#768C6A color역상 700 11.5px pad7/13 radius9`; 수락 `bg#768C6A 700 12.5px radius10`; 거절 `border1px#fff 700 12.5px radius10`; 알림톡(retention) sage 채움 / 상담 sage 아웃라인.
- **점선 추가버튼**(종목추가): `border1.5px dashed rgba(107,120,94,.4) radius13 color#6B785E`.
- **`.bk`** 뒤로(38사각 radius11 bg#fff color#4B3B2E). hover `#F4F0E8`.

### `.chip` (필터/사유)
- 선택: `700 12px color#FAF8F4 bg#768C6A pad7/13 radius20`.
- 비선택(일반): `600 12px color#766D60 bg#fff border1px rgba(75,59,46,.1) radius20`.
- 비선택(만료 강조): `600 12px color#B5612F bg#FBF3E9 border1px rgba(198,115,82,.25)`.
- 사유칩 동일 패턴(선택 sage / 비선택 흰).
- 요일칩(회원등록): `flex1 center 700/600 13px pad10/0 radius11`, 선택 sage채움 / 비선택 `bg#F8F4EC` (일요일은 `#C0796A`).

### `.av` (아바타)
원형 `flex center 600 Pretendard`. 단일: 치수·`bg<color> color#FAF8F4 font-size`는 인라인. 색: sage `#768C6A`/`#79836B`/`#8FA187`, gold `#A88B57`, pending `#A89A80`. 이니셜(한글 1자).
- **2:1 팀 더블 아바타**: `position:relative` 래퍼(예 42×42) 안에 av1(`left/top, 작은원, border2px #fff`), av2(`right/bottom, bg2 색, border2px #fff`)를 겹침. 화면별 치수 다름(리스트 29, 상세 34, 출석 38, 채팅 30).

### 탭바 `.tabbar` / `.tab`
`flex none, pad10/12/24, bg rgba(250,248,244,.94), border-top1px rgba(75,59,46,.07)`. 각 `.tab`은 `flex column center gap4`. 아이콘 23px + 라벨 11px.
- **활성**: color `#6B785E`, 채움 아이콘(`calendar-fill`/`persons-fill`/`message-fill`/`coins-fill`), 라벨 weight600.
- **비활성**: color `#B3AA9C`, 아웃라인 아이콘, weight500.
- 채팅 탭엔 미읽음 카운터(절대배치 우상단, `min15 h15 radius8 bg#C67352`).
- **트레이너 탭 구성**: 캘린더·회원·채팅 + (대표만) 실적. `<sc-if isOwner>`로 실적 탭 조건부.
- **회원 탭 구성**: 캘린더·채팅·마이.

### 뱃지/필 변형 (색 매트릭스)
| 뱃지 | 텍스트색 | 배경 | 용도 |
|---|---|---|---|
| 활성 | `#5C9166` | `#E4EFE3` | 회원 status active |
| D-≤5 임박 | `#FAF8F4` | `#C67352` | 만료 ≤5일 |
| D-6~ 임박 | `#9A7B2E` | `#F3EAD2` | 만료 6일+ |
| 변경 요청 | `#6B785E` | `#EDF4E3` | inbox/수업 |
| 취소 요청 | `#B5612F` | `#FBF3E9` | inbox |
| 예정 | `#6B785E` | `#EDF4E3` | 캘린더 1:1 |
| 2:1 | `#5C7286` | `#E7EDF2` | 팀 |
| 완료 | `#8FA187` | `#EDF4E3` | 출석완료 |
| 취소 | (muted) | `#EDF4E3` | 수업취소 |
| 응답 대기 | `#9A7B2E` | `#F3EAD2` | 보낸요청 |
| 대표 | `#8A6F3E` | `#F4EEE3` (왕관+) | owner |
| 강사 | `#5C9166` | `#E4EFE3` | trainer |
| 초대 대기 | `#9A7B2E` | `#F3EAD2` | 미설정 강사 |
| 잔여/D-9 필(헤더) | `#5B6452` | `#EDF4E3` (티켓+) | 회원 캘린더 |
| 추천 | `#FAF8F4` | `#768C6A` | 회원권 상품 |

### 세그먼트 토글(받은/보낸 요청, 결제수단, 성별)
2~3분할 `flex1 center pad9~11/0 radius11~12`. 선택 `700 sage채움 역상` / 비선택 `600 #847A66 bg#F8F4EC`.

### 라디오/체크 셀렉터 (출석방식·시간슬롯·회원권)
- 선택: 행 `bg#EDF4E3 border1.5px#768C6A`, 도트 `원 sage채움 + check-bold 역상`.
- 비선택: 행 `bg#fff border1px rgba(75,59,46,.08~.1)`, 도트 `원/사각 border2px#D6CFC2 빈칸`.
- 슬롯 체크박스는 `radius6 사각`, 출석/회원권은 `원`.

### 입력 / 폼 행
표시용(프로토타입): `flex gap10~11 pad13~15/15~16 radius12~13 bg#fff border1px rgba(75,59,46,.12)` + 좌측 sage 아이콘 + 값 텍스트. 실제 구현은 `<input>`로 교체. placeholder색 `#B3AA9C`.

### 채팅 입력 `.cinput` / `.sendbtn`
- `.cinput` `flex1 h40 radius20 bg#fff border1px rgba(75,59,46,.12) pad0/16 font:500 13.5px`. focus 보더 `#A9B89B`.
- `.sendbtn` `40 원형`. 활성 `bg#768C6A 역상`, 비활성 `bg#E4DFD2 color#B3AA9C` (draft 비었을 때). + 첨부버튼 38원형 흰.

### 캘린더 그리드
`.card` 안. 헤더 `chevron-left(muted) · "2026년 6월"(700 15px) · chevron-right(sage)`. 요일행 7열(일=`#C0796A`, 토=`#7E9A87`, 평일=`#A89F92`). 날짜 `grid 7col auto-rows36px`. 각 칸: 숫자(선택=30원형 sage채움 역상 / 일요일=red / 평일=ink-row) + 점(`4px sage원 bottom5`, 수업있는 날).

### 막대 차트(실적 주간)
6막대 `flex column end gap6`, 막대 `width100% h<px> bg#EAF0E0 radius5` (강조 1개 `#768C6A`), 라벨 10px. 높이로 값 표현(픽셀).

### 통계 카드(분할)
`.card flex`, 각 컬럼 `flex1 center`: serif 대수치 + 11px 라벨. 사이 `1px rgba(75,59,46,.08)` 디바이더.

### 정보 배너 (인라인 안내)
- 중립: `bg#F8F4EC` + circle-info(`#A89F92`) + muted 텍스트.
- 경고: `bg#FBF3E9` + circle-info/triangle-exclamation(`#C67352`) + `#9A7B66`.
- 강조(긍정): `bg#EDF4E3` + circle-info(`#6B785E`) + `#5B6452`.
- 2:1 팀: `bg#E7EDF2` + persons-fill(`#5C7286`) + `#48586A`.
- 대표 전용: `bg#F4EEE3` + crown-fill(`#8A6F3E`) + `#5B4B38`.

### 빈 상태
중앙 정렬: 원형 아이콘 배경(`68~76px`, `#F1ECE2` 또는 `#EDF4E3`) + 아이콘(calendar/circle-check, `#B3AA9C`/`#9DB089`) + 제목 700 15~17px + 설명 단락(max-width 210~230).

### 토스트
절대배치 `bottom36 중앙 z20`, `bg#26231E radius14`, circle-check-fill(`#9DB089`) + `600 13px#FAF8F4`. `toastIn` 진입, 1.9s 후 자동 소멸.

### 아이콘 `<pt-icon name size>`
24px viewBox, `currentColor`, monoline + `-fill` 페어. **전체 81개:**
`calendar-fill, login, mobile, lock-fill, lock, send, home, home-fill, calendar, calendar-person, clock, clock-fill, bell, bell-fill, person, person-fill, persons, persons-fill, person-plus, ticket, ticket-fill, coins, coins-fill, chevron-right, chevron-left, chevron-down, chevron-up, check, check-bold, circle-check, circle-check-fill, circle-close, plus, plus-bold, close, search, fire, fire-fill, heart, heart-fill, star, star-fill, trophy, trophy-fill, pencil, pencil-fill, write, location-fill, sparkle, sparkle-fill, refresh, megaphone, megaphone-fill, tune, setting, filter, more-horizontal, more-vertical, arrow-right, arrow-up-right, crown, crown-fill, medal, certificate, dot, play, pause, camera, camera-fill, document-text, list, tag, tag-fill, verified-check-fill, circle-info, circle-exclamation, triangle-exclamation, phone, phone-fill, message, message-fill`.

---

## C. 화면 인벤토리 (핵심)

> 상태 머신: `state.screen` 문자열 1개가 활성 화면을 결정. `renderVals()`가 `s_<name>` 불리언 플래그(`S(id)`)로 각 `<sc-if>` 블록을 토글. 내비: `go(to)`(히스토리 push), `back()`(pop, 빈 경우 role별 홈), `tab(to)`(히스토리 리셋). `role` ∈ {`member`,`trainer`,`owner`}. `isOwner = role==='owner'`, `isTrainer = role==='trainer'`. **실적 탭·설정 운영메뉴는 owner 전용.**

### 온보딩 (전 역할 공통)

**1. `s_start` — 시작 / 역할 선택**
- 중앙: 브랜드마크 이미지(`assets/brand-mark.png` 96×96) + "계절 PT & 필라테스"(700 22px) + serif italic "Balance, consistently"(19px `#8FA187`) + "균형 있게, 꾸준하게"(13.5px muted).
- 하단: `.pbtn` person "회원으로 로그인" → `goMemberLogin`; `.obtn` persons "트레이너로 로그인" → `goTrainerLogin`; "홈 화면에 추가…" 안내(plus 아이콘).

**2. `s_loginMember` — 회원 로그인**
- 제목 25px + 설명. 아이디=휴대폰(010-2345-6789, mobile 아이콘), 비번=생년월일 6자리(••••••, lock, "YYMMDD"). info배너(`#F8F4EC`).
- 푸터 `.pbtn` "로그인" → `doMemberLogin`(→`enterApp('member')` → `mCalendar`). 하단 "비밀번호 변경하기"(비동작 링크).

**3. `s_loginTrainer` — 트레이너 로그인**
- 아이디(gyeaul.master) + 비번(••••••••, "표시"). 링크: "강사 첫 로그인" → `goInstrLogin`, "대표 트레이너 가입하기" → `goSignupOwner`. `.pbtn` → `doTrainerLogin`(→`enterApp('trainer')`).

**4. `s_signupOwner` — 대표 가입**
- 대표 배너(crown-fill 골드). 아이디·비번·비번확인(체크표시). `.pbtn` "대표로 시작하기" → `doOwnerSignup`(→`enterApp('owner')`).

**5. `s_loginInstr` — 강사 첫 로그인**
- 아이디(gyeaul.sumin) + 임시비번(ptss-4821, terracotta lock). 경고배너(`#FBF3E9`). `.pbtn` "로그인" → `goSetPw`.

**6. `s_setPw` — 비밀번호 설정**
- lock-fill 아이콘칩(`#EDF4E3`). 새 비번 + 확인(체크). 규칙체크리스트(8자 이상 / 영문+숫자, circle-check-fill sage). `.pbtn` "비밀번호 설정 완료" → `doSetPw`(토스트 후 `enterApp('trainer')`).

### 트레이너 메인 (탭)

**7. `s_calendar` — 캘린더(트레이너 메인)** · 탭1
- 헤더: 좌측 `{{todayDateLabel}}`("6월 21일 토요일") + `{{meName}} {{meRole}}`("김계절 대표/트레이너"). 우측: refresh 버튼(→`goInbox`, `hasInbox`이면 `inboxCount`=3 terracotta 뱃지) + setting 버튼(→`goSettings`).
- 만료 배너(`#FBF3E9`, megaphone-fill): "만료 임박 회원 {{expiringCount}}명 · 재등록 안내" → `goRetention`.
- 캘린더 카드(`calDays`: n/numStyle/dot/pick). 점 표시 날짜집합 `{2,4,6,9,12,16,17,19,21,23,26}`, 일요일 `{1,8,15,22,28}`. 선택일 기본 21.
- `.kick` "{{selDateLabel}} · 수업 {{trainerDayCount}}".
- 수업 리스트 `trainerDayClasses`(선택일 요일의 정기수업): 바색(완료 sage/취소 muted/팀 blue/1:1 sage) + 시각 + 이름·1:1/2:1 + (오늘&미처리면 출석버튼 → `attend`/`openAttendFor`) 또는 뱃지(예정/완료/취소/2:1). 행 클릭: 이지수→`classDetail`, 그외→`openMember`.
- 빈 상태(`trainerDayEmpty`): "예정된 수업이 없어요".
- 탭바(실적은 owner만).

**8. `s_members` — 회원 관리** · 탭2
- 제목 "회원 관리". 통계카드 3분할: 담당회원 `{{totalMembers}}`=24, 만료임박 `{{expiringCount}}`(terracotta), 휴회 2.
- 검색바(표시용, search 아이콘). 필터칩 `filterChips`(전체/만료임박/활성/휴회, `filter` state, 만료임박은 terracotta 스타일).
- 리스트 `membersList`(필터 적용; 휴회는 빈배열): 아바타(팀=더블) + 이름 + sub("2:1 · 요일·시각 · 잔여 N회") + 뱃지(badgeFor) + chevron. 클릭 → `openMember(id)`.
- 탭바.

**9. `s_perf` — 실적** · 탭4 · **owner 전용**
- 헤더 "2026년 6월 / 내 실적" + setting.
- 매출 카드(sage `#768C6A`): "이번 달 매출 기여" + serif `₩5,800,000` + `+8%`(arrow-up-right). *주의: 운영 정책상 매출/가격 노출 여부는 오너 결정사항(돈 미추적 방침). 디자인엔 존재.*
- 통계 3카드: 수업수84 / 담당회원24 / 출석률96%.
- 주간 수업 차트(막대, 21타임, 토 강조).
- 재등록 전환 배너(`#FBF3E9`) → `goRetention`("만료 임박 {{expiringCount}}명 · 예상 ₩4.2M").
- 탭바(실적 활성).

### 출석 / 기록

**10. `s_attend` — 출석 체크 / 차감**
- 헤더 "출석 체크". 회원 카드(아바타 팀=더블, 이름, `attendMeta`=PT종류·시각·잔여).
- 2:1면 안내배너(`#E7EDF2`).
- `.kick` "처리 방식" + 3 라디오: 출석(기본)/노쇼/수업취소(미차감). `attendMethod` state. 라벨은 팀이면 "팀 출석/노쇼".
- 차감 후 잔여 카드: `{{attendRemaining}}` → `{{afterRemaining}}`(취소면 동일).
- 푸터 `.pbtn` `{{attendCta}}` → `confirmAttend`(차감 적용 + 토스트 + `tab('calendar')`). "모든 차감·정정은 이력에 자동 기록".

**11. `s_record` — 운동 기록**
- 헤더: close(→back) + "운동 기록" + "저장"(→`saveRecord`). 회원칩(이지수, 6월21일·1:1 PT).
- 종목 리스트 `exercises`(name/kg/sets): 스테퍼 kg(±5)·세트(±1) `step()`. "종목 추가"(점선, `addExercise`). 코멘트 영역(표시용).
- 푸터 `.pbtn` "기록 저장" → `saveRecord`(토스트 + `tab('calendar')`).

### 회원 상세 / 재등록

**12. `s_memberDetail` — 회원 상세**
- 헤더 "회원 상세". 프로필 행(아바타 팀=더블 + 이름 + 뱃지 + "{{selTypeLabel}} · 잔여 {{selRemaining}}회").
- 2:1이면 안내배너.
- 회원권 카드(sage): "1:1 PT 20회권" + D-뱃지(clock) + serif `{{selRemaining}}` / 20회 + 진행바(`pt-grow`, `selBarStyle` 골드 `#F0E0C8`) + 시작/만료일.
- 체성분 카드 3분할(58.2 체중 / 32.0 골격근 / 22.1 체지방).
- 정기수업 행(`{{selSchedule}}`). 부상 경고배너(triangle-exclamation, "오른쪽 어깨 회전근…").
- 푸터: `.obtn` pencil "기록"(→`goRecord`) + `.pbtn` refresh "재등록 안내"(→`goRetention`).

**13. `s_retention` — 재등록 관리**
- 헤더 "재등록 관리". 요약카드(sage, megaphone-fill): "이번 주 만료 {{expiringCount}}명 / 예상 재등록 매출 ₩4.2M".
- 리스트 `retentionList`(expiring 회원): 아바타 + 이름·잔여 + 상태("D-N · 안내 전/완료") + 버튼(미안내=알림톡 sage채움 message-fill / 안내됨=상담 아웃라인). action: `guide(id)` / 상담 토스트.
- 푸터 `.pbtn` megaphone "안내 전 {{pendingCount}}명 일괄 발송" → `sendAllAlim`.

### 일정 조율 (트레이너)

**14. `s_classDetail` — 수업 상세(조율 진입)**
- 헤더 "수업 상세". 회원 카드(이지수, "예정" 뱃지, 잔여 `{{ijiRemaining}}`회) + 일시칩.
- `.kick` "일정 조율" + 카드 내 2행: "일정 변경 요청"(refresh, `#EDF4E3`) → `goPropose`; "수업 취소 요청"(close, `#FBF3E9`) → `cancelClass`(토스트).
- info배너("24시간 전까지"). 푸터 `.pbtn` "출석 체크" → `openAttend`(`openAttendFor('iji')`).

**15. `s_propose` — 변경 제안 보내기**
- 헤더 "일정 변경 요청". 변경 전 칩(취소선 6/21 토 7:00, 이지수) + chevron-down.
- `.kick` "새 시간 제안 · 최대 3개" + `proposeSlotsView`(체크박스 슬롯, `toggleSlot`).
- `.kick` "사유 (선택)" + `reasons` 칩(개인 일정/시설 점검/직접 입력).
- 푸터 `.pbtn` send `{{proposeSendCta}}`("변경 요청 보내기 · N개 제안") → `sendPropose`(토스트 + `tab('calendar')`).

**16. `s_inbox` — 조율 인박스**
- 헤더 "일정 조율" + 받은요청 카운터(terracotta). 세그먼트 토글: "받은 요청 {{receivedCount}}" / "보낸 요청 1"(`inboxTab`).
- 받은(`inboxReceived`): 빈상태(`inboxEmpty`, circle-check) 또는 `requestsList` 카드들 — 아바타+이름+ago+타입뱃지(변경/취소), 변경=before→after 칩, 취소=detail 배너, 버튼 거절/수락(`rejectReq`/`acceptReq`). 수락+변경이면 → `confirm`.
- 보낸(`inboxSent`): 고정 1건(이지수 6/21→6/22, "응답 대기").

**17. `s_confirm` — 변경 확정(성공)**
- 중앙: sage 원 + check-bold(`pt-pop`, sage glow). "일정이 변경되었어요" + 설명.
- 카드: 변경 전(취소선) → 변경 후(`confirmBefore/After`). 잔여 유지 배너(ticket-fill).
- 푸터: `.obtn` "캘린더에서 보기"(→`goCalendarFromConfirm`) + `.pbtn` "확인"(→`confirmDone`, role별 홈).

### 설정 / 대표 운영 (대부분 owner 전용)

**18. `s_settings` — 설정**
- 헤더 "설정". 프로필 카드(아바타 계, 이름 + 대표/강사 뱃지 조건부, "계절 PT & 필라테스").
- **owner만**: `.kick` "운영 관리 · 대표 전용" + `settingsItems` 카드(강사 관리→`instrManage`(강조행), 회원 등록→`memberRegister`, 회원권 발급→`issueMembership`, 노쇼·취소 정책→토스트, 알림 설정→토스트). *주: owner.png 스크린샷은 "회원 명단 관리·엑셀로 가져오기"였으나 현 HTML은 "회원 등록·신규 회원 추가" — HTML이 권위.*
- **trainer만**: 잠금 안내배너("운영 메뉴는 대표만").
- `.kick` "계정" + 로그아웃 행(login 아이콘, `#FBF3E9`) → `logout`(→`start`).

**19. `s_instrManage` — 강사 관리** · owner 전용
- 헤더 "강사 관리" + 대표 안내배너. 리스트 `instructors`(김계절 대표·나/이수민 강사/박지훈 강사/정하늘 초대대기): 아바타 + 이름 + role뱃지 + sub. 클릭 → `goInstrInvite`.
- 푸터 `.pbtn` person-plus "강사 초대" → `goInstrInvite`.

**20. `s_instrInvite` — 강사 초대** · owner 전용
- 헤더 "강사 초대" + 설명. 강사 이름(정하늘) + 연락처. `.kick` "발급되는 계정" 카드(아이디 gyeaul.haneul / 임시비번 ptss-7390). info배너.
- 푸터 `.pbtn` "강사 계정 발급" → `issueInstr`(토스트 + back).

**21. `s_issueMembership` — 회원권 발급** · owner 전용
- 헤더 "회원권 발급". 회원 칩(이지수). `.kick` "회원권 상품" 3옵션(10회권 ₩750,000 / **20회권 추천** ₩1,400,000 선택 / 30회권 ₩1,980,000). 기간 카드("시작 6/22 · ~9/22, 잔여 20회 자동 생성").
- 푸터 `.pbtn` ticket-fill "발급하고 결제 기록" → `doIssueMembership`(→`paymentRecord`).

**22. `s_paymentRecord` — 결제 기록** · owner 전용
- 헤더 "결제 기록". 요약 카드(이지수·20회권 ₩1,400,000). 결제수단 세그먼트(현금/**카드**/계좌). 결제일(06.22) + 금액. info배너("PG 연동 전, 수기 기록").
- 푸터 `.pbtn` "결제 완료 기록" → `doPayment`(토스트 + `tab('calendar')`).

**23. `s_memberRegister` — 회원 등록** · owner 전용
- 헤더 "회원 등록". 이름(윤서아) / 연락처=아이디 / 생년월일=초기비번(YYMMDD) / 성별 세그먼트 / 담당 트레이너 드롭다운(김계절).
- `.kick` "정기 수업 요일" 칩 `regDayChips`(일~토, `toggleRegDay`) + 시간행(`cycleRegTime`, `{{regTime}}` + `{{regSummary}}`). info배너("매주 같은 요일·시간 자동 생성").
- 푸터 `.pbtn` person-plus "회원 등록" → `doRegisterMember`(토스트 + `tab('calendar')`).

### 회원 앱 (탭)

**24. `s_mCalendar` — 회원 캘린더(메인)** · 회원 탭1
- 헤더: "내 일정 / 이지수 님" + 잔여 필("잔여 3 · D-9", ticket-fill, `#EDF4E3`).
- `mHasTrainerReq`이면 변경요청 배너(`#FBF3E9`, refresh) → `mOpenReceive`.
- 캘린더 카드 `mCalDays`(로그인 회원=이지수 정기일 점). 선택일 기본 21.
- 라벨 행: `{{mSelDateLabel}}` + "정기 수업 매주 수·토"(범례 점).
- `mDayHasClass`: 수업 카드("1:1 PT · {{mTimeLabel}}", 김계절, "변경" 필 refresh) → `mOpenRequest`. `mDayNoClass`: 빈상태.
- 탭바: 캘린더/채팅(미읽음 `mChatUnread`)/마이(→토스트).

**25. `s_mReceive` — 회원: 변경요청 수신**
- 헤더 "일정 변경 요청". 트레이너 행(김계절, "10분 전"). 변경 전 칩(취소선) + 사유. `.kick` "제안된 시간 · 하나를 선택" + 2 라디오(6/22 선택 / 6/23).
- 푸터 `.pbtn` "이 시간으로 변경"(→`acceptChange`→`confirm`) + "다른 시간 제안"(→`mOpenRequest`) + "거절하기"(→`rejectChange` 토스트).

**26. `s_mRequest` — 회원: 변경·취소 요청**
- 헤더 "일정 변경 · 취소". 수업 카드(날짜박스 토21 + 1:1 PT 7:00 + 김계절). 방식 2분할(시간 변경 선택 / 수업 취소). `.kick` "원하는 시간" 2 라디오. info배너("24시간 전 무료").
- 푸터 `.pbtn` send "변경 요청 보내기" → `sendMemberRequest`(토스트 + `tab('mCalendar')`).

### 채팅 (트레이너 + 회원 공용 구조)

**27. `s_chatList` — 트레이너: 채팅 목록** · 트레이너 탭3
- 헤더 "채팅" + 담당회원 필(persons, `{{totalMembers}}`). 리스트 `chatThreads`(`chatOrder`): 아바타(팀=더블+2:1뱃지) + 이름 + preview("나: "/이름 접두) + 시각 + 미읽음 뱃지. 클릭 → `openRoom(id)`(미읽음 0 처리).
- 탭바(채팅 활성).

**28. `s_chatRoom` — 트레이너: 채팅방**
- 상단바: back + 아바타(팀=더블) + 제목/2:1뱃지 + `{{roomSub}}`. 본문 `chatRef`(자동 스크롤): 팀이면 안내칩 + 날짜칩 + `roomMsgs`(내꺼=sage 우측 / 상대=흰 좌측, 팀이면 발신자 이름 표시).
- 하단 입력바: + 버튼 + `.cinput`(`draft`, Enter=전송) + `.sendbtn`(`sendBtnStyle` 활성/비활성). `sendChat`.

**29. `s_mChat` — 회원: 트레이너 채팅**
- 거의 동일하나 상대=김계절 트레이너 고정, "담당 트레이너와만 대화" 잠금칩. viewer=`iji`. `mOpenChat`로 진입(미읽음 0).

### 오버레이
- **토스트** `hasToast`/`toast` — 모든 화면 위 절대배치.

---

## D. 내비게이션 / 상태 그래프

```
start ──goMemberLogin──▶ loginMember ──doMemberLogin──▶ [member] mCalendar
      ──goTrainerLogin─▶ loginTrainer ─┬─doTrainerLogin─▶ [trainer] calendar
                                       ├─goSignupOwner──▶ signupOwner ─doOwnerSignup─▶ [owner] calendar
                                       └─goInstrLogin───▶ loginInstr ─goSetPw─▶ setPw ─doSetPw─▶ [trainer] calendar
```

**탭(히스토리 리셋, `tab()`):**
- 트레이너/대표: calendar ↔ members ↔ chatList ↔ (owner) perf.
- 회원: mCalendar ↔ mChat ↔ (마이=토스트).

**드릴다운(`go()`, 히스토리 push → `back()` pop):**
- calendar → inbox / settings / retention / classDetail(이지수) / openMember / attend.
- members → memberDetail → (record / retention).
- perf → settings / retention.
- classDetail → propose / attend.
- inbox: 수락+변경 → confirm.
- settings(owner) → instrManage → instrInvite; → memberRegister; → issueMembership → paymentRecord.
- mCalendar → mReceive / mRequest; mReceive → confirm / mRequest.

**성공/토스트 종료점:**
- `confirm`(전체 화면 성공) ← 변경 수락/회원 변경 수락. `confirmDone`/`goCalendarFromConfirm` → role 홈.
- 토스트(자동소멸) ← 출석/기록/제안발송/회원등록/결제/강사발급/거절/일괄발송 등 — 대부분 직후 `tab(홈)`.

**back() 기본값:** 히스토리 비면 role==member ? `mCalendar` : `calendar`.
**logout:** role/history/attended 초기화 → `start`.

---

## E. 데이터 요구사항 (UI 추론)

| 화면 | 필요 백엔드 데이터 |
|---|---|
| 로그인/가입 | 회원=전화번호+생년월일(초기PW); 트레이너=아이디+PW; 강사 임시PW; 대표 가입; 비번 재설정(8자+영문/숫자) |
| calendar(트레이너) | 오늘/선택일, 트레이너 본인(이름·role), 미처리 조율요청 수(inboxCount), 만료임박 수, 월 캘린더(수업있는 날 dot), 선택일 정기수업 목록(시각·회원·1:1/2:1·출석상태) |
| members | 담당회원 수·만료임박 수·휴회 수; 회원 목록(이름·이니셜·아바타색·잔여·D-day·status active/expiring/rest·정기요일/시각·2:1여부·페어) |
| perf(owner) | 월 매출 기여(+증감%)·수업수·담당회원·출석률·주간 수업 분포·만료임박/예상매출 |
| attend | 대상 회원(이름·PT종류·시각·잔여·팀여부); 처리(attend/noshow/cancel)→잔여 차감; 이력 기록 |
| record | 회원·수업일·종목 목록(name/kg/sets)·코멘트 저장 |
| memberDetail | 회원권(상품명·잔여/총·시작/만료·진행%·D-day)·체성분(체중/골격근/체지방)·정기수업·부상 메모 |
| retention | 만료임박 회원(잔여·D-day·안내여부 guided)·알림톡 발송·일괄발송·예상매출 |
| classDetail/propose/inbox/confirm | 수업(회원·일시)·변경/취소 요청(before/after/사유/타입/시각)·받은/보낸 인박스·수락 시 캘린더 반영(차감 없음) |
| settings/instrManage/instrInvite | 본인 role; 강사 목록(이름·role·담당수·pending)·강사 발급(아이디/임시PW) |
| issueMembership/paymentRecord | 회원권 상품(회수·가격·추천)·유효기간 자동계산·결제(수단/일/금액) 수기 기록 *(가격 노출은 운영 정책 확인 필요)* |
| memberRegister | 이름·연락처(아이디)·생년월일(초기PW)·성별·담당 트레이너·정기 요일/시간(자동 수업 생성) |
| mCalendar/mReceive/mRequest | 회원 잔여·D-day·정기수업·트레이너 변경요청(수신)·제안 시간 후보·24h 무료 규칙 |
| chat | 스레드 목록(상대·아바타·2:1·미읽음·마지막메시지·시각); 방 메시지(from/text/time, 팀=발신자 구분)·전송·자동스크롤·미읽음 클리어 |

---

## 부록 — 시드 데이터(프로토타입 기본값, 참조)

- **회원 5:** 정민호(정,잔1,D-3,expiring,화목18시), 박서연(박,잔2,D-5,expiring,guided,월수19시), 이지수(이,gold #A88B57,잔3,D-9,expiring,수토19시), 한지우(한,잔12,active,월금20시), 팀 윤지아·강민(2:1,잔8,active,화토20시, bg/bg2 sage/gold).
- **조율 요청 3:** 박서연(변경 6/20→6/22), 정민호(취소 6/19 출장), 이지수(변경 6/21→6/22).
- **강사 4:** 김계절(대표·나·24명), 이수민(강사·12명), 박지훈(강사·9명), 정하늘(초대대기).
- **운동 종목:** 바벨 스쿼트(40kg×5), 루마니안 데드리프트(35kg×4); ±는 kg5/세트1 단위.
- **정기시간 옵션:** 18/19/20/21시 순환. 캘린더 점 날짜집합·일요일집합은 §C-7 참조.
