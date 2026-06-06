import {
  Download,
  ImagePlus,
  LogIn,
  MessageCircle,
  Palette,
  Play,
  Plus,
  RefreshCw,
  Upload,
  Users
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { ImageMetadata, ListRoomResultsResponse, ResultMetadata, RoomDetail } from "@doodle/shared";
import { ApiClientError, createApiClient, normalizeRoomCode } from "./api/client";

type ViewMode = "lobby" | "room" | "play" | "gallery";

const defaultApiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export function App() {
  const [apiBaseUrl, setApiBaseUrl] = useState(defaultApiBaseUrl);
  const [token, setToken] = useState("");
  const [roomTitle, setRoomTitle] = useState("우리 낙서방");
  const [joinCode, setJoinCode] = useState("");
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [images, setImages] = useState<ImageMetadata[]>([]);
  const [results, setResults] = useState<ResultMetadata[]>([]);
  const [nextResultCursor, setNextResultCursor] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("lobby");
  const [message, setMessage] = useState("백엔드 API 토큰을 입력하면 방 기능을 사용할 수 있습니다.");
  const [isBusy, setIsBusy] = useState(false);

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: apiBaseUrl,
        getToken: () => token
      }),
    [apiBaseUrl, token]
  );

  async function runAction(action: () => Promise<void>) {
    setIsBusy(true);
    try {
      await action();
    } catch (error) {
      setMessage(formatError(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCreateRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction(async () => {
      const createdRoom = await api.createRoom({ title: roomTitle.trim() });
      setRoom(createdRoom);
      setJoinCode(createdRoom.roomCode);
      setImages([]);
      setResults([]);
      setNextResultCursor(null);
      setViewMode("room");
      setMessage(`${createdRoom.roomCode} 방을 만들었습니다.`);
    });
  }

  async function handleJoinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction(async () => {
      const joinedRoom = await api.joinRoom(joinCode);
      setRoom(joinedRoom);
      setJoinCode(joinedRoom.roomCode);
      await refreshRoomData(joinedRoom.roomCode);
      setViewMode("room");
      setMessage(`${joinedRoom.roomCode} 방에 입장했습니다.`);
    });
  }

  async function handleRefreshRoom() {
    if (!room) {
      setMessage("먼저 방을 만들거나 입장해 주세요.");
      return;
    }

    await runAction(async () => {
      await refreshRoomData(room.roomCode);
      setMessage("방 정보를 새로 불러왔습니다.");
    });
  }

  async function handleUpload(file: File | null) {
    if (!room || !file) {
      return;
    }

    await runAction(async () => {
      const uploadedImage = await api.uploadImage(room.roomCode, file);
      setImages((currentImages) => [uploadedImage, ...currentImages.filter((image) => image.id !== uploadedImage.id)]);
      setMessage(`${uploadedImage.originalName} 업로드가 완료되었습니다.`);
    });
  }

  async function handleLoadResults(cursor: string | null = null) {
    if (!room) {
      setMessage("결과를 볼 방을 먼저 선택해 주세요.");
      return;
    }

    await runAction(async () => {
      const response = await api.listResults(room.roomCode, cursor);
      mergeResults(response, cursor);
      setViewMode("gallery");
      setMessage("결과 목록을 불러왔습니다.");
    });
  }

  async function handleDownloadResult(resultId: string) {
    await runAction(async () => {
      const download = await api.downloadResult(resultId);
      const objectUrl = URL.createObjectURL(download.blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = download.filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      setMessage(`${download.filename} 다운로드를 시작했습니다.`);
    });
  }

  async function refreshRoomData(roomCode: string) {
    const [freshRoom, freshImages, firstResultsPage] = await Promise.all([
      api.getRoom(roomCode),
      api.listImages(roomCode),
      api.listResults(roomCode)
    ]);
    setRoom(freshRoom);
    setImages(freshImages);
    setResults(firstResultsPage.results);
    setNextResultCursor(firstResultsPage.page.nextCursor);
  }

  function mergeResults(response: ListRoomResultsResponse, cursor: string | null) {
    setResults((currentResults) => {
      if (!cursor) {
        return response.results;
      }

      const knownIds = new Set(currentResults.map((result) => result.id));
      return [...currentResults, ...response.results.filter((result) => !knownIds.has(result.id))];
    });
    setNextResultCursor(response.page.nextCursor);
  }

  const activeRoomCode = room?.roomCode ?? normalizeRoomCode(joinCode);
  const canUseRoomActions = Boolean(room);

  return (
    <main className="app-shell">
      <section className="hero-panel" aria-labelledby="app-title">
        <div>
          <p className="eyebrow">Realtime Doodle Relay</p>
          <h1 id="app-title">같이 그리고, 같이 망치고, 같이 저장하기</h1>
          <p className="hero-copy">
            방을 만들고 이미지를 올린 뒤 라운드가 시작되면 같은 캔버스 위에서 실시간으로 낙서를 이어갑니다.
          </p>
        </div>

        <div className="connection-panel" aria-label="API 연결 설정">
          <label>
            API 서버
            <input value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} spellCheck={false} />
          </label>
          <label>
            Firebase ID Token
            <textarea
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="로컬 테스트용 ID token"
              rows={3}
              spellCheck={false}
            />
          </label>
        </div>
      </section>

      <nav className="mode-tabs" aria-label="화면 전환">
        <TabButton isActive={viewMode === "lobby"} onClick={() => setViewMode("lobby")} icon={<LogIn size={18} />}>
          로비
        </TabButton>
        <TabButton isActive={viewMode === "room"} onClick={() => setViewMode("room")} icon={<Users size={18} />}>
          대기실
        </TabButton>
        <TabButton isActive={viewMode === "play"} onClick={() => setViewMode("play")} icon={<Palette size={18} />}>
          플레이
        </TabButton>
        <TabButton isActive={viewMode === "gallery"} onClick={() => void handleLoadResults()} icon={<Download size={18} />}>
          갤러리
        </TabButton>
      </nav>

      <section className="status-strip" aria-live="polite">
        <span>{message}</span>
        {isBusy ? <span className="busy-dot">처리 중</span> : null}
      </section>

      {viewMode === "lobby" ? (
        <LobbyView
          roomTitle={roomTitle}
          joinCode={joinCode}
          onRoomTitleChange={setRoomTitle}
          onJoinCodeChange={setJoinCode}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          isBusy={isBusy}
        />
      ) : null}

      {viewMode === "room" ? (
        <RoomView
          room={room}
          images={images}
          activeRoomCode={activeRoomCode}
          canUseRoomActions={canUseRoomActions}
          onRefreshRoom={() => void handleRefreshRoom()}
          onUpload={(file) => void handleUpload(file)}
          isBusy={isBusy}
        />
      ) : null}

      {viewMode === "play" ? <PlayView room={room} imageCount={images.length} /> : null}

      {viewMode === "gallery" ? (
        <GalleryView
          results={results}
          nextCursor={nextResultCursor}
          onLoadMore={() => void handleLoadResults(nextResultCursor)}
          onDownload={(resultId) => void handleDownloadResult(resultId)}
          isBusy={isBusy}
        />
      ) : null}
    </main>
  );
}

interface LobbyViewProps {
  roomTitle: string;
  joinCode: string;
  isBusy: boolean;
  onRoomTitleChange: (value: string) => void;
  onJoinCodeChange: (value: string) => void;
  onCreateRoom: (event: FormEvent<HTMLFormElement>) => void;
  onJoinRoom: (event: FormEvent<HTMLFormElement>) => void;
}

function LobbyView(props: LobbyViewProps) {
  return (
    <section className="content-grid">
      <form className="paper-card action-card" onSubmit={props.onCreateRoom}>
        <div className="card-heading">
          <Plus size={20} />
          <h2>방 만들기</h2>
        </div>
        <label>
          방 이름
          <input value={props.roomTitle} onChange={(event) => props.onRoomTitleChange(event.target.value)} />
        </label>
        <button className="primary-button" disabled={props.isBusy} type="submit">
          <Plus size={18} />
          새 방 만들기
        </button>
      </form>

      <form className="paper-card action-card" onSubmit={props.onJoinRoom}>
        <div className="card-heading">
          <LogIn size={20} />
          <h2>방 입장</h2>
        </div>
        <label>
          방 코드
          <input
            value={props.joinCode}
            onChange={(event) => props.onJoinCodeChange(event.target.value.toUpperCase())}
            maxLength={6}
            spellCheck={false}
          />
        </label>
        <button className="secondary-button" disabled={props.isBusy} type="submit">
          <LogIn size={18} />
          입장하기
        </button>
      </form>
    </section>
  );
}

interface RoomViewProps {
  room: RoomDetail | null;
  images: ImageMetadata[];
  activeRoomCode: string;
  canUseRoomActions: boolean;
  isBusy: boolean;
  onRefreshRoom: () => void;
  onUpload: (file: File | null) => void;
}

function RoomView(props: RoomViewProps) {
  return (
    <section className="room-layout">
      <div className="paper-card room-summary">
        <div className="card-heading">
          <Users size={20} />
          <h2>{props.room?.title ?? "대기실"}</h2>
        </div>
        <div className="room-code">{props.activeRoomCode || "------"}</div>
        <dl className="summary-list">
          <div>
            <dt>상태</dt>
            <dd>{props.room?.status ?? "방 선택 전"}</dd>
          </div>
          <div>
            <dt>참가자</dt>
            <dd>{props.room?.participantCount ?? 0}명</dd>
          </div>
          <div>
            <dt>이미지</dt>
            <dd>{props.images.length}개</dd>
          </div>
        </dl>
        <button className="icon-button" disabled={!props.canUseRoomActions || props.isBusy} onClick={props.onRefreshRoom} type="button">
          <RefreshCw size={18} />
          새로고침
        </button>
      </div>

      <div className="paper-card upload-card">
        <div className="card-heading">
          <ImagePlus size={20} />
          <h2>이미지 업로드</h2>
        </div>
        <label className="upload-box">
          <Upload size={28} />
          <span>JPEG, PNG, WebP 이미지를 선택하세요.</span>
          <input
            accept="image/jpeg,image/png,image/webp"
            disabled={!props.canUseRoomActions || props.isBusy}
            type="file"
            onChange={(event) => props.onUpload(event.currentTarget.files?.item(0) ?? null)}
          />
        </label>
        <ImageList images={props.images} />
      </div>

      <ParticipantPanel room={props.room} />
    </section>
  );
}

function ImageList({ images }: { images: ImageMetadata[] }) {
  if (images.length === 0) {
    return <p className="empty-copy">아직 업로드된 이미지가 없습니다.</p>;
  }

  return (
    <ul className="image-list">
      {images.map((image) => (
        <li key={image.id}>
          <span>{image.originalName}</span>
          <strong>{image.used ? "사용됨" : "대기"}</strong>
        </li>
      ))}
    </ul>
  );
}

function ParticipantPanel({ room }: { room: RoomDetail | null }) {
  return (
    <aside className="paper-card participants-card">
      <div className="card-heading">
        <Users size={20} />
        <h2>참가자</h2>
      </div>
      {room ? (
        <ul className="participant-list">
          {room.participants.map((participant) => (
            <li key={participant.firebaseUid}>
              <span>{participant.nickname ?? "익명 참가자"}</span>
              {participant.isHost ? <strong>Host</strong> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-copy">방에 입장하면 참가자 목록이 표시됩니다.</p>
      )}
    </aside>
  );
}

function PlayView({ room, imageCount }: { room: RoomDetail | null; imageCount: number }) {
  return (
    <section className="play-layout">
      <div className="canvas-stage" aria-label="캔버스 자리 표시">
        <div className="canvas-placeholder">
          <Palette size={44} />
          <span>{room?.status === "playing" ? "라운드 진행 중" : "캔버스 준비 중"}</span>
        </div>
      </div>
      <aside className="paper-card chat-card">
        <div className="card-heading">
          <MessageCircle size={20} />
          <h2>채팅</h2>
        </div>
        <div className="chat-placeholder">Socket 채팅 UI는 다음 프론트 slice에서 연결합니다.</div>
        <div className="round-meter">
          <Play size={18} />
          <span>{imageCount}개 이미지 준비됨</span>
        </div>
      </aside>
    </section>
  );
}

interface GalleryViewProps {
  results: ResultMetadata[];
  nextCursor: string | null;
  isBusy: boolean;
  onLoadMore: () => void;
  onDownload: (resultId: string) => void;
}

function GalleryView(props: GalleryViewProps) {
  if (props.results.length === 0) {
    return (
      <section className="paper-card gallery-empty">
        <Download size={28} />
        <h2>저장된 결과가 없습니다.</h2>
      </section>
    );
  }

  return (
    <section className="gallery-grid">
      {props.results.map((result) => (
        <article className="paper-card result-card" key={result.id}>
          <div className="result-preview">Round {result.roundIndex + 1}</div>
          <dl className="summary-list">
            <div>
              <dt>stroke</dt>
              <dd>{result.strokeCount}</dd>
            </div>
            <div>
              <dt>created</dt>
              <dd>{formatDateTime(result.createdAt)}</dd>
            </div>
          </dl>
          <button className="download-link" disabled={props.isBusy} onClick={() => props.onDownload(result.id)} type="button">
            <Download size={18} />
            다운로드
          </button>
        </article>
      ))}
      {props.nextCursor ? (
        <button className="secondary-button gallery-more" disabled={props.isBusy} onClick={props.onLoadMore} type="button">
          <RefreshCw size={18} />
          더 보기
        </button>
      ) : null}
    </section>
  );
}

interface TabButtonProps {
  children: string;
  icon: ReactNode;
  isActive: boolean;
  onClick: () => void;
}

function TabButton(props: TabButtonProps) {
  return (
    <button className={props.isActive ? "tab-button active" : "tab-button"} onClick={props.onClick} type="button">
      {props.icon}
      {props.children}
    </button>
  );
}

function formatError(error: unknown): string {
  if (error instanceof ApiClientError) {
    return `${error.code}: ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "알 수 없는 오류가 발생했습니다.";
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}
