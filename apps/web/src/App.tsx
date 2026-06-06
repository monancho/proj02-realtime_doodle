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
  Save,
  Upload,
  Users
} from "lucide-react";
import { FormEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ImageMetadata, ListRoomResultsResponse, ResultMetadata, RoomDetail, UserProfile } from "@doodle/shared";
import type { User } from "firebase/auth";
import { io, type Socket } from "socket.io-client";
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

interface ChatMessage {
  roomCode: string;
  type: "chat";
  firebaseUid: string;
  nickname: string | null;
  avatarUrl: string | null;
  message: string;
  createdAt: string;
}

interface SocketErrorPayload {
  code: string;
  message?: string;
}

interface DrawPoint {
  x: number;
  y: number;
  t: number;
}

interface DrawStroke {
  color: string;
  width: number;
  points: DrawPoint[];
}

interface DrawStrokePayload {
  roomCode: string;
  roundId: string;
  stroke: DrawStroke;
  firebaseUid?: string;
  createdAt?: string;
}

interface RoundStartedPayload {
  roomCode: string;
  roundId: string;
  roundIndex: number;
  image: ImageMetadata;
  durationSec: number;
  startedAt: string;
}

interface RoundEndedPayload {
  roomCode: string;
  roundId: string;
  roundIndex: number;
  image: ImageMetadata;
  endedAt: string;
}

interface ActiveRound extends RoundStartedPayload {
  endedAt: string | null;
}

const defaultApiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
const defaultSocketUrl = import.meta.env.VITE_SOCKET_URL ?? defaultApiBaseUrl;
const acceptedImageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxImageSizeBytes = 10 * 1024 * 1024;
const maxChatMessageLength = 200;
const maxStrokePointsPerPayload = 128;
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
  const [nickname, setNickname] = useState("");
  const [roomTitle, setRoomTitle] = useState("우리 낙서방");
  const [joinCode, setJoinCode] = useState("");
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [images, setImages] = useState<ImageMetadata[]>([]);
  const [results, setResults] = useState<ResultMetadata[]>([]);
  const [nextResultCursor, setNextResultCursor] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("lobby");
  const [message, setMessage] = useState("Google로 로그인한 뒤 방을 만들거나 입장하세요.");
  const [isBusy, setIsBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [socketStatus, setSocketStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [socketError, setSocketError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [drawStrokes, setDrawStrokes] = useState<DrawStroke[]>([]);
  const [activeRound, setActiveRound] = useState<ActiveRound | null>(null);
  const [roundEnded, setRoundEnded] = useState<RoundEndedPayload | null>(null);
  const [gameFinishedAt, setGameFinishedAt] = useState<string | null>(null);
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const [resourceState, setResourceState] = useState<ResourceState>(initialResourceState);
  const [resourceErrors, setResourceErrors] = useState<ResourceErrors>(initialResourceErrors);
  const socketRef = useRef<Socket | null>(null);

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

  useEffect(() => {
    if (!room || !activeToken.trim()) {
      disconnectSocket();
      return;
    }

    const roomCode = normalizeRoomCode(room.roomCode);
    setSocketStatus("connecting");
    setSocketError(null);

    const socket = io(defaultSocketUrl, {
      auth: {
        token: activeToken
      },
      transports: ["websocket"]
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketStatus("connected");
      socket.emit("join-room", { roomCode });
    });

    socket.on("disconnect", () => {
      setSocketStatus("idle");
    });

    socket.on("connect_error", () => {
      setSocketStatus("error");
      setSocketError("Socket 연결에 실패했습니다.");
    });

    socket.on("socket-error", (payload: SocketErrorPayload) => {
      setSocketStatus("error");
      setSocketError(formatSocketError(payload));
    });

    socket.on("room-updated", (payload: { room: RoomDetail }) => {
      setRoom(payload.room);
      markRoomReady(payload.room);
    });

    socket.on("receive-message", (payload: ChatMessage) => {
      setChatMessages((currentMessages) => [...currentMessages.slice(-99), payload]);
    });

    socket.on("draw-stroke", (payload: DrawStrokePayload) => {
      setDrawStrokes((currentStrokes) => [...currentStrokes.slice(-399), payload.stroke]);
    });

    socket.on("round-started", (payload: RoundStartedPayload) => {
      setActiveRound({ ...payload, endedAt: null });
      setRoundEnded(null);
      setGameFinishedAt(null);
      setDrawStrokes([]);
      setViewMode("play");
      setMessage(`Round ${payload.roundIndex + 1}이 시작되었습니다.`);
    });

    socket.on("round-ended", (payload: RoundEndedPayload) => {
      setRoundEnded(payload);
      setActiveRound((currentRound) =>
        currentRound && currentRound.roundId === payload.roundId ? { ...currentRound, endedAt: payload.endedAt } : currentRound
      );
      setMessage(`Round ${payload.roundIndex + 1}이 종료되었습니다.`);
    });

    socket.on("game-finished", (payload: { roomCode: string; room: RoomDetail; finishedAt: string }) => {
      setRoom(payload.room);
      setGameFinishedAt(payload.finishedAt);
      setMessage("게임이 종료되었습니다. 갤러리에서 결과를 확인하세요.");
    });

    return () => {
      socket.emit("leave-room", { roomCode });
      socket.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [activeToken, room?.roomCode]);

  useEffect(() => {
    if (!activeRound || activeRound.endedAt) {
      setRemainingSec(null);
      return;
    }

    const updateRemaining = () => {
      const startedAtMs = new Date(activeRound.startedAt).getTime();
      const elapsedSec = Math.floor((Date.now() - startedAtMs) / 1000);
      setRemainingSec(Math.max(0, activeRound.durationSec - elapsedSec));
    };

    updateRemaining();
    const intervalId = window.setInterval(updateRemaining, 1000);

    return () => window.clearInterval(intervalId);
  }, [activeRound]);

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

  async function handleSignInWithGoogle() {
    await runAction(async () => {
      const firebase = createFirebaseClient();
      const signedInUser = await firebase.signInWithGoogle();
      const idToken = await signedInUser.getIdToken();
      const authenticatedApi = createApiClient({
        baseUrl: apiBaseUrl,
        getToken: () => idToken
      });
      const upsertedProfile = await authenticatedApi.upsertMe({
        nickname: signedInUser.displayName || null,
        avatarUrl: signedInUser.photoURL || null
      });

      setAuthUser(signedInUser);
      setFirebaseToken(idToken);
      setManualToken("");
      setProfile(upsertedProfile);
      setNickname(upsertedProfile.nickname ?? signedInUser.displayName ?? "");
      setMessage(`${upsertedProfile.nickname ?? upsertedProfile.email ?? "사용자"}님, 로그인되었습니다.`);
    });
  }

  async function handleSaveNickname(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!authUser || !firebaseToken) {
      setMessage("Google 로그인 후 닉네임을 설정할 수 있습니다.");
      return;
    }

    await runAction(async () => {
      const updatedProfile = await api.upsertMe({
        nickname: nickname.trim() || authUser.displayName || null,
        avatarUrl: authUser.photoURL || null
      });

      setProfile(updatedProfile);
      setMessage(`${updatedProfile.nickname ?? "사용자"} 닉네임을 저장했습니다.`);
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
      setNickname("");
      resetRoomState();
      setViewMode("lobby");
      setMessage("로그아웃했습니다. 방 상태와 토큰을 정리했습니다.");
    });
  }

  async function handleCreateRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isAuthenticated) {
      setMessage("Google 로그인 후 방을 만들 수 있습니다.");
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
      setMessage("Google 로그인 후 방에 입장할 수 있습니다.");
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

    const validationError = validateImageFile(file);

    if (validationError) {
      setUploadError(validationError);
      setMessage(validationError);
      return;
    }

    await runAction(async () => {
      setUploadError(null);
      setResourceState((current) => ({ ...current, images: "loading" }));
      const uploadedImage = await api.uploadImage(room.roomCode, file);
      const freshImages = await api.listImages(room.roomCode);
      setImages(freshImages);
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

  function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!room || !socketRef.current || socketStatus !== "connected") {
      setSocketError("Socket room에 연결된 뒤 채팅을 보낼 수 있습니다.");
      return;
    }

    const trimmedMessage = chatDraft.trim();

    if (!trimmedMessage) {
      setSocketError("빈 메시지는 보낼 수 없습니다.");
      return;
    }

    if (trimmedMessage.length > maxChatMessageLength) {
      setSocketError("메시지는 200자 이하로 입력해 주세요.");
      return;
    }

    socketRef.current.emit("send-message", {
      roomCode: normalizeRoomCode(room.roomCode),
      message: trimmedMessage
    });
    setChatDraft("");
    setSocketError(null);
  }

  function handleDrawStroke(stroke: DrawStroke) {
    if (!room || !socketRef.current || socketStatus !== "connected") {
      setSocketError("Socket room에 연결된 뒤 그림을 그릴 수 있습니다.");
      return;
    }

    if (room.status !== "playing") {
      setSocketError("라운드가 진행 중일 때만 그림을 그릴 수 있습니다.");
      return;
    }

    const roomCode = normalizeRoomCode(room.roomCode);
    const roundId = activeRound?.roundId ?? createClientRoundId(room);
    const batches = chunkStroke(stroke, maxStrokePointsPerPayload);

    setDrawStrokes((currentStrokes) => [...currentStrokes.slice(-399), ...batches]);

    for (const batch of batches) {
      socketRef.current.emit("draw-stroke", {
        roomCode,
        roundId,
        stroke: batch
      });
    }
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
    disconnectSocket();
    setRoom(null);
    setImages([]);
    setResults([]);
    setNextResultCursor(null);
    setJoinCode("");
    setResourceState(initialResourceState);
    setResourceErrors(initialResourceErrors);
    setChatMessages([]);
    setChatDraft("");
    setDrawStrokes([]);
    setActiveRound(null);
    setRoundEnded(null);
    setGameFinishedAt(null);
    setRemainingSec(null);
    setSocketError(null);
    setSocketStatus("idle");
  }

  function disconnectSocket() {
    if (socketRef.current) {
      if (room) {
        socketRef.current.emit("leave-room", { roomCode: normalizeRoomCode(room.roomCode) });
      }
      socketRef.current.disconnect();
      socketRef.current = null;
    }
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
          isBusy={isBusy}
          manualToken={manualToken}
          nickname={nickname}
          profile={profile}
          onApiBaseUrlChange={setApiBaseUrl}
          onManualTokenChange={(value) => {
            setManualToken(value);
            if (value.trim()) {
              setFirebaseToken("");
              setAuthUser(null);
              setProfile(null);
            }
          }}
          onNicknameChange={setNickname}
          onRefreshToken={() => void handleRefreshToken()}
          onSaveNickname={handleSaveNickname}
          onSignInWithGoogle={() => void handleSignInWithGoogle()}
          onSignOut={() => void handleSignOut()}
        />
      </section>

      {room ? (
        <nav className="mode-tabs" aria-label="방 화면 전환">
          <TabButton isActive={viewMode === "lobby"} onClick={() => setViewMode("lobby")} icon={<LogIn size={18} />}>
            로비
          </TabButton>
          <TabButton isActive={viewMode === "room"} onClick={() => setViewMode("room")} icon={<Users size={18} />}>
            방 준비
          </TabButton>
          <TabButton isActive={viewMode === "play"} onClick={() => setViewMode("play")} icon={<Palette size={18} />}>
            그리기
          </TabButton>
          <TabButton isActive={viewMode === "gallery"} onClick={() => void handleLoadResults()} icon={<Download size={18} />}>
            결과
          </TabButton>
        </nav>
      ) : null}

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
          uploadError={uploadError}
          onRefreshRoom={() => void handleRefreshRoom()}
          onUpload={(file) => void handleUpload(file)}
        />
      ) : null}

      {viewMode === "play" ? (
        <PlayView
          activeRound={activeRound}
          chatDraft={chatDraft}
          chatMessages={chatMessages}
          drawStrokes={drawStrokes}
          gameFinishedAt={gameFinishedAt}
          imageCount={images.length}
          remainingSec={remainingSec}
          room={room}
          roundEnded={roundEnded}
          socketError={socketError}
          socketStatus={socketStatus}
          onChatDraftChange={setChatDraft}
          onDrawStroke={handleDrawStroke}
          onOpenGallery={() => void handleLoadResults()}
          onSendMessage={handleSendMessage}
        />
      ) : null}

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
  isBusy: boolean;
  manualToken: string;
  nickname: string;
  profile: UserProfile | null;
  onApiBaseUrlChange: (value: string) => void;
  onManualTokenChange: (value: string) => void;
  onNicknameChange: (value: string) => void;
  onRefreshToken: () => void;
  onSaveNickname: (event: FormEvent<HTMLFormElement>) => void;
  onSignInWithGoogle: () => void;
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
          <form className="nickname-form" onSubmit={props.onSaveNickname}>
            <label>
              닉네임
              <input value={props.nickname} onChange={(event) => props.onNicknameChange(event.target.value)} />
            </label>
            <button className="primary-button" disabled={props.isBusy} type="submit">
              <Save size={18} />
              저장
            </button>
          </form>
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
        <button className="primary-button google-button" disabled={props.isBusy} onClick={props.onSignInWithGoogle} type="button">
          <LogIn size={18} />
          Google로 계속하기
        </button>
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
  uploadError: string | null;
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
          <span>JPEG, PNG, WebP 이미지를 선택하세요. 최대 10MB까지 업로드할 수 있습니다.</span>
          <input
            accept="image/jpeg,image/png,image/webp"
            disabled={!props.canUseRoomActions || props.isBusy}
            type="file"
            onChange={(event) => props.onUpload(event.currentTarget.files?.item(0) ?? null)}
          />
        </label>
        {props.uploadError ? <p className="error-copy">{props.uploadError}</p> : null}
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
          <span>
            {image.originalName}
            <small>{formatBytes(image.size)}</small>
          </span>
          <strong>{image.used ? "사용됨" : "대기 중"}</strong>
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

interface PlayViewProps {
  room: RoomDetail | null;
  imageCount: number;
  socketStatus: "idle" | "connecting" | "connected" | "error";
  socketError: string | null;
  chatMessages: ChatMessage[];
  chatDraft: string;
  drawStrokes: DrawStroke[];
  activeRound: ActiveRound | null;
  roundEnded: RoundEndedPayload | null;
  gameFinishedAt: string | null;
  remainingSec: number | null;
  onChatDraftChange: (value: string) => void;
  onDrawStroke: (stroke: DrawStroke) => void;
  onOpenGallery: () => void;
  onSendMessage: (event: FormEvent<HTMLFormElement>) => void;
}

function PlayView(props: PlayViewProps) {
  return (
    <section className="play-layout">
      <CanvasPanel
        disabled={
          !props.room ||
          props.room.status !== "playing" ||
          props.socketStatus !== "connected" ||
          !props.activeRound ||
          Boolean(props.activeRound.endedAt)
        }
        strokes={props.drawStrokes}
        title={props.activeRound ? `Round ${props.activeRound.roundIndex + 1}` : "캔버스 준비 중"}
        onDrawStroke={props.onDrawStroke}
      />
      <aside className="paper-card chat-card">
        <RoundStatusPanel
          activeRound={props.activeRound}
          gameFinishedAt={props.gameFinishedAt}
          remainingSec={props.remainingSec}
          roundEnded={props.roundEnded}
          onOpenGallery={props.onOpenGallery}
        />
        <div className="card-heading">
          <MessageCircle size={20} />
          <h2>채팅</h2>
        </div>
        <div className="socket-status" data-state={props.socketStatus}>
          Socket: {formatSocketStatus(props.socketStatus)}
        </div>
        {props.socketError ? <p className="error-copy">{props.socketError}</p> : null}
        <div className="chat-list" aria-live="polite">
          {props.chatMessages.length === 0 ? (
            <p className="empty-copy">아직 메시지가 없습니다.</p>
          ) : (
            props.chatMessages.map((chatMessage, index) => (
              <article className="chat-message" key={`${chatMessage.createdAt}-${index}`}>
                <strong>{chatMessage.nickname ?? "익명 참가자"}</strong>
                <p>{chatMessage.message}</p>
                <time>{formatDateTime(chatMessage.createdAt)}</time>
              </article>
            ))
          )}
        </div>
        <form className="chat-form" onSubmit={props.onSendMessage}>
          <label>
            메시지
            <input
              maxLength={maxChatMessageLength}
              value={props.chatDraft}
              onChange={(event) => props.onChatDraftChange(event.target.value)}
            />
          </label>
          <button className="primary-button" disabled={props.socketStatus !== "connected"} type="submit">
            보내기
          </button>
        </form>
        <div className="round-meter">
          <Play size={18} />
          <span>{props.imageCount}개 이미지 준비됨</span>
        </div>
      </aside>
    </section>
  );
}

interface RoundStatusPanelProps {
  activeRound: ActiveRound | null;
  roundEnded: RoundEndedPayload | null;
  gameFinishedAt: string | null;
  remainingSec: number | null;
  onOpenGallery: () => void;
}

function RoundStatusPanel(props: RoundStatusPanelProps) {
  if (props.gameFinishedAt) {
    return (
      <section className="round-status finished">
        <strong>게임 종료</strong>
        <span>{formatDateTime(props.gameFinishedAt)}</span>
        <button className="primary-button" onClick={props.onOpenGallery} type="button">
          갤러리 보기
        </button>
      </section>
    );
  }

  if (props.roundEnded) {
    return (
      <section className="round-status ended">
        <strong>Round {props.roundEnded.roundIndex + 1} 종료</strong>
        <span>다음 라운드를 기다리는 중입니다.</span>
      </section>
    );
  }

  if (props.activeRound) {
    return (
      <section className="round-status playing">
        <strong>Round {props.activeRound.roundIndex + 1}</strong>
        <span>{props.remainingSec ?? props.activeRound.durationSec}초 남음</span>
      </section>
    );
  }

  return (
    <section className="round-status">
      <strong>라운드 대기</strong>
      <span>방장이 게임을 시작하면 타이머가 표시됩니다.</span>
    </section>
  );
}
interface CanvasPanelProps {
  disabled: boolean;
  strokes: DrawStroke[];
  title: string;
  onDrawStroke: (stroke: DrawStroke) => void;
}

function CanvasPanel(props: CanvasPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const draftPointsRef = useRef<DrawPoint[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#fffefa";
    context.fillRect(0, 0, canvas.width, canvas.height);

    for (const stroke of props.strokes) {
      drawStroke(context, stroke, canvas.width, canvas.height);
    }
  }, [props.strokes]);

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (props.disabled) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    draftPointsRef.current = [createPoint(event)];
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (props.disabled || draftPointsRef.current.length === 0) {
      return;
    }

    draftPointsRef.current = [...draftPointsRef.current, createPoint(event)];
    previewDraftStroke(event.currentTarget, draftPointsRef.current);
  }

  function handlePointerUp(event: PointerEvent<HTMLCanvasElement>) {
    if (props.disabled || draftPointsRef.current.length === 0) {
      return;
    }

    const points = [...draftPointsRef.current, createPoint(event)].slice(0, maxStrokePointsPerPayload * 2);
    draftPointsRef.current = [];

    if (points.length < 1) {
      return;
    }

    props.onDrawStroke({
      color: "#222222",
      width: 4,
      points
    });
  }

  return (
    <div className={props.disabled ? "canvas-stage disabled" : "canvas-stage"}>
      <div className="canvas-header">
        <Palette size={20} />
        <span>{props.title}</span>
      </div>
      <canvas
        ref={canvasRef}
        aria-label="낙서 캔버스"
        height={720}
        width={960}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          draftPointsRef.current = [];
        }}
      />
      {props.disabled ? <p className="canvas-lock">Socket 연결과 playing 상태가 준비되면 그림을 그릴 수 있습니다.</p> : null}
    </div>
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
    <>
      <section className="gallery-toolbar" aria-label="결과 갤러리 상태">
        <span>결과 {props.results.length}개</span>
        <span>{props.nextCursor ? "더 불러올 결과가 있습니다." : "마지막 결과까지 불러왔습니다."}</span>
      </section>
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
              PNG 다운로드
            </button>
          </article>
        ))}
        {props.nextCursor ? (
          <button className="secondary-button gallery-more" disabled={props.isBusy} onClick={props.onLoadMore} type="button">
            <RefreshCw size={18} />결과 더 보기
          </button>
        ) : null}
      </section>
    </>
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

