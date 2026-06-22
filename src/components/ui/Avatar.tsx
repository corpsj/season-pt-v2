import type { AvatarTone, TeamAvatar as TeamAvatarData } from "@/lib/types";

export const AVATAR_HEX: Record<AvatarTone, string> = {
  sage: "#768c6a",
  sageMid: "#79836b",
  sageSoft: "#8fa187",
  gold: "#a88b57",
  pending: "#a89a80",
  terracotta: "#c67352",
};

export function Avatar({
  initial,
  tone = "sage",
  size = 42,
  fontSize,
}: {
  initial: string;
  tone?: AvatarTone;
  size?: number;
  fontSize?: number;
}) {
  return (
    <div
      className="flex flex-none items-center justify-center rounded-full font-semibold text-surface"
      style={{ width: size, height: size, background: AVATAR_HEX[tone], fontSize: fontSize ?? Math.round(size * 0.36) }}
    >
      {initial}
    </div>
  );
}

/** 2:1 team double avatar — two overlapping circles with surface border. */
export function TeamAvatar({ team, size = 42 }: { team: TeamAvatarData; size?: number }) {
  const c = Math.round(size * 0.62);
  const fs = Math.round(c * 0.42);
  return (
    <div className="relative flex-none" style={{ width: size, height: size }}>
      <div
        className="absolute left-0 top-0 flex items-center justify-center rounded-full border-2 border-surface font-semibold text-surface"
        style={{ width: c, height: c, background: AVATAR_HEX[team.tone1], fontSize: fs }}
      >
        {team.init1}
      </div>
      <div
        className="absolute bottom-0 right-0 flex items-center justify-center rounded-full border-2 border-surface font-semibold text-surface"
        style={{ width: c, height: c, background: AVATAR_HEX[team.tone2], fontSize: fs }}
      >
        {team.init2}
      </div>
    </div>
  );
}
