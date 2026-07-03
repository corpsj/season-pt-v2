-- 0022: 개발자 관리용 대표(부트스트랩 admin)와 실제 스튜디오 대표를 구분.
-- 최초 '대표 회원가입' 메뉴/자가가입은 '실제 대표(비-admin owner)'가 아직 없을 때만 열린다.
-- 지금 존재하는 대표 = 개발자 관리 계정이므로 admin으로 표식 → 그 계정 때문에 메뉴가 닫히지 않게 한다.
-- (단일 스튜디오라 admin·실대표는 같은 데이터를 자동 공유. 플래그는 가입 게이트에만 영향, 권한은 role=owner 그대로.)

alter table trainers add column if not exists bootstrap_admin boolean not null default false;

update trainers set bootstrap_admin = true where role = 'owner';
