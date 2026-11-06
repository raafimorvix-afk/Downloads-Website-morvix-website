// Small line icons (24x24, stroke = currentColor). Decorative: always paired with a text label.
const paths: Record<string, string> = {
  dashboard: "M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 4v3h6V4z",
  leads: "M4 6h16M4 12h16M4 18h10",
  calendar: "M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
  clients: "M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM17 11a3 3 0 0 0 0-6M21 20v-1a5 5 0 0 0-3-4.6",
  billing: "M3 7h18v10H3zM3 10h18M7 14h3",
  agents: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1",
  bdm: "M4 19V9M10 19V5M16 19v-7M22 19H2",
  team: "M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z",
  plus: "M12 5v14M5 12h14",
  results: "M5 12l4 4L19 6",
  tasks: "M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2",
  map: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
};
export function Icon({ name, className = "h-5 w-5" }: { name: keyof typeof paths | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={paths[name] ?? paths.leads} />
    </svg>
  );
}