function formatSocketError(payload: SocketErrorPayload): string {
  const messages: Record<string, string> = {
    ROOM_PAYLOAD_INVALID: "방 연결 요청이 올바르지 않습니다.",
    ROOM_NOT_FOUND: "Socket으로 연결할 방을 찾을 수 없습니다.",
    ROOM_ACCESS_DENIED: "이 방의 Socket room에 참여할 권한이 없습니다.",
    MESSAGE_PAYLOAD_INVALID: "채팅 메시지를 확인해 주세요.",
    MESSAGE_ROOM_NOT_JOINED: "Socket room에 참여한 뒤 메시지를 보낼 수 있습니다."
  };

  return messages[payload.code] ?? "Socket 요청을 처리하지 못했습니다.";
}

function formatSocketStatus(status: "idle" | "connecting" | "connected" | "error"): string {
  const labels = {
    idle: "대기",
    connecting: "연결 중",
    connected: "연결됨",
    error: "오류"
  };

  return labels[status];
}

function createPoint(event: PointerEvent<HTMLCanvasElement>): DrawPoint {
  const rect = event.currentTarget.getBoundingClientRect();

  return {
    x: clamp((event.clientX - rect.left) / rect.width),
    y: clamp((event.clientY - rect.top) / rect.height),
    t: Date.now()
  };
}

