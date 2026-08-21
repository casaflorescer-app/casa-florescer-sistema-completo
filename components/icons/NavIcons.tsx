import type { ReactElement, SVGProps } from "react";
import type { NavIconName } from "@/lib/nav";

type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

const ICONS: Record<NavIconName, (props: IconProps) => ReactElement> = {
  "calendar-clock": (props) => (
    <Svg {...props}>
      <path d="M16 2v4M8 2v4M3 10h18M21 8.5V10" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M14.5 15.5 16 17l1.2-.8" />
      <circle cx="16" cy="16" r="3.2" />
    </Svg>
  ),
  "folder-open": (props) => (
    <Svg {...props}>
      <path d="m6 14 1.5-4.5A2 2 0 0 1 9.4 8H20a2 2 0 0 1 1.9 2.6l-1.4 4.2A2 2 0 0 1 18.6 16H8" />
      <path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1" />
      <path d="M3 6v12a2 2 0 0 0 2 2h5" />
    </Svg>
  ),
  users: (props) => (
    <Svg {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </Svg>
  ),
  gauge: (props) => (
    <Svg {...props}>
      <path d="m12 14 4-4" />
      <path d="M3.3 14A7.5 7.5 0 0 1 12 7a7.5 7.5 0 0 1 8.7 7" />
      <path d="M4 19h16" />
    </Svg>
  ),
  "calendar-days": (props) => (
    <Svg {...props}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
    </Svg>
  ),
  "user-plus": (props) => (
    <Svg {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6M22 11h-6" />
    </Svg>
  ),
  "list-todo": (props) => (
    <Svg {...props}>
      <rect x="3" y="5" width="6" height="6" rx="1" />
      <path d="m3 17 2 2 4-4M13 6h8M13 12h8M13 18h8" />
    </Svg>
  ),
  "flask-conical": (props) => (
    <Svg {...props}>
      <path d="M10 2v7.5L4.2 20.2A2 2 0 0 0 6 23h12a2 2 0 0 0 1.8-2.8L14 9.5V2" />
      <path d="M8.5 2h7M8.6 16h6.8" />
    </Svg>
  ),
  megaphone: (props) => (
    <Svg {...props}>
      <path d="m3 11 18-5v12L3 13v-2Z" />
      <path d="M11.6 16.8a4 4 0 0 1-6.6 2.1" />
    </Svg>
  ),
  "layout-dashboard": (props) => (
    <Svg {...props}>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </Svg>
  ),
  "file-signature": (props) => (
    <Svg {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M8 18h1M8 13c1.5-2 4.5-2 6 1 1 2 3 2 4 1" />
    </Svg>
  ),
  package: (props) => (
    <Svg {...props}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="M3.3 7 12 12l8.7-5M12 22V12" />
    </Svg>
  ),
  "shield-check": (props) => (
    <Svg {...props}>
      <path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </Svg>
  ),
  "calendar-check": (props) => (
    <Svg {...props}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4" />
    </Svg>
  ),
  files: (props) => (
    <Svg {...props}>
      <path d="M15 2H6a2 2 0 0 0-2 2v14" />
      <path d="M9 8h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />
    </Svg>
  ),
  "user-pen": (props) => (
    <Svg {...props}>
      <path d="M11.5 21H6a4 4 0 0 1-4-4v-1" />
      <circle cx="9" cy="7" r="4" />
      <path d="M15.4 15.4 21 21M16.8 13.2 20 16.4l-2.2 2.2-3.2-3.2 2.2-2.2Z" />
    </Svg>
  ),
};

export function NavIcon({
  name,
  className,
}: {
  name: NavIconName;
  className?: string;
}) {
  const Icon = ICONS[name];
  return <Icon className={className ?? "h-4 w-4 shrink-0"} />;
}
