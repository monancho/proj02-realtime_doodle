import {
  Download,
  ImagePlus,
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
type ModalMode = "create-room" | "join-room" | "nickname";
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
  strokeId: string;
  tool: "pen" | "eraser";
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

interface ResultSavedPayload {
  roomCode: string;
  roundId: string;
  roundIndex: number;
  result: ResultMetadata;
  createdAt: string;
}

interface ActiveRound extends RoundStartedPayload {
  endedAt: string | null;
}

interface UploadPreview {
  file: File;
  url: string;
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
  const [activeModal, setActiveModal] = useState<ModalMode | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<UploadPreview | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [socketStatus, setSocketStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [socketError, setSocketError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [drawStrokes, setDrawStrokes] = useState<DrawStroke[]>([]);
  const [activeRound, setActiveRound] = useState<ActiveRound | null>(null);
  const [activeRoundImageUrl, setActiveRoundImageUrl] = useState<string | null>(null);
  const [roundEnded, setRoundEnded] = useState<RoundEndedPayload | null>(null);
  const [gameFinishedAt, setGameFinishedAt] = useState<string | null>(null);
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const [resourceState, setResourceState] = useState<ResourceState>(initialResourceState);
  const [resourceErrors, setResourceErrors] = useState<ResourceErrors>(initialResourceErrors);
  const socketRef = useRef<Socket | null>(null);

  const activeToken = firebaseToken;
  const isAuthenticated = Boolean(authUser && activeToken.trim());

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: defaultApiBaseUrl,
        getToken: () => activeToken
      }),
    [activeToken]
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
      setSocketError(formatSocketError(payload));
    });

    socket.on("room-updated", (payload: { room: RoomDetail }) => {
      setRoom(payload.room);
      markRoomReady(payload.room);
      void refreshRoomImages(payload.room.roomCode);
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

    socket.on("result-saved", (payload: ResultSavedPayload) => {
      setResults((currentResults) => {
        const knownIds = new Set(currentResults.map((result) => result.id));
        return knownIds.has(payload.result.id) ? currentResults : [payload.result, ...currentResults];
      });
      setNextResultCursor(null);
      setResourceState((current) => ({ ...current, results: "ready" }));
      setViewMode("gallery");
      setMessage(`Round ${payload.roundIndex + 1} 결과가 저장되었습니다.`);
    });

    socket.on("game-finished", (payload: { roomCode: string; room: RoomDetail; finishedAt: string }) => {
      setRoom(payload.room);
      setGameFinishedAt(payload.finishedAt);
      setViewMode("gallery");
      void refreshResults(payload.roomCode);
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
    return () => {
      if (uploadPreview) {
        URL.revokeObjectURL(uploadPreview.url);
      }
    };
  }, [uploadPreview]);

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

  useEffect(() => {
    if (!activeRound) {
      setActiveRoundImageUrl((currentUrl) => {
        if (currentUrl) {
          URL.revokeObjectURL(currentUrl);
        }

        return null;
      });
      return;
    }

    let isCancelled = false;
    let nextUrl: string | null = null;

    api
      .downloadImage(activeRound.image.id)
      .then((blob) => {
        if (isCancelled) {
          return;
        }

        nextUrl = URL.createObjectURL(blob);
        setActiveRoundImageUrl((currentUrl) => {
          if (currentUrl) {
            URL.revokeObjectURL(currentUrl);
          }

          return nextUrl;
        });
      })
      .catch((error) => {
        if (!isCancelled) {
          setSocketError(formatError(error));
        }
      });

    return () => {
      isCancelled = true;
      if (nextUrl) {
        URL.revokeObjectURL(nextUrl);
      }
    };
  }, [activeRound?.image.id, api]);

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
        baseUrl: defaultApiBaseUrl,
        getToken: () => idToken
      });
      const upsertedProfile = await authenticatedApi.upsertMe({
        nickname: signedInUser.displayName || null,
        avatarUrl: signedInUser.photoURL || null
      });

      setAuthUser(signedInUser);
      setFirebaseToken(idToken);
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
      if (room && socketRef.current) {
        socketRef.current.emit("profile-updated", {
          roomCode: normalizeRoomCode(room.roomCode)
        });
      }
      setActiveModal(null);
      setMessage(`${updatedProfile.nickname ?? "사용자"} 닉네임을 저장했습니다.`);
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
      setNickname("");
      setActiveModal(null);
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
      setActiveModal(null);
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
      setActiveModal(null);
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

  function handleSelectUploadFile(file: File | null) {
    if (!room || !file) {
      return;
    }

    if (myUploadedImage) {
      setUploadError("이미 이 방에 이미지를 업로드했습니다.");
      return;
    }

    const validationError = validateImageFile(file);

    if (validationError) {
      setUploadError(validationError);
      setMessage(validationError);
      return;
    }

    clearUploadPreview();
    setUploadError(null);
    setUploadPreview({
      file,
      url: URL.createObjectURL(file)
    });
  }

  async function handleConfirmUpload() {
    if (!room || !uploadPreview) {
      return;
    }

    await runAction(async () => {
      setUploadError(null);
      setResourceState((current) => ({ ...current, images: "loading" }));
      const uploadedImage = await api.uploadImage(room.roomCode, uploadPreview.file);
      const freshImages = await api.listImages(room.roomCode);
      setImages(freshImages);
      setResourceState((current) => ({ ...current, images: "ready" }));
      setResourceErrors((current) => ({ ...current, images: null }));
      clearUploadPreview();
      setMessage(`${uploadedImage.originalName} 업로드가 완료되었습니다.`);
    });
  }

  function clearUploadPreview() {
    setUploadPreview((currentPreview) => {
      if (currentPreview) {
        URL.revokeObjectURL(currentPreview.url);
      }

      return null;
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

  async function refreshResults(roomCode: string) {
    try {
      setResourceState((current) => ({ ...current, results: "loading" }));
      const response = await api.listResults(roomCode);
      setResults(response.results);
      setNextResultCursor(response.page.nextCursor);
      setResourceState((current) => ({ ...current, results: "ready" }));
      setResourceErrors((current) => ({ ...current, results: null }));
    } catch (error) {
      setResourceState((current) => ({ ...current, results: "error" }));
      setResourceErrors((current) => ({ ...current, results: formatError(error) }));
    }
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

  function handleStartGame() {
    if (!room || !socketRef.current || socketStatus !== "connected") {
      setSocketError("방 연결이 준비되면 시작할 수 있습니다.");
      return;
    }

    if (!isCurrentUserHost) {
      setSocketError("방장만 시작할 수 있습니다.");
      return;
    }

    if (!areAllParticipantsReady) {
      setSocketError("모든 참가자가 이미지를 1장씩 업로드해야 시작할 수 있습니다.");
      return;
    }

    socketRef.current.emit("start-game", {
      roomCode: normalizeRoomCode(room.roomCode)
    });
    setSocketError(null);
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

  async function refreshRoomImages(roomCode: string) {
    try {
      const freshImages = await api.listImages(roomCode);
      setImages(freshImages);
      setResourceState((current) => ({ ...current, images: "ready" }));
      setResourceErrors((current) => ({ ...current, images: null }));
    } catch (error) {
      setResourceState((current) => ({ ...current, images: "error" }));
      setResourceErrors((current) => ({ ...current, images: formatError(error) }));
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
    setActiveRoundImageUrl(null);
    setRoundEnded(null);
    setGameFinishedAt(null);
    setRemainingSec(null);
    setSocketError(null);
    setSocketStatus("idle");
    clearUploadPreview();
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
  const currentFirebaseUid = authUser?.uid ?? profile?.firebaseUid ?? null;
  const uploadedFirebaseUids = new Set(images.map((image) => image.uploadedBy.firebaseUid));
  const myUploadedImage = currentFirebaseUid
    ? images.find((image) => image.uploadedBy.firebaseUid === currentFirebaseUid) ?? null
    : null;
  const readyParticipantCount = room?.participants.filter((participant) => uploadedFirebaseUids.has(participant.firebaseUid)).length ?? 0;
  const areAllParticipantsReady = Boolean(
    room && room.participants.length > 0 && room.participants.every((participant) => uploadedFirebaseUids.has(participant.firebaseUid))
  );
  const isCurrentUserHost = Boolean(room && currentFirebaseUid && room.hostUid === currentFirebaseUid);

  if (!isAuthenticated) {
    return (
      <LoggedOutView
        isBusy={isBusy}
        message={message}
        onSignInWithGoogle={() => void handleSignInWithGoogle()}
      />
    );
  }

  return (
    <main className="app-shell">
      <AppHeader
        authUser={authUser}
        profile={profile}
        onOpenNickname={() => setActiveModal("nickname")}
        onSignOut={() => void handleSignOut()}
      />

      <section className="intro-panel" aria-labelledby="app-title">
        <div>
          <p className="eyebrow">Realtime Doodle Relay</p>
          <h1 id="app-title">같이 그리고, 같이 망치고, 같이 저장하기</h1>
          <p className="hero-copy">
            방을 만들거나 초대 코드를 입력해 입장한 뒤, 이미지를 올리고 같은 캔버스 위에서 실시간으로 낙서를 이어가세요.
          </p>
        </div>
      </section>

      {room ? (
        <nav className="mode-tabs" aria-label="방 화면 전환">
          <TabButton isActive={viewMode === "lobby"} onClick={() => setViewMode("lobby")} icon={<LogIn size={18} />}>
            로비
          </TabButton>
          <TabButton isActive={viewMode === "room"} onClick={() => setViewMode("room")} icon={<Users size={18} />}>
            방 준비
          </TabButton>
        </nav>
      ) : null}

      <section className="status-strip" aria-live="polite">
        <span>{message}</span>
        {isBusy ? <span className="busy-dot">처리 중</span> : null}
      </section>

      {viewMode === "lobby" ? (
        <LobbyView
          isBusy={isBusy}
          onOpenCreateRoom={() => setActiveModal("create-room")}
          onOpenJoinRoom={() => setActiveModal("join-room")}
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
          areAllParticipantsReady={areAllParticipantsReady}
          currentFirebaseUid={currentFirebaseUid}
          isCurrentUserHost={isCurrentUserHost}
          myUploadedImage={myUploadedImage}
          readyParticipantCount={readyParticipantCount}
          uploadPreview={uploadPreview}
          uploadError={uploadError}
          onCancelUploadPreview={clearUploadPreview}
          onConfirmUpload={() => void handleConfirmUpload()}
          onRefreshRoom={() => void handleRefreshRoom()}
          onSelectUploadFile={handleSelectUploadFile}
          onStartGame={handleStartGame}
        />
      ) : null}

      {viewMode === "play" ? (
        <PlayView
          activeRound={activeRound}
          activeRoundImageUrl={activeRoundImageUrl}
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

      {activeModal === "create-room" ? (
        <Modal title="방 만들기" onClose={() => setActiveModal(null)}>
          <form className="modal-form" onSubmit={handleCreateRoom}>
            <label>
              방 이름
              <input autoFocus value={roomTitle} onChange={(event) => setRoomTitle(event.target.value)} />
            </label>
            <button className="primary-button" disabled={isBusy || !roomTitle.trim()} type="submit">
              <Plus size={18} />
              만들기
            </button>
          </form>
        </Modal>
      ) : null}

      {activeModal === "join-room" ? (
        <Modal title="방 입장" onClose={() => setActiveModal(null)}>
          <form className="modal-form" onSubmit={handleJoinRoom}>
            <label>
              방 코드
              <input
                autoFocus
                maxLength={6}
                spellCheck={false}
                value={joinCode}
                onChange={(event) => setJoinCode(normalizeRoomCode(event.target.value))}
              />
            </label>
            <button className="primary-button" disabled={isBusy || !joinCode.trim()} type="submit">
              <LogIn size={18} />
              입장하기
            </button>
          </form>
        </Modal>
      ) : null}

      {activeModal === "nickname" ? (
        <Modal title="닉네임 변경" onClose={() => setActiveModal(null)}>
          <form className="modal-form" onSubmit={handleSaveNickname}>
            <label>
              닉네임
              <input autoFocus value={nickname} onChange={(event) => setNickname(event.target.value)} />
            </label>
            <button className="primary-button" disabled={isBusy} type="submit">
              <Save size={18} />
              저장
            </button>
          </form>
        </Modal>
      ) : null}
    </main>
  );
}

interface LoggedOutViewProps {
  isBusy: boolean;
  message: string;
  onSignInWithGoogle: () => void;
}

function LoggedOutView(props: LoggedOutViewProps) {
  return (
    <main className="login-shell">
      <section className="login-panel" aria-labelledby="login-title">
        <p className="eyebrow">Realtime Doodle Relay</p>
        <h1 id="login-title">같이 그리고, 같이 망치고, 같이 저장하기</h1>
        <p className="hero-copy">Google로 로그인하면 바로 방을 만들거나 초대 코드로 입장할 수 있습니다.</p>
        <button className="primary-button google-button" disabled={props.isBusy} onClick={props.onSignInWithGoogle} type="button">
          <LogIn size={18} />
          Google로 로그인
        </button>
        <p className="login-message" aria-live="polite">
          {props.isBusy ? "로그인 중입니다." : props.message}
        </p>
      </section>
    </main>
  );
}

interface AppHeaderProps {
  authUser: User | null;
  profile: UserProfile | null;
  onOpenNickname: () => void;
  onSignOut: () => void;
}

function AppHeader(props: AppHeaderProps) {
  const displayName = props.profile?.nickname ?? props.authUser?.displayName ?? props.authUser?.email ?? "사용자";
  const avatarUrl = props.profile?.avatarUrl ?? props.authUser?.photoURL;

  return (
    <header className="app-header">
      <strong>Realtime Doodle Relay</strong>
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

interface LobbyViewProps {
  isBusy: boolean;
  onOpenCreateRoom: () => void;
  onOpenJoinRoom: () => void;
}

function LobbyView(props: LobbyViewProps) {
  return (
    <section className="lobby-actions">
      <button className="paper-card lobby-action-button" disabled={props.isBusy} onClick={props.onOpenCreateRoom} type="button">
        <div className="card-heading">
          <Plus size={24} />
          <h2>방 만들기</h2>
        </div>
        <p>새 방을 만들고 초대 코드를 공유합니다.</p>
      </button>

      <button className="paper-card lobby-action-button" disabled={props.isBusy} onClick={props.onOpenJoinRoom} type="button">
        <div className="card-heading">
          <LogIn size={24} />
          <h2>방 입장</h2>
        </div>
        <p>받은 방 코드로 대기실에 들어갑니다.</p>
      </button>
    </section>
  );
}

interface ModalProps {
  children: ReactNode;
  title: string;
  onClose: () => void;
}

function Modal(props: ModalProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel" aria-modal="true" role="dialog" aria-labelledby="modal-title">
        <div className="modal-heading">
          <h2 id="modal-title">{props.title}</h2>
          <button className="icon-button" onClick={props.onClose} type="button">
            닫기
          </button>
        </div>
        {props.children}
      </section>
    </div>
  );
}

interface RoomViewProps {
  room: RoomDetail | null;
  images: ImageMetadata[];
  activeRoomCode: string;
  areAllParticipantsReady: boolean;
  canUseRoomActions: boolean;
  currentFirebaseUid: string | null;
  isCurrentUserHost: boolean;
  isBusy: boolean;
  myUploadedImage: ImageMetadata | null;
  readyParticipantCount: number;
  resourceState: ResourceState;
  resourceErrors: ResourceErrors;
  uploadPreview: UploadPreview | null;
  uploadError: string | null;
  onCancelUploadPreview: () => void;
  onConfirmUpload: () => void;
  onRefreshRoom: () => void;
  onSelectUploadFile: (file: File | null) => void;
  onStartGame: () => void;
}

function RoomView(props: RoomViewProps) {
  const uploadDisabled = !props.canUseRoomActions || props.isBusy || Boolean(props.myUploadedImage);
  const startDisabled =
    props.isBusy ||
    !props.canUseRoomActions ||
    !props.areAllParticipantsReady ||
    props.room?.status !== "waiting";

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
          <div>
            <dt>준비</dt>
            <dd>
              {props.readyParticipantCount}/{props.room?.participants.length ?? 0}명
            </dd>
          </div>
        </dl>
        {props.isCurrentUserHost ? (
          <button className="primary-button start-button" disabled={startDisabled} onClick={props.onStartGame} type="button">
            <Play size={18} />
            시작하기
          </button>
        ) : null}
        {!props.areAllParticipantsReady ? (
          <p className="notice-copy">참가자마다 이미지 1장을 업로드하면 시작할 수 있습니다.</p>
        ) : null}
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
        {props.myUploadedImage ? (
          <p className="state-copy">이미 이 방에 이미지를 업로드했습니다.</p>
        ) : null}
        <label className={uploadDisabled ? "upload-box disabled" : "upload-box"}>
          <Upload size={28} />
          <span>
            {props.myUploadedImage
              ? "사용자당 이미지는 1장만 업로드할 수 있습니다."
              : "JPEG, PNG, WebP 이미지를 선택하세요. 선택 후 미리보기에서 확인합니다."}
          </span>
          <input
            accept="image/jpeg,image/png,image/webp"
            disabled={uploadDisabled}
            type="file"
            onChange={(event) => {
              props.onSelectUploadFile(event.currentTarget.files?.item(0) ?? null);
              event.currentTarget.value = "";
            }}
          />
        </label>
        {props.uploadPreview ? (
          <section className="upload-preview" aria-label="업로드 미리보기">
            <img alt="" src={props.uploadPreview.url} />
            <div>
              <strong>{props.uploadPreview.file.name}</strong>
              <small>{formatBytes(props.uploadPreview.file.size)}</small>
            </div>
            <div className="preview-actions">
              <button className="primary-button" disabled={props.isBusy} onClick={props.onConfirmUpload} type="button">
                업로드
              </button>
              <button className="secondary-button" disabled={props.isBusy} onClick={props.onCancelUploadPreview} type="button">
                취소
              </button>
            </div>
          </section>
        ) : null}
        {props.uploadError ? <p className="error-copy">{props.uploadError}</p> : null}
        <ImageList error={props.resourceErrors.images} images={props.images} state={props.resourceState.images} />
      </div>

      <ParticipantPanel
        currentFirebaseUid={props.currentFirebaseUid}
        error={props.resourceErrors.participants}
        images={props.images}
        room={props.room}
        state={props.resourceState.participants}
      />
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

function ParticipantPanel({
  currentFirebaseUid,
  error,
  images,
  room,
  state
}: {
  currentFirebaseUid: string | null;
  error: string | null;
  images: ImageMetadata[];
  room: RoomDetail | null;
  state: LoadState;
}) {
  const uploadedFirebaseUids = new Set(images.map((image) => image.uploadedBy.firebaseUid));

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
              <span>
                {participant.nickname ?? "익명 참가자"}
                {participant.firebaseUid === currentFirebaseUid ? <small>나</small> : null}
              </span>
              <strong>{uploadedFirebaseUids.has(participant.firebaseUid) ? "Ready" : "Waiting"}</strong>
              {participant.isHost ? <em>Host</em> : null}
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
  activeRoundImageUrl: string | null;
  roundEnded: RoundEndedPayload | null;
  gameFinishedAt: string | null;
  remainingSec: number | null;
  onChatDraftChange: (value: string) => void;
  onDrawStroke: (stroke: DrawStroke) => void;
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
        backgroundImageUrl={props.activeRoundImageUrl}
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
        />
        <div className="card-heading">
          <MessageCircle size={20} />
          <h2>채팅</h2>
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
}

function RoundStatusPanel(props: RoundStatusPanelProps) {
  if (props.gameFinishedAt) {
    return (
      <section className="round-status finished">
        <strong>게임 종료</strong>
        <span>{formatDateTime(props.gameFinishedAt)}</span>
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
  backgroundImageUrl: string | null;
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

    if (props.backgroundImageUrl) {
      const image = new Image();
      image.onload = () => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        drawCanvasBackground(context, canvas.width, canvas.height);
        drawImageCover(context, image, canvas.width, canvas.height);

        for (const stroke of props.strokes) {
          drawStroke(context, stroke, canvas.width, canvas.height);
        }
      };
      image.src = props.backgroundImageUrl;
      return;
    }

    for (const stroke of props.strokes) {
      drawStroke(context, stroke, canvas.width, canvas.height);
    }
  }, [props.backgroundImageUrl, props.strokes]);

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
      strokeId: createStrokeId(),
      tool: "pen",
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
    IMAGE_UPLOAD_LIMIT_EXCEEDED: "이미 이 방에 이미지를 업로드했습니다.",
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
    ROOM_HOST_REQUIRED: "방장만 게임을 시작할 수 있습니다.",
    ROOM_PARTICIPANTS_NOT_READY: "모든 참가자가 이미지를 1장씩 업로드해야 시작할 수 있습니다.",
    ROOM_STATE_INVALID: "현재 방 상태에서는 요청을 처리할 수 없습니다.",
    ROUND_IMAGE_NOT_FOUND: "시작할 수 있는 이미지가 없습니다.",
    USER_PROFILE_NOT_FOUND: "최신 프로필을 찾지 못했습니다.",
    MESSAGE_PAYLOAD_INVALID: "채팅 메시지를 확인해 주세요.",
    MESSAGE_ROOM_NOT_JOINED: "Socket room에 참여한 뒤 메시지를 보낼 수 있습니다."
  };

  return messages[payload.code] ?? "Socket 요청을 처리하지 못했습니다.";
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

function drawCanvasBackground(context: CanvasRenderingContext2D, width: number, height: number) {
  context.fillStyle = "#fffefa";
  context.fillRect(0, 0, width, height);
}

function drawImageCover(context: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const drawX = (width - drawWidth) / 2;
  const drawY = (height - drawHeight) / 2;

  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function previewDraftStroke(canvas: HTMLCanvasElement, points: DrawPoint[]) {
  const context = canvas.getContext("2d");

  if (!context || points.length < 2) {
    return;
  }

  drawStroke(
    context,
    {
      strokeId: "preview",
      tool: "pen",
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
      strokeId: chunks.length === 0 ? stroke.strokeId : `${stroke.strokeId}-${chunks.length + 1}`,
      points: stroke.points.slice(index, index + chunkSize)
    });
  }

  return chunks;
}

function createClientRoundId(room: RoomDetail): string {
  return `round-${room.currentRoundIndex}`;
}

function createStrokeId(): string {
  if (globalThis.crypto?.randomUUID) {
    return `stroke-${globalThis.crypto.randomUUID()}`;
  }

  return `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
