// Synthetic DB only: defaults to PGlite; explicit localhost spt_qa_ PostgreSQL mode supports independent connection tests.
import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
const pgUrl = process.env.CLASS_WORKFLOW_TEST_DB_URL;
let Client;
let db;
if (pgUrl) {
  const target = new URL(pgUrl);
  if (!['127.0.0.1','localhost'].includes(target.hostname) || !target.pathname.startsWith('/spt_qa_') || process.env.CLASS_WORKFLOW_QA_ALLOW_RESET !== '1') throw new Error('Only explicitly approved localhost spt_qa_ databases are allowed');
  const module = await import(pathToFileURL(process.env.CLASS_WORKFLOW_PG_MODULE || '/tmp/season-pt-release/tools/node_modules/pg/lib/index.js').href);
  Client = (module.default ?? module).Client;
  const client = new Client({connectionString:pgUrl});await client.connect();
  db = {query:(text,args)=>client.query(text,args),exec:(text)=>client.query(text),close:()=>client.end()};
} else {
  const path=process.env.PGLITE_MODULE_PATH||'/tmp/season-pt-qa/node_modules/@electric-sql/pglite/dist/index.js';
  const {PGlite}=await import(pathToFileURL(path).href);db=new PGlite();
}
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const owner = id(1),
  coach = id(2),
  other = id(3),
  member = id(11),
  partner = id(12),
  session = id(21),
  second = id(22),
  membership = id(31);
const sql = (text, args = []) => db.query(text, args);
const rows = async (text, args = []) => (await sql(text, args)).rows;
const attendanceWith = async (client,{
  s=session,actor=coach,action='attend',version=0,op=randomUUID(),versions=null,free=false,reason='정정 시험',
}={}) => (await client.query('select class_attendance_atomic($1,$2,$3,$4,$5,$6,$7,$8,$9) result',[s,actor,action,version,op,'data:image/png;base64,c3ludGhldGlj',versions,free,reason])).rows[0].result;
const attendance=(options)=>attendanceWith(db,options);
const draft = async ({
  m = member,
  actor = coach,
  version = 0,
  exercises = [],
  comment = "",
} = {}) =>
  (
    await rows("select save_class_workout_draft($1,$2,$3,$4,$5,$6) result", [
      session,
      m,
      actor,
      version,
      JSON.stringify(exercises),
      comment,
    ])
  )[0].result;
before(async () => {
  if(pgUrl) await db.exec("drop schema if exists public cascade; create schema public; drop schema if exists auth cascade;");
  await db.exec(
    "create schema auth; create table auth.users(id uuid primary key); do $$ begin create role authenticated; exception when duplicate_object then null; end $$; do $$ begin create role service_role; exception when duplicate_object then null; end $$; create function auth.uid() returns uuid language sql as $$ select null::uuid $$;",
  );
  await db.exec('grant usage on schema public to authenticated, service_role');
  for (const name of [
    "0001_v2_foundation",
    "0002_revenue",
    "0003_ops",
    "0005_membership_lifecycle",
    "0008_membership_pause",
    "0014_trainer_rates",
    "0016_ledger_membership",
    "0019_session_signature",
    "0023_request_seen",
    "0026_schedule_request_integrity",
    "0027_class_workflow",
  ]) {
    let source = await readFile(
      new URL(`../../supabase/migrations/${name}.sql`, import.meta.url),
      "utf8",
    );
    source = source.replace("create extension if not exists pgcrypto;", "");
    await db.exec(source);
  }
});
beforeEach(async () => {
  await db.exec("truncate trainers,members cascade");
  await sql(
    "insert into trainers(id,username,display_name,role) values ($1,'fixture-owner','합성 대표','owner'),($2,'fixture-coach','합성 강사','instructor'),($3,'fixture-other','다른 합성 강사','instructor')",
    [owner, coach, other],
  );
  await sql(
    "insert into members(id,name,phone,birthdate,password_hash) values($1,'합성 회원 A','fixture-a','2000-01-01','not-a-real-password'),($2,'합성 회원 B','fixture-b','2000-01-01','not-a-real-password')",
    [member, partner],
  );
  await sql(
    "insert into sessions(id,trainer_id,scheduled_at) values($1,$3,now()-interval '1 hour'),($2,$3,now()-interval '2 hours')",
    [session, second, coach],
  );
  await sql("insert into session_members values($1,$3),($2,$3)", [
    session,
    second,
    member,
  ]);
  await sql(
    "insert into memberships(id,member_id,product,total_sessions,remaining_sessions,start_date,end_date) values($1,$2,'합성 상품',10,2,current_date-1,current_date+30)",
    [membership, member],
  );
  await db.exec(
    "update studio_settings set cancel_cutoff_hours=12,noshow_deducts=true where id=1",
  );
});
after(async () => {
  await db.close();
});