function drawStroke(context: CanvasRenderingContext2D, stroke: DrawStroke, width: number, height: number) {
  if (stroke.points.length === 0) {
    return;
  }

  context.strokeStyle = stroke.color;
  context.lineWidth = stroke.width;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();

  const [firstPoint, ...restPoints] = stroke.points;
  context.moveTo(firstPoint.x * width, firstPoint.y * height);

  for (const point of restPoints) {
    context.lineTo(point.x * width, point.y * height);
  }

  context.stroke();
}

function previewDraftStroke(canvas: HTMLCanvasElement, points: DrawPoint[]) {
  const context = canvas.getContext("2d");

  if (!context || points.length < 2) {
    return;
  }

  drawStroke(
    context,
    {
      color: "#222222",
      width: 4,
      points: points.slice(-2)
    },
    canvas.width,
    canvas.height
  );
}

function chunkStroke(stroke: DrawStroke, chunkSize: number): DrawStroke[] {
  const chunks: DrawStroke[] = [];

  for (let index = 0; index < stroke.points.length; index += chunkSize) {
    chunks.push({
      ...stroke,
      points: stroke.points.slice(index, index + chunkSize)
    });
  }

  return chunks;
}

function createClientRoundId(room: RoomDetail): string {
  return `round-${room.currentRoundIndex}`;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function validateImageFile(file: File): string | null {
  if (file.size === 0) {
    return "빈 파일은 업로드할 수 없습니다.";
  }

  if (file.size > maxImageSizeBytes) {
    return "이미지는 10MB 이하만 업로드할 수 있습니다.";
  }

  if (!acceptedImageMimeTypes.has(file.type)) {
    return "JPEG, PNG, WebP 이미지만 업로드할 수 있습니다.";
  }

  return null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
