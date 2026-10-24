import { notFound } from "next/navigation";
import { Frame } from "@/components/shell/Frame";
import { fixtureState } from "./fixture-data";
import { ClassWorkflowFixture } from "./ui";
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <Frame>
      <ClassWorkflowFixture workspace={fixtureState()} />
    </Frame>
  );
}