test("duplicate/retried completion deducts once; stale retry after correction does not re-complete", async () => {
  const op = randomUUID();
  const first = await attendance({ op });
  assert.equal(first.status, "ok");
  assert.equal((await attendance({ op })).replayed, true);
  assert.equal(
    (
      await rows("select remaining_sessions n from memberships where id=$1", [
        membership,
      ])
    )[0].n,
    1,
  );
  const correction = randomUUID();
  assert.equal(
    (await attendance({ action: "revert", version: 1, op: correction })).status,
    "ok",
  );
  assert.equal(
    (await attendance({ action: "revert", version: 1, op: correction }))
      .replayed,
    true,
  );
  assert.equal((await attendance({ op })).status, "stale");
  assert.equal(
    (
      await rows("select remaining_sessions n from memberships where id=$1", [
        membership,
      ])
    )[0].n,
    2,
  );
  const ledger = await rows(
    "select reversed_at,reversal_reason from attendance_ledger where session_id=$1",
    [session],
  );
  assert.equal(ledger.length, 1);
  assert.ok(ledger[0].reversed_at);
  assert.equal(ledger[0].reversal_reason, "정정 시험");
});
test("simultaneously submitted last-credit requests: one debit, one rejected; PGlite serializes requests", async () => {
  await sql("update memberships set remaining_sessions=1 where id=$1", [
    membership,
  ]);
  const result = await Promise.allSettled([
    attendance(),
    attendance({ s: second }),
  ]);
  assert.equal(
    result.filter((r) => r.status === "fulfilled" && r.value.status === "ok")
      .length,
    1,
  );
  assert.equal(
    result.filter(
      (r) =>
        r.status === "rejected" &&
        r.reason.message.includes("insufficient_credit"),
    ).length,
    1,
  );
  assert.equal(
    (
      await rows("select remaining_sessions n from memberships where id=$1", [
        membership,
      ])
    )[0].n,
    0,
  );
  assert.equal(
    (
      await rows(
        "select count(*)::int n from sessions where status='scheduled'",
      )
    )[0].n,
    1,
  );
});
test("duet second-member failure rolls back first debit, session, and ledger", async () => {
  await sql("insert into session_members values($1,$2)", [session, partner]);
  await assert.rejects(attendance(), /insufficient_credit/);
  assert.equal(
    (
      await rows("select remaining_sessions n from memberships where id=$1", [
        membership,
      ])
    )[0].n,
    2,
  );
  assert.equal(
    (await rows("select count(*)::int n from attendance_ledger"))[0].n,
    0,
  );
  assert.equal(
    (await rows("select status from sessions where id=$1", [session]))[0]
      .status,
    "scheduled",
  );
});
test("cancel cutoff and reversal preserve exact original membership", async () => {
  const r = await attendance({ action: "cancel" });
  assert.equal(r.deductions[0].deducted, true);
  assert.equal(
    (await attendance({ action: "revert", version: 1 })).status,
    "ok",
  );
  await db.exec("update studio_settings set cancel_cutoff_hours=0 where id=1");
  assert.equal(
    (await attendance({ action: "cancel", version: 2 })).deductions[0].deducted,
    false,
  );
  assert.equal(
    (
      await rows("select remaining_sessions n from memberships where id=$1", [
        membership,
      ])
    )[0].n,
    2,
  );
});
test("existing cancellation request RPC interoperates with retained ledger and state version", async () => {
  const request = randomUUID();
  await sql(
    "insert into schedule_change_requests(id,session_id,requester_type,requester_id,type,original_at) select $1,id,'member',$3,'cancel',scheduled_at from sessions where id=$2",
    [request, session, member],
  );
  await sql(
    "select accept_cancel_request_atomic($1,$2,(select scheduled_at from sessions where id=$2),true,$3)",
    [request, session, coach],
  );
  assert.equal(
    (await attendance({ action: "revert", version: 1 })).status,
    "ok",
  );
  assert.equal(
    (
      await rows("select remaining_sessions n from memberships where id=$1", [
        membership,
      ])
    )[0].n,
    2,
  );
});
test("foreign coach, member id, inactive and setup-only trainer cannot mutate", async () => {
  assert.equal((await attendance({ actor: other })).status, "forbidden");
  assert.equal((await attendance({ actor: member })).status, "forbidden");
  assert.equal((await draft({ m: id(99) })).status, "forbidden");
  await sql("update trainers set status='inactive' where id=$1", [coach]);
  assert.equal((await draft()).status, "forbidden");
  await sql(
    "update trainers set status='active',must_change_password=true where id=$1",
    [coach],
  );
  assert.equal((await attendance()).status, "forbidden");
  assert.equal((await draft({ actor: owner })).status, "ok");
});
test("draft CAS, lost-response retry, member isolation, and legacy JSON round-trip", async () => {
  const legacy = [{ name: "합성 스쿼트", kg: 22.5, reps: 10, sets: 3 }];
  assert.equal((await draft({ exercises: legacy })).version, 1);
  assert.equal((await draft({ exercises: legacy })).version, 1);
  assert.equal((await draft({ comment: "old tab" })).status, "conflict");
  assert.equal(
    (await rows("select exercises from class_workout_drafts"))[0].exercises[0]
      .kg,
    22.5,
  );
  const result = (
    await rows("select publish_class_workouts($1,$2,$3) result", [
      session,
      coach,
      JSON.stringify({ [member]: 1 }),
    ])
  )[0].result;
  assert.equal(result.status, "ok");
  assert.deepEqual(
    (await rows("select exercises from workout_records"))[0].exercises,
    legacy,
  );
});
test("publishing member-specific drafts twice does not duplicate or mix duet records", async () => {
  await sql("insert into session_members values($1,$2)", [session, partner]);
  await draft({ comment: "A 기록" });
  await draft({ m: partner, comment: "B 기록" });
  for (let i = 0; i < 2; i++)
    await sql("select publish_class_workouts($1,$2,$3)", [
      session,
      coach,
      JSON.stringify({ [member]: 1, [partner]: 1 }),
    ]);
  const records = await rows(
    "select member_id,comment from workout_records order by member_id",
  );
  assert.equal(records.length, 2);
  assert.equal(records[0].comment, "A 기록");
  assert.equal(records[1].comment, "B 기록");
});
test("draft conflict during completion rolls back debit and publication", async () => {
  await draft({ comment: "newer draft" });
  await assert.rejects(
    attendance({ versions: JSON.stringify({ [member]: 0 }) }),
    /draft_conflict/,
  );
  assert.equal(
    (
      await rows("select remaining_sessions n from memberships where id=$1", [
        membership,
      ])
    )[0].n,
    2,
  );
  assert.equal(
    (await rows("select count(*)::int n from workout_records"))[0].n,
    0,
  );
});
test("free exception must be explicit; paused/expired entitlement never silently authorizes it", async () => {
  await sql("update memberships set remaining_sessions=0 where id=$1", [
    membership,
  ]);
  await assert.rejects(attendance(), /insufficient_credit/);
  assert.equal(
    (await attendance({ free: true })).deductions[0].deducted,
    false,
  );
  await attendance({ action: "revert", version: 1 });
  await sql("update memberships set status='paused' where id=$1", [membership]);
  await assert.rejects(
    attendance({ free: true, version: 2 }),
    /insufficient_credit/,
  );
});
test("restore refuses refunded/transferred membership instead of inventing balance", async () => {
  await attendance();
  await sql(
    "update memberships set status='refunded',remaining_sessions=0 where id=$1",
    [membership],
  );
  await assert.rejects(
    attendance({ action: "revert", version: 1 }),
    /ineligible_restore/,
  );
  assert.equal(
    (await rows("select status from sessions where id=$1", [session]))[0]
      .status,
    "attended",
  );
  assert.equal(
    (await rows("select reversed_at from attendance_ledger"))[0].reversed_at,
    null,
  );
});
test("authenticated clients cannot execute service-only RPCs directly", async () => {
  await db.exec("set role authenticated");
  try {
    await assert.rejects(attendance(), /permission denied/);
  } finally {
    await db.exec("reset role");
  }
});
test("complete, correct, complete again keeps all audit events and returns current total balance", async () => {
  const first = await attendance();
  assert.equal(first.deductions[0].totalRemaining, 1);
  const restored = await attendance({ action: "revert", version: 1 });
  assert.equal(restored.deductions[0].totalRemaining, 2);
  const again = await attendance({ version: 2 });
  assert.equal(again.deductions[0].totalRemaining, 1);
  assert.equal(
    (await rows("select count(*)::int n from class_operations"))[0].n,
    3,
  );
  assert.equal(
    (
      await rows(
        "select count(*)::int n from attendance_ledger where reversed_at is null",
      )
    )[0].n,
    1,
  );
});
test("existing 60-minute reservation conflict guard rejects a 30-minute overlap, allows boundary", async () => {
  const at = (await rows("select now()+interval '1 day' as target_at"))[0]
    .target_at;
  assert.equal(
    (
      await rows(
        "select move_session_with_tombstone_atomic($1,(select scheduled_at from sessions where id=$1),$2,null) result",
        [session, at],
      )
    )[0].result,
    "ok",
  );
  assert.equal(
    (
      await rows(
        "select move_session_with_tombstone_atomic($1,(select scheduled_at from sessions where id=$1),$2::timestamptz+interval '30 minutes',null) result",
        [second, at],
      )
    )[0].result,
    "slot_conflict",
  );
  assert.equal(
    (
      await rows(
        "select move_session_with_tombstone_atomic($1,(select scheduled_at from sessions where id=$1),$2::timestamptz+interval '60 minutes',null) result",
        [second, at],
      )
    )[0].result,
    "ok",
  );
});
test('reapplying additive migration preserves saved drafts, balances and audit rows',async()=>{
  await draft({comment:'retain draft'});await attendance();
  await db.exec(await readFile(new URL('../../supabase/migrations/0027_class_workflow.sql',import.meta.url),'utf8'));
  assert.equal((await rows('select remaining_sessions n from memberships where id=$1',[membership]))[0].n,1);
  assert.equal((await rows('select comment from class_workout_drafts'))[0].comment,'retain draft');
  assert.equal((await rows('select count(*)::int n from attendance_ledger'))[0].n,1);
  assert.equal((await rows('select count(*)::int n from class_operations'))[0].n,1);
});

