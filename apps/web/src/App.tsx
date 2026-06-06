import {
  Download,
  ImagePlus,
  KeyRound,
  LogIn,
  LogOut,
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
import type { ImageMetadata, ListRoomResultsResponse, ResultMetadata, RoomDetail, UserProfile } from "@doodle/shared";
import type { User } from "firebase/auth";
import { ApiClientError, createApiClient, normalizeRoomCode } from "./api/client";
import { createFirebaseClient } from "./auth/firebase";

type ViewMode = "lobby" | "room" | "play" | "gallery";
type LoadState = "idle" | "loading" | "ready" | "error";

interface ResourceState {
  room: LoadState;
  participants: LoadState;
  images: LoadState;
  results: LoadState;
}

interface ResourceErrors {
  room: string | null;
  participants: string | null;
  images: string | null;
  results: string | null;
}

const defaultApiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
const initialResourceState: ResourceState = {
  room: "idle",
  participants: "idle",
  images: "idle",
  results: "idle"
};
const initialResourceErrors: ResourceErrors = {
  room: null,
  participants: null,
  images: null,
  results: null
};

export function App() {
  const [apiBaseUrl, setApiBaseUrl] = useState(defaultApiBaseUrl);
  const [manualToken, setManualToken] = useState("");
  const [firebaseToken, setFirebaseToken] = useState("");
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [roomTitle, setRoomTitle] = useState("우리 낙서방");
  const [joinCode, setJoinCode] = useState("");
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [images, setImages] = useState<ImageMetadata[]>([]);
  const [results, setResults] = useState<ResultMetadata[]>([]);
  const [nextResultCursor, setNextResultCursor] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("lobby");
  const [message, setMessage] = useState("Firebase 로그인 또는 개발용 토큰으로 시작하세요.");
  const [isBusy, setIsBusy] = useState(false);
  const [resourceState, setResourceState] = useState<ResourceState>(initialResourceState);
  const [resourceErrors, setResourceErrors] = useState<ResourceErrors>(initialResourceErrors);

  const activeToken = firebaseToken || manualToken;
  const isAuthenticated = activeToken.trim().length > 0;

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: apiBaseUrl,
        getToken: () => activeToken
      }),
    [apiBaseUrl, activeToken]
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

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction(async () => {
      const firebase = createFirebaseClient();
      const signedInUser = await firebase.signInWithEmail({ email, password });
      const idToken = await signedInUser.getIdToken();
      const authenticatedApi = createApiClient({
        baseUrl: apiBaseUrl,
        getToken: () => idToken
      });
      const upsertedProfile = await authenticatedApi.upsertMe({
        nickname: nickname.trim() || signedInUser.displayName || null,
        avatarUrl: signedInUser.photoURL || null
      });

      setAuthUser(signedInUser);
      setFirebaseToken(idToken);
      setManualToken("");
      setProfile(upsertedProfile);
      setMessage(`${upsertedProfile.nickname ?? upsertedProfile.email ?? "사용자"}님, 로그인되었습니다.`);
    });
  }

  async function handleRefreshToken() {
    if (!authUser) {
      setMessage("Firebase 로그인 후 토큰을 갱신할 수 있습니다.");
      return;
    }

    await runAction(async () => {
      const refreshedToken = await authUser.getIdToken(true);
      setFirebaseToken(refreshedToken);
      setMessage("Firebase ID Token을 갱신했습니다.");
    });
  }

  async function handleSignOut() {
    await runAction(async () => {
      if (authUser) {
        await createFirebaseClient().signOutUser();
      }

      setAuthUser(null);
      setProfile(null);
      setFirebaseToken("");
      setManualToken("");
      resetRoomState();
      setViewMode("lobby");
      setMessage("로그아웃했습니다. 방 상태와 토큰을 정리했습니다.");
    });
  }

  async function handleCreateRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isAuthenticated) {
      setMessage("로그인하거나 개발용 토큰을 입력한 뒤 방을 만들 수 있습니다.");
      return;
    }

    await runAction(async () => {
      const createdRoom = await api.createRoom({ title: roomTitle.trim() });
      setRoom(createdRoom);
      setJoinCode(createdRoom.roomCode);
      setViewMode("room");
      markRoomReady(createdRoom);
      await refreshRoomData(createdRoom.roomCode, createdRoom);
      setMessage(`${createdRoom.roomCode} 방을 만들었습니다.`);
    });
  }

  async function handleJoinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isAuthenticated) {
      setMessage("로그인하거나 개발용 토큰을 입력한 뒤 방에 입장할 수 있습니다.");
      return;
    }

    const normalizedRoomCode = normalizeRoomCode(joinCode);
    setJoinCode(normalizedRoomCode);

    if (!normalizedRoomCode) {
      setMessage("방 코드를 입력해 주세요.");
      return;
    }

    await runAction(async () => {
      const joinedRoom = await api.joinRoom(normalizedRoomCode);
      setRoom(joinedRoom);
      setJoinCode(joinedRoom.roomCode);
      setViewMode("room");
      markRoomReady(joinedRoom);
      await refreshRoomData(joinedRoom.roomCode, joinedRoom);
      setMessage(`${joinedRoom.roomCode} 방에 입장했습니다.`);
    });
  }

  async function handleRefreshRoom() {
    if (!room) {
      setMessage("먼저 방을 만들거나 입장해 주세요.");
      return;
    }

    await runAction(async () => {
      await refreshRoomData(room.roomCode, room);
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
      setResourceState((current) => ({ ...current, images: "ready" }));
      setResourceErrors((current) => ({ ...current, images: null }));
      setMessage(`${uploadedImage.originalName} 업로드가 완료되었습니다.`);
    });
  }

  async function handleLoadResults(cursor: string | null = null) {
    if (!room) {
      setMessage("결과를 볼 방을 먼저 선택해 주세요.");
      return;
    }

    await runAction(async () => {
      setResourceState((current) => ({ ...current, results: "loading" }));
      setResourceErrors((current) => ({ ...current, results: null }));
      const response = await api.listResults(room.roomCode, cursor);
      mergeResults(response, cursor);
      setResourceState((current) => ({ ...current, results: "ready" }));
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

  async function refreshRoomData(roomCode: string, roomSeed?: RoomDetail) {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    setResourceState((current) => ({
      ...current,
      room: roomSeed ? "ready" : "loading",
      participants: roomSeed ? "ready" : "loading",
      images: "loading",
      results: "loading"
    }));
    setResourceErrors(initialResourceErrors);

    const [roomResult, imagesResult, resultsResult] = await Promise.allSettled([
      roomSeed ? Promise.resolve(roomSeed) : api.getRoom(normalizedRoomCode),
      api.listImages(normalizedRoomCode),
      api.listResults(normalizedRoomCode)
    ]);

    if (roomResult.status === "fulfilled") {
      setRoom(roomResult.value);
      setResourceState((current) => ({ ...current, room: "ready", participants: "ready" }));
    } else {
      const safeMessage = formatError(roomResult.reason);
      setResourceState((current) => ({ ...current, room: "error", participants: "error" }));
      setResourceErrors((current) => ({ ...current, room: safeMessage, participants: safeMessage }));
    }

    if (imagesResult.status === "fulfilled") {
      setImages(imagesResult.value);
      setResourceState((current) => ({ ...current, images: "ready" }));
    } else {
      setImages([]);
      setResourceState((current) => ({ ...current, images: "error" }));
      setResourceErrors((current) => ({ ...current, images: formatError(imagesResult.reason) }));
    }

    if (resultsResult.status === "fulfilled") {
      setResults(resultsResult.value.results);
      setNextResultCursor(resultsResult.value.page.nextCursor);
      setResourceState((current) => ({ ...current, results: "ready" }));
    } else {
      setResults([]);
      setNextResultCursor(null);
      setResourceState((current) => ({ ...current, results: "error" }));
      setResourceErrors((current) => ({ ...current, results: formatError(resultsResult.reason) }));
    }
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

  function markRoomReady(roomDetail: RoomDetail) {
    setRoom(roomDetail);
    setResourceState((current) => ({ ...current, room: "ready", participants: "ready" }));
    setResourceErrors((current) => ({ ...current, room: null, participants: null }));
  }

  function resetRoomState() {
    setRoom(null);
    setImages([]);
    setResults([]);
    setNextResultCursor(null);
    setJoinCode("");
    setResourceState(initialResourceState);
    setResourceErrors(initialResourceErrors);
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
            Firebase로 로그인한 뒤 방을 만들고 이미지를 올리면, 라운드마다 같은 캔버스 위에서 실시간으로 낙서를 이어갈 수 있습니다.
          </p>
        </div>

        <AuthPanel
          apiBaseUrl={apiBaseUrl}
          authUser={authUser}
          email={email}
          isBusy={isBusy}
          manualToken={manualToken}
          nickname={nickname}
          password={password}
          profile={profile}
          onApiBaseUrlChange={setApiBaseUrl}
          onEmailChange={setEmail}
          onManualTokenChange={(value) => {
            setManualToken(value);
            if (value.trim()) {
              setFirebaseToken("");
              setAuthUser(null);
              setProfile(null);
            }
          }}
          onNicknameChange={setNickname}
          onPasswordChange={setPassword}
          onRefreshToken={() => void handleRefreshToken()}
          onSignIn={handleSignIn}
          onSignOut={() => void handleSignOut()}
        />
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
          isAuthenticated={isAuthenticated}
          isBusy={isBusy}
          joinCode={joinCode}
          roomTitle={roomTitle}
          onCreateRoom={handleCreateRoom}
          onJoinCodeChange={(value) => setJoinCode(normalizeRoomCode(value))}
          onJoinRoom={handleJoinRoom}
          onRoomTitleChange={setRoomTitle}
        />
      ) : null}

      {viewMode === "room" ? (
        <RoomView
          activeRoomCode={activeRoomCode}
          canUseRoomActions={canUseRoomActions}
          images={images}
          isBusy={isBusy}
          resourceErrors={resourceErrors}
          resourceState={resourceState}
          room={room}
          onRefreshRoom={() => void handleRefreshRoom()}
          onUpload={(file) => void handleUpload(file)}
        />
      ) : null}

      {viewMode === "play" ? <PlayView imageCount={images.length} room={room} /> : null}

      {viewMode === "gallery" ? (
        <GalleryView
          isBusy={isBusy}
          nextCursor={nextResultCursor}
          results={results}
          state={resourceState.results}
          error={resourceErrors.results}
          onDownload={(resultId) => void handleDownloadResult(resultId)}
          onLoadMore={() => void handleLoadResults(nextResultCursor)}
        />
      ) : null}
    </main>
  );
}

interface AuthPanelProps {
  apiBaseUrl: string;
  authUser: User | null;
  email: string;
  isBusy: boolean;
  manualToken: string;
  nickname: string;
  password: string;
  profile: UserProfile | null;
  onApiBaseUrlChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onManualTokenChange: (value: string) => void;
  onNicknameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onRefreshToken: () => void;
  onSignIn: (event: FormEvent<HTMLFormElement>) => void;
  onSignOut: () => void;
}

function AuthPanel(props: AuthPanelProps) {
  return (
    <div className="connection-panel" aria-label="로그인 및 API 연결 설정">
      <label>
        API 서버
        <input value={props.apiBaseUrl} onChange={(event) => props.onApiBaseUrlChange(event.target.value)} spellCheck={false} />
      </label>

      {props.authUser ? (
        <section className="auth-summary">
          <div>
            <strong>{props.profile?.nickname ?? props.authUser.email ?? "Firebase 사용자"}</strong>
            <span>{props.authUser.email}</span>
          </div>
          <div className="auth-actions">
            <button className="icon-button" disabled={props.isBusy} onClick={props.onRefreshToken} type="button">
              <KeyRound size={18} />
              토큰 갱신
            </button>
            <button className="secondary-button" disabled={props.isBusy} onClick={props.onSignOut} type="button">
              <LogOut size={18} />
              로그아웃
            </button>
          </div>
        </section>
      ) : (
        <form className="auth-form" onSubmit={props.onSignIn}>
          <label>
            이메일
            <input
              autoComplete="email"
              type="email"
              value={props.email}
              onChange={(event) => props.onEmailChange(event.target.value)}
            />
          </label>
          <label>
            비밀번호
            <input
              autoComplete="current-password"
              type="password"
              value={props.password}
              onChange={(event) => props.onPasswordChange(event.target.value)}
            />
          </label>
          <label>
            닉네임
            <input value={props.nickname} onChange={(event) => props.onNicknameChange(event.target.value)} />
          </label>
          <button className="primary-button" disabled={props.isBusy} type="submit">
            <LogIn size={18} />
            Firebase 로그인
          </button>
        </form>
      )}

      <details className="dev-token-panel">
        <summary>개발용 토큰 fallback</summary>
        <label>
          Firebase ID Token
          <textarea
            placeholder="로컬 테스트용 ID token"
            rows={3}
            spellCheck={false}
            value={props.manualToken}
            onChange={(event) => props.onManualTokenChange(event.target.value)}
          />
        </label>
      </details>
    </div>
  );
}

interface LobbyViewProps {
  roomTitle: string;
  joinCode: string;
  isAuthenticated: boolean;
  isBusy: boolean;
  onRoomTitleChange: (value: string) => void;
  onJoinCodeChange: (value: string) => void;
  onCreateRoom: (event: FormEvent<HTMLFormElement>) => void;
  onJoinRoom: (event: FormEvent<HTMLFormElement>) => void;
}

function LobbyView(props: LobbyViewProps) {
  const actionDisabled = props.isBusy || !props.isAuthenticated;

  return (
    <section className="content-grid">
      <form className="paper-card action-card" onSubmit={props.onCreateRoom}>
        <div className="card-heading">
          <Plus size={20} />
          <h2>방 만들기</h2>
        </div>
        {!props.isAuthenticated ? <p className="notice-copy">로그인 후 방을 만들 수 있습니다.</p> : null}
        <label>
          방 이름
          <input disabled={!props.isAuthenticated} value={props.roomTitle} onChange={(event) => props.onRoomTitleChange(event.target.value)} />
        </label>
        <button className="primary-button" disabled={actionDisabled} type="submit">
          <Plus size={18} />새 방 만들기
        </button>
      </form>

      <form className="paper-card action-card" onSubmit={props.onJoinRoom}>
        <div className="card-heading">
          <LogIn size={20} />
          <h2>방 입장</h2>
        </div>
        {!props.isAuthenticated ? <p className="notice-copy">로그인 후 방 코드로 입장할 수 있습니다.</p> : null}
        <label>
          방 코드
          <input
            disabled={!props.isAuthenticated}
            maxLength={6}
            spellCheck={false}
            value={props.joinCode}
            onChange={(event) => props.onJoinCodeChange(event.target.value)}
          />
        </label>
        <button className="secondary-button" disabled={actionDisabled || !props.joinCode.trim()} type="submit">
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
  resourceState: ResourceState;
  resourceErrors: ResourceErrors;
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
        <ImageList error={props.resourceErrors.images} images={props.images} state={props.resourceState.images} />
      </div>

      <ParticipantPanel error={props.resourceErrors.participants} room={props.room} state={props.resourceState.participants} />
    </section>
  );
}

function ImageList({ error, images, state }: { error: string | null; images: ImageMetadata[]; state: LoadState }) {
  if (state === "loading") {
    return <p className="state-copy">이미지 목록을 불러오는 중입니다.</p>;
  }

  if (state === "error") {
    return <p className="error-copy">{error ?? "이미지 목록을 불러오지 못했습니다."}</p>;
  }

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

function ParticipantPanel({ error, room, state }: { error: string | null; room: RoomDetail | null; state: LoadState }) {
  return (
    <aside className="paper-card participants-card">
      <div className="card-heading">
        <Users size={20} />
        <h2>참가자</h2>
      </div>
      {state === "loading" ? <p className="state-copy">참가자 목록을 불러오는 중입니다.</p> : null}
      {state === "error" ? <p className="error-copy">{error ?? "참가자 목록을 불러오지 못했습니다."}</p> : null}
      {state !== "loading" && state !== "error" && room && room.participants.length > 0 ? (
        <ul className="participant-list">
          {room.participants.map((participant) => (
            <li key={participant.firebaseUid}>
              <span>{participant.nickname ?? "익명 참가자"}</span>
              {participant.isHost ? <strong>Host</strong> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {state !== "loading" && state !== "error" && (!room || room.participants.length === 0) ? (
        <p className="empty-copy">아직 참가자가 없습니다.</p>
      ) : null}
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
  state: LoadState;
  error: string | null;
  onLoadMore: () => void;
  onDownload: (resultId: string) => void;
}

function GalleryView(props: GalleryViewProps) {
  if (props.state === "loading") {
    return (
      <section className="paper-card gallery-empty">
        <RefreshCw size={28} />
        <h2>결과를 불러오는 중입니다.</h2>
      </section>
    );
  }

  if (props.state === "error") {
    return (
      <section className="paper-card gallery-empty">
        <Download size={28} />
        <h2>{props.error ?? "결과 목록을 불러오지 못했습니다."}</h2>
      </section>
    );
  }

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
          <RefreshCw size={18} />더 보기
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
    return formatApiError(error);
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "알 수 없는 오류가 발생했습니다.";
}

function formatApiError(error: ApiClientError): string {
  const messages: Record<string, string> = {
    AUTH_TOKEN_MISSING: "로그인이 필요합니다.",
    ROOM_NOT_FOUND: "방을 찾을 수 없습니다.",
    ROOM_ACCESS_DENIED: "이 방에 접근할 권한이 없습니다.",
    ROOM_PAYLOAD_INVALID: "방 요청 형식이 올바르지 않습니다.",
    IMAGE_FILE_INVALID: "이미지 파일을 확인해 주세요.",
    RESULT_NOT_FOUND: "결과를 찾을 수 없습니다.",
    RESULT_FILE_NOT_FOUND: "결과 이미지 파일을 찾을 수 없습니다.",
    RESULT_QUERY_INVALID: "결과 목록 요청 조건이 올바르지 않습니다."
  };

  return messages[error.code] ?? "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}
