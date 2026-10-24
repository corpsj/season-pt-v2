"use client";
import { useRouter } from "next/navigation";
import { ClassRecordEditor } from "@/components/trainer/ClassRecordEditor";
import {
  saveClassDraft,
  publishClassRecords,
  processClassAttendance,
} from "@/lib/data/groups/class-workflow-actions";
import type { ClassWorkspace } from "@/lib/data/class-workflow-types";

export default function RecordClient({
  workspace,
  exerciseOptions,
}: {
  workspace: ClassWorkspace;
  exerciseOptions: { id: string; name: string }[];
}) {
  const router = useRouter();
  return (
    <ClassRecordEditor
      key={workspace.sessionId}
      workspace={workspace}
      exerciseOptions={exerciseOptions}
      saveDraft={(memberId, draft) =>
        saveClassDraft(workspace.sessionId, memberId, draft)
      }
      publish={(versions) => publishClassRecords(workspace.sessionId, versions)}
      complete={(signature, options) =>
        processClassAttendance(
          workspace.sessionId,
          "attend",
          signature,
          options,
        )
      }
      correct={(options) =>
        processClassAttendance(
          workspace.sessionId,
          "revert",
          undefined,
          options,
        )
      }
      onFinished={() => router.refresh()}
    />
  );
}
