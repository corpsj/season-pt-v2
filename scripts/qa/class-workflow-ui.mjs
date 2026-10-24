// UI coverage uses only /dev/class-workflow synthetic data; no real login or Supabase.
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE_PATH || "playwright"
);
import assert from "node:assert/strict";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/*", (route) =>
  route.request().url().startsWith("http://127.0.0.1:3097")
    ? route.continue()
    : route.abort(),
);
await page.goto("http://127.0.0.1:3097/dev/class-workflow", {
  waitUntil: "networkidle",
});
await page.getByRole("heading", { name: "오늘 수업 기록" }).waitFor();
await page.getByRole("button", { name: "합성 초기화", exact: true }).click();
await page.waitForLoadState("networkidle");
await page
  .getByRole("button", { name: "지난 구성을 오늘 목표로 가져오기" })
  .click();
await page
  .getByRole("spinbutton", { name: "스쿼트 1세트 실제 kg", exact: true })
  .fill("25.5");
await page
  .getByRole("spinbutton", { name: "스쿼트 1세트 실제 횟수", exact: true })
  .fill("8");
await page
  .getByRole("button", { name: "세트 완료", exact: true })
  .first()
  .click();
await page.getByRole("button", { name: "마지막 세트 복사" }).click();
await page.getByText("서버에 초안 저장됨", { exact: true }).waitFor();
await page
  .getByRole("heading", { name: "오늘 수업 기록" })
  .scrollIntoViewIfNeeded();
await page.screenshot({
  path: "/tmp/season-pt-qa/class-record-390.png",
  fullPage: true,
});
await page.getByText("1세트", { exact: true }).scrollIntoViewIfNeeded();
await page.screenshot({
  path: "/tmp/season-pt-qa/class-record-set.png",
  fullPage: true,
});
await page
  .getByRole("textbox", { name: "회원에게 공유할 코멘트" })
  .fill("A의 전환 직전 입력");
await page.getByRole("button", { name: /합성 회원 B/ }).click();
await page.getByText("기존 요약 · 10회 × 2세트").waitFor();
await page
  .getByRole("textbox", { name: "회원에게 공유할 코멘트" })
  .fill("B의 합성 코멘트");
await page.getByText("서버에 초안 저장됨", { exact: true }).waitFor();
await page.reload({ waitUntil: "networkidle" });
await page
  .getByRole("spinbutton", { name: "스쿼트 1세트 실제 kg", exact: true })
  .waitFor();
assert.equal(
  await page
    .getByRole("spinbutton", { name: "스쿼트 1세트 실제 kg", exact: true })
    .inputValue(),
  "25.5",
);
assert.equal(
  await page
    .getByRole("textbox", { name: "회원에게 공유할 코멘트" })
    .inputValue(),
  "A의 전환 직전 입력",
);
await page.getByRole("button", { name: /합성 회원 B/ }).click();
assert.equal(
  await page
    .getByRole("textbox", { name: "회원에게 공유할 코멘트" })
    .inputValue(),
  "B의 합성 코멘트",
);
await page.getByRole("checkbox", { name: "합성 저장 실패" }).check();
await page
  .getByRole("textbox", { name: "회원에게 공유할 코멘트" })
  .fill("실패 후 새로고침 복구");
await page.getByText("저장하지 못했어요", { exact: true }).waitFor();
page.once("dialog", async (d) => {
  assert.equal(d.type(), "confirm");
  await d.dismiss();
});
await page.getByRole("button", { name: "뒤로", exact: true }).click();
assert.ok(page.url().endsWith("/dev/class-workflow"));
assert.equal(
  await page.evaluate(() => {
    const e = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  }),
  true,
);
page.once("dialog", (d) => d.accept());
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /합성 회원 B/ }).click();
assert.equal(
  await page
    .getByRole("textbox", { name: "회원에게 공유할 코멘트" })
    .inputValue(),
  "실패 후 새로고침 복구",
);
await page.getByText("서버에 초안 저장됨", { exact: true }).waitFor();
await page.setViewportSize({ width: 360, height: 780 });
await page.screenshot({
  path: "/tmp/season-pt-qa/class-record-360.png",
  fullPage: true,
});
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  false,
);
await page.getByRole("button", { name: "기록 공유하고 수업 완료" }).click();
await page.getByRole("heading", { name: "수업을 완료할까요?" }).waitFor();
const canvas = page.locator("dialog canvas");
const bounds = await canvas.boundingBox();
assert.ok(bounds);
await page.mouse.move(bounds.x + 20, bounds.y + 50);
await page.mouse.down();
await page.mouse.move(bounds.x + 130, bounds.y + 80, { steps: 6 });
await page.mouse.up();
await page.getByRole("button", { name: "출석 확정", exact: true }).click();
await page.getByRole("button", { name: "수업 완료됨" }).waitFor();
await page.getByText("수업 처리 정정", { exact: true }).click();
await page.getByRole("textbox", { name: "정정 사유" }).fill("합성 정정");
await page.getByRole("button", { name: "회차 복원하고 예정으로 정정" }).click();
await page.getByRole("button", { name: "기록 공유하고 수업 완료" }).waitFor();
assert.deepEqual(errors, []);
console.log(
  JSON.stringify({
    passed: [
      "previous-target-actual separation",
      "decimal input",
      "set complete/copy",
      "duet member isolation",
      "server draft reload",
      "unsaved navigation and unload warning",
      "member switch before autosave",
      "failed-save tab recovery",
      "360px layout",
      "signature and finish",
    ],
    pageErrors: errors,
    screenshots: [
      "/tmp/season-pt-qa/class-record-390.png",
      "/tmp/season-pt-qa/class-record-360.png",
    ],
  }),
);
await browser.close();
