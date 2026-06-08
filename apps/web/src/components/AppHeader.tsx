import { LogOut, Save } from "lucide-react";
import type { User } from "firebase/auth";
import type { UserProfile } from "@doodle/shared";

interface AppHeaderProps {
  authUser: User | null;
  profile: UserProfile | null;
  onGoLobby: () => void;
  onOpenNickname: () => void;
  onSignOut: () => void;
}

export function AppHeader(props: AppHeaderProps) {
  const displayName = props.profile?.nickname ?? props.authUser?.email ?? "사용자";
  const avatarUrl = props.profile?.avatarUrl ?? props.authUser?.photoURL;

  return (
    <header className="app-header">
      <button className="logo-button" onClick={props.onGoLobby} type="button" aria-label="로비로 이동">
        DOODLE
      </button>
      <div className="profile-menu">
        <button className="profile-button" type="button">
          {avatarUrl ? <img alt="" src={avatarUrl} /> : <span>{displayName.slice(0, 1)}</span>}
          <strong>{displayName}</strong>
        </button>
        <div className="profile-popover" role="menu">
          <button onClick={props.onOpenNickname} role="menuitem" type="button">
            <Save size={16} />
            닉네임 변경
          </button>
          <button onClick={props.onSignOut} role="menuitem" type="button">
            <LogOut size={16} />
            로그아웃
          </button>
        </div>
      </div>
    </header>
  );
}
