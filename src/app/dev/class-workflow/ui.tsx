"use client";
// Synthetic UI fixture only. Calls the production editor/queue, never Supabase or real auth.
import { useState } from "react";
import {
  saveFixtureDraft,
  completeFixture,
  correctFixture,
  resetFixtureState,
} from "./actions";
import { ClassRecordEditor } from "@/components/trainer/ClassRecordEditor";
import type { ClassWorkspace } from "@/lib/data/class-workflow-types";
export function ClassWorkflowFixture({
  workspace,
}: {
  workspace: ClassWorkspace;
}) {
  const [failure, setFailure] = useState(false);
  return (
    <>
      <div className="z-40 flex flex-none justify-between gap-2 px-5 py-2 text-xs">
        <label>
          <input
            type="checkbox"
            checked={failure}
            onChange={(e) => setFailure(e.target.checked)}
          />
          합성 저장 실패
        </label>
        <button
          onClick={async () => {
            await resetFixtureState();
            for (const k of Object.keys(sessionStorage))
              if (k.startsWith("spt-class-draft:"))
                sessionStorage.removeItem(k);
            window.location.reload();
          }}
        >
          합성 초기화
        </button>
      </div>
      <ClassRecordEditor
        workspace={workspace}
        exerciseOptions={[
          { id: "squat", name: "스쿼트" },
          { id: "press", name: "체스트 프레스" },
        ]}
        saveDraft={async (memberId, draft) => {
          if (failure)
            return {
              ok: false,
              error: "합성 저장 실패: 입력 복구를 확인해주세요.",
            };
          return saveFixtureDraft(memberId, draft);
        }}
        publish={async () => ({ ok: true })}
        complete={completeFixture}
        correct={correctFixture}
      />
    </>
  );
}
