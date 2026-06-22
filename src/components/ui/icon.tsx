import { ICONS, type IconName } from "./icon-data";

export type { IconName };

type IconProps = {
  name: IconName;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
};

/** Monoline icon set (currentColor). Inherits color from the parent. */
export function Icon({ name, size = 24, className, style }: IconProps) {
  const def = ICONS[name];
  if (!def) return null;
  return (
    <svg
      viewBox={def.viewBox}
      width={size}
      height={size}
      className={className}
      style={style}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: def.body }}
    />
  );
}
