import type { Profile } from "../types";
import { LOGO_SMALL } from "./Onboarding";

export type View = "home" | "progress" | "groups" | "me" | "course";

interface Props {
  profile: Profile;
  view: View;
  onGo: (v: View) => void;
}

const NAV: { id: View; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "progress", label: "Progress" },
  { id: "groups", label: "Groups" },
];

export function Header({ profile, view, onGo }: Props) {
  const initials = profile.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <header className="top">
      <button className="brand" onClick={() => onGo("home")} aria-label="Lectern home">
        <img className="brand-logo" src={LOGO_SMALL} alt="" />
        <span className="brand-name">
          <span className="L">L</span>ectern
        </span>
      </button>
      <nav className="topnav" aria-label="Main">
        {NAV.map((n) => (
          <button key={n.id} className={view === n.id || (n.id === "home" && view === "course") ? "on" : ""} aria-current={view === n.id ? "page" : undefined} onClick={() => onGo(n.id)}>
            {n.label}
          </button>
        ))}
      </nav>
      <button className={view === "me" ? "me on" : "me"} onClick={() => onGo("me")} aria-label="My account">
        <span className="me-text">
          <span className="me-name">{profile.preferredName}</span>
          <span className="me-sub">{profile.institution}</span>
        </span>
        <span className="avatar">{initials || "?"}</span>
      </button>
    </header>
  );
}
