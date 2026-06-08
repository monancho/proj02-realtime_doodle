import type { FormEvent } from "react";
import { LogIn, Plus } from "lucide-react";
import { DoodlePageCanvas } from "./DoodlePageCanvas";

interface LobbyViewProps {
  isBusy: boolean;
  joinCode: string;
  notice: string | null;
  onJoinCodeChange: (value: string) => void;
  onJoinRoomSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onOpenCreateRoom: () => void;
}

export function LobbyView(props: LobbyViewProps) {
  return (
    <section className="lobby-page" aria-label="로비">
      <DoodlePageCanvas />
      <div className="lobby-copy-panel">
        <p className="lobby-kicker">Realtime Doodle Relay</p>
        <div className="headline-stack">
          <h2 className="split-headline">
            <span>같이 그리고,</span>
            <span>같이 망치고,</span>
            <span>같이 저장하기</span>
          </h2>
          <span className="lobby-marker-line" aria-hidden="true" />
        </div>
        <p>
          방을 만들거나 초대 코드를 입력해 입장한 뒤, 이미지를 올리고 같은 캔버스 위에서 실시간으로 낙서를 이어가세요.
        </p>
      </div>

      <div className="lobby-cta-stack">
        <button className="paper-card lobby-cta-card" disabled={props.isBusy} onClick={props.onOpenCreateRoom} type="button">
          <span className="lobby-icon-bubble lobby-icon-bubble--yellow" aria-hidden="true">
            <Plus size={34} />
          </span>
          <div>
            <h2>방 만들기</h2>
            <p>새 방을 만들고 초대 코드를 공유합니다.</p>
          </div>
        </button>

        <form className="paper-card lobby-cta-card lobby-join-card" onSubmit={props.onJoinRoomSubmit}>
          <span className="lobby-icon-bubble lobby-icon-bubble--green" aria-hidden="true">
            <LogIn size={32} />
          </span>
          <div className="lobby-join-content">
            <div>
              <h2>방 입장</h2>
              <p>초대 코드를 입력해 대기실에 들어갑니다.</p>
            </div>
            <div className="lobby-join-form">
              <label className="sr-only" htmlFor="inline-room-code">
                초대 코드
              </label>
              <input
                id="inline-room-code"
                maxLength={6}
                onChange={(event) => props.onJoinCodeChange(event.target.value)}
                placeholder="초대 코드를 입력하세요"
                value={props.joinCode}
              />
              <button className="primary-button" disabled={props.isBusy || props.joinCode.trim().length === 0} type="submit">
                입장하기
              </button>
            </div>
          </div>
        </form>
      </div>

      {props.notice ? (
        <aside className="lobby-notice" aria-label="로비 안내">
          <span className="notice-icon">i</span>
          <span>{props.notice}</span>
        </aside>
      ) : null}
    </section>
  );
}