async function independentClient(){const c=new Client({connectionString:pgUrl});await c.connect();return c;}
async function waitFor(pid,event){
  for(let i=0;i<80;i++){
    const r=await rows("select wait_event,wait_event_type from pg_stat_activity where pid=$1",[pid]);
    if(r[0]?.wait_event===event||r[0]?.wait_event_type===event)return;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  throw new Error(`Expected independent backend wait event ${event}`);
}
test('independent PostgreSQL connections serialize duplicate completion and last-credit competition',{skip:!pgUrl},async()=>{
  await sql('update memberships set remaining_sessions=1 where id=$1',[membership]);
  const a=await independentClient(),b=await independentClient();
  try{
    const op=randomUUID();await a.query('begin');await attendanceWith(a,{op});
    const pid=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
    const pending=attendanceWith(b,{s:second});const settled=Promise.allSettled([pending]);
    await waitFor(pid,'Lock');await a.query('commit');
    const result=await settled;assert.equal(result[0].status,'rejected');assert.equal(result[0].reason.message,'insufficient_credit');
    assert.equal((await rows('select remaining_sessions n from memberships where id=$1',[membership]))[0].n,0);
  }finally{await a.query('rollback');await b.query('rollback');await a.end();await b.end();}
});
test('independent PostgreSQL same-operation retry waits and returns original result',{skip:!pgUrl},async()=>{
  const a=await independentClient(),b=await independentClient();
  try{
    const op=randomUUID();await a.query('begin');await attendanceWith(a,{op});
    const pid=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
    const pending=attendanceWith(b,{op});const settled=Promise.allSettled([pending]);
    await waitFor(pid,'Lock');await a.query('commit');
    const r=(await settled)[0];assert.equal(r.status,'fulfilled');assert.equal(r.value.replayed,true);
    assert.equal((await rows('select count(*)::int n from attendance_ledger'))[0].n,1);
  }finally{await a.query('rollback');await b.query('rollback');await a.end();await b.end();}
});
test('independent cancellation and completion on two sessions do not deadlock through member FK locks',{skip:!pgUrl},async()=>{
  const request=randomUUID();await sql("insert into schedule_change_requests(id,session_id,requester_type,requester_id,type,original_at) select $1,id,'member',$3,'cancel',scheduled_at from sessions where id=$2",[request,second,member]);
  await db.exec("create function qa_delay_membership() returns trigger language plpgsql as $$ begin perform pg_sleep(0.3); return new; end $$; create trigger qa_delay_membership after update on memberships for each row execute function qa_delay_membership();");
  const a=await independentClient(),b=await independentClient();
  try{
    const pid=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
    const cancel=b.query('select accept_cancel_request_atomic($1,$2,(select scheduled_at from sessions where id=$2),true,$3) result',[request,second,coach]);
    const result=Promise.allSettled([cancel]);await waitFor(pid,'PgSleep');
    const done=attendanceWith(a);const results=await Promise.allSettled([done]);const cancellation=await result;
    assert.equal(results[0].status,'fulfilled',results[0].reason?.message);assert.equal(cancellation[0].status,'fulfilled',cancellation[0].reason?.message);
    assert.equal((await rows('select remaining_sessions n from memberships where id=$1',[membership]))[0].n,0);
  }finally{await a.end();await b.end();await db.exec('drop trigger qa_delay_membership on memberships; drop function qa_delay_membership();');}
});

async function requestCompletionRace(type) {
  const request=randomUUID();
  const at=(await rows("select now()+interval '1 day' target_at"))[0].target_at;
  await sql("insert into schedule_change_requests(id,session_id,requester_type,requester_id,type,original_at,proposed_slots) select $1,id,'member',$3,$4,scheduled_at,$5::jsonb from sessions where id=$2",[request,session,member,type,JSON.stringify(type==='change'?[at]:[])]);
  const a=await independentClient(),b=await independentClient(),observer=await independentClient();
  let settled;
  try {
    await a.query('begin');await a.query('select id from sessions where id=$1 for update',[session]);
    const pid=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
    const pending=type==='cancel'
      ?b.query('select accept_cancel_request_atomic($1,$2,(select scheduled_at from sessions where id=$2),true,$3) result',[request,session,coach])
      :b.query('select move_session_with_tombstone_atomic($1,(select scheduled_at from sessions where id=$1),$2,$3) result',[session,at,request]);
    settled=Promise.allSettled([pending]);await waitFor(pid,'Lock');
    // The waiter must not claim the request before its session lock. Completion
    // already holds the session and must be able to reject this pending request.
    await observer.query('begin');
    await observer.query('select id from schedule_change_requests where id=$1 for update nowait',[request]);
    await observer.query('rollback');
    assert.equal((await attendanceWith(a)).status,'ok');await a.query('commit');
    const [r]=await settled;assert.equal(r.status,'fulfilled',r.reason?.message);
    assert.equal(type==='cancel'?r.value.rows[0].result.status:r.value.rows[0].result,'session_resolved');
    assert.equal((await rows('select status from schedule_change_requests where id=$1',[request]))[0].status,'rejected');
    assert.equal((await rows('select remaining_sessions n from memberships where id=$1',[membership]))[0].n,1);
  } finally {
    await observer.query('rollback');await a.query('rollback');if(settled)await settled;
    await a.end();await b.end();await observer.end();
  }
}
test('cancellation request waits for session before claiming request; completion wins without deadlock',{skip:!pgUrl},()=>requestCompletionRace('cancel'));
test('move request waits for session before claiming request; completion wins without deadlock',{skip:!pgUrl},()=>requestCompletionRace('change'));
