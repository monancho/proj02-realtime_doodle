import {
  Copy,
  Download,
  Eraser,
  ImagePlus,
  LogIn,
  LogOut,
  MessageCircle,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  Upload,
  Users
} from "lucide-react";
import { FormEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { ImageMetadata, ListRoomResultsResponse, ResultMetadata, RoomDetail, UserProfile } from "@doodle/shared";
import type { User } from "firebase/auth";
import { io, type Socket } from "socket.io-client";
import { ApiClientError, createApiClient, normalizeRoomCode } from "./api/client";
import { createFirebaseClient } from "./auth/firebase";
import { RoughDecoration } from "./components/RoughDecoration";

type ViewMode = "lobby" | "room" | "play" | "gallery";
type ModalMode = "create-room" | "join-room" | "nickname";
type LoadState = "idle" | "loading" | "ready" | "error";
type PreviewMode = "login" | "lobby" | "room" | "play" | "gallery";

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

type DrawingTool = DrawStroke["tool"];

interface CanvasCursorUpdate {
  x: number;
  y: number;
  tool: DrawingTool;
  color: string;
  width: number;
}

interface RemoteCursor extends CanvasCursorUpdate {
  roomCode: string;
  roundId: string;
  firebaseUid: string;
  nickname: string | null;
  avatarUrl: string | null;
  updatedAt: string;
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

interface RoundResultModalState {
  round: RoundEndedPayload;
  result: ResultMetadata | null;
}

interface GameStartingPayload {
  roomCode: string;
  countdownSec: number;
  startsAt: string;
  room: RoomDetail;
}

interface ActiveRound extends RoundStartedPayload {
  endedAt: string | null;
}

interface UploadPreview {
  file: File;
  url: string;
}

type ResultSaveStatus = "idle" | "saving" | "saved";

const defaultApiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
const defaultSocketUrl = import.meta.env.VITE_SOCKET_URL ?? defaultApiBaseUrl;
const acceptedImageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxImageSizeBytes = 10 * 1024 * 1024;
const maxChatMessageLength = 200;
const maxStrokePointsPerPayload = 128;
const maxRenderedStrokeBatches = 10000;
const drawingColors = ["#222222", "#e85d75", "#f4b942", "#4f9d69", "#4f80d9", "#8b6fd6"];
const drawingWidths = [3, 6, 10];
const isPreviewEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_UI_PREVIEW === "true";
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
  const previewMode = getPreviewMode();

  if (previewMode) {
    return <PreviewApp mode={previewMode} />;
  }

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
  const [remoteCursors, setRemoteCursors] = useState<Record<string, RemoteCursor>>({});
  const [activeRound, setActiveRound] = useState<ActiveRound | null>(null);
  const [activeRoundImageUrl, setActiveRoundImageUrl] = useState<string | null>(null);
  const [uploadedImagePreviewUrl, setUploadedImagePreviewUrl] = useState<string | null>(null);
  const [gameStarting, setGameStarting] = useState<GameStartingPayload | null>(null);
  const [countdownRemainingSec, setCountdownRemainingSec] = useState<number | null>(null);
  const [roundEnded, setRoundEnded] = useState<RoundEndedPayload | null>(null);
  const [roundResultModal, setRoundResultModal] = useState<RoundResultModalState | null>(null);
  const [gameFinishedAt, setGameFinishedAt] = useState<string | null>(null);
  const [resultSaveStatus, setResultSaveStatus] = useState<ResultSaveStatus>("idle");
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [resourceState, setResourceState] = useState<ResourceState>(initialResourceState);
  const [resourceErrors, setResourceErrors] = useState<ResourceErrors>(initialResourceErrors);
  const socketRef = useRef<Socket | null>(null);
  const roomStatusRef = useRef<string | null>(null);
  const roundEndedRef = useRef<RoundEndedPayload | null>(null);
  const roundResultModalRef = useRef<RoundResultModalState | null>(null);
  const pendingGalleryTimeoutRef = useRef<number | null>(null);

  const activeToken = firebaseToken;
  const isAuthenticated = Boolean(authUser && activeToken.trim());
  const isProfileSetupRequired = Boolean(isAuthenticated && profile && !profile.profileSetupCompletedAt);

  useEffect(() => {
    roomStatusRef.current = room?.status ?? null;
  }, [room?.status]);

  useEffect(() => {
    roundEndedRef.current = roundEnded;
  }, [roundEnded]);

  useEffect(() => {
    roundResultModalRef.current = roundResultModal;
  }, [roundResultModal]);

  useEffect(() => {
    if (isProfileSetupRequired) {
      setActiveModal("nickname");
    }
  }, [isProfileSetupRequired]);

  useEffect(() => {
    return () => clearPendingGalleryTransition();
  }, []);

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: defaultApiBaseUrl,
        getToken: () => activeToken
      }),
    [activeToken]
  );
  const loadImagePreview = useMemo(() => (imageId: string) => api.downloadImage(imageId), [api]);
  const loadResultPreview = useMemo(
    () => (resultId: string) => api.downloadResult(resultId).then((download) => download.blob),
    [api]
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
      const isReusedWaitingRoom = roomStatusRef.current !== "waiting" && payload.room.status === "waiting";
      roomStatusRef.current = payload.room.status;
      setRoom(payload.room);
      markRoomReady(payload.room);
      if (payload.room.status === "waiting") {
        setGameStarting(null);
        setActiveRound(null);
        setActiveRoundImageUrl(null);
        setRoundEnded(null);
        setRoundResultModal(null);
        setGameFinishedAt(null);
        setResultSaveStatus("idle");
        setDrawStrokes([]);
        setRemoteCursors({});
        setRemainingSec(null);
        setRemainingMs(null);
        if (isReusedWaitingRoom) {
          setImages([]);
          setResults([]);
          setNextResultCursor(null);
          setUploadedImagePreviewUrl((currentUrl) => {
            if (currentUrl) {
              URL.revokeObjectURL(currentUrl);
            }

            return null;
          });
        }
        setViewMode("room");
      }
      void refreshRoomImages(payload.room.roomCode);
    });

    socket.on("receive-message", (payload: ChatMessage) => {
      setChatMessages((currentMessages) => [...currentMessages.slice(-99), payload]);
    });

    socket.on("draw-stroke", (payload: DrawStrokePayload) => {
      setDrawStrokes((currentStrokes) => [
        ...currentStrokes.slice(-(maxRenderedStrokeBatches - 1)),
        payload.stroke
      ]);
    });

    socket.on("cursor-move", (payload: RemoteCursor) => {
      const selfUid = authUser?.uid ?? profile?.firebaseUid ?? null;
      if (payload.firebaseUid === selfUid) {
        return;
      }

      setRemoteCursors((currentCursors) => ({
        ...currentCursors,
        [payload.firebaseUid]: payload
      }));
    });

    socket.on("game-starting", (payload: GameStartingPayload) => {
      setRoom(payload.room);
      markRoomReady(payload.room);
      setGameStarting(payload);
      setCountdownRemainingSec(payload.countdownSec);
      clearUploadPreview();
      setViewMode("room");
      setMessage(`${payload.countdownSec}초 후 게임이 시작됩니다.`);
    });

    socket.on("round-started", (payload: RoundStartedPayload) => {
      clearPendingGalleryTransition();
      setGameStarting(null);
      setCountdownRemainingSec(null);
      setRemainingSec(payload.durationSec);
      setRemainingMs(payload.durationSec * 1000);
      setActiveRound({ ...payload, endedAt: null });
      setRoundEnded(null);
      setRoundResultModal(null);
      setGameFinishedAt(null);
      setResultSaveStatus("idle");
      setDrawStrokes([]);
      setRemoteCursors({});
      setViewMode("play");
      setMessage(`Round ${payload.roundIndex + 1}이 시작되었습니다.`);
    });

    socket.on("round-ended", (payload: RoundEndedPayload) => {
      setRoundEnded(payload);
      setRoundResultModal({ round: payload, result: null });
      setActiveRound((currentRound) =>
        currentRound && currentRound.roundId === payload.roundId ? { ...currentRound, endedAt: payload.endedAt } : currentRound
      );
      setResultSaveStatus("saving");
      setMessage(`Round ${payload.roundIndex + 1}이 종료되었습니다. 결과를 저장하는 중입니다.`);
    });

    socket.on("result-saved", (payload: ResultSavedPayload) => {
      setResults((currentResults) => {
        const knownIds = new Set(currentResults.map((result) => result.id));
        return knownIds.has(payload.result.id) ? currentResults : [payload.result, ...currentResults];
      });
      setNextResultCursor(null);
      setResourceState((current) => ({ ...current, results: "ready" }));
      setResultSaveStatus("saved");
      setRoundResultModal((currentModal) =>
        currentModal && currentModal.round.roundId === payload.roundId
          ? { ...currentModal, result: payload.result }
          : currentModal
      );
      setRemoteCursors({});
      setMessage(`Round ${payload.roundIndex + 1} 결과가 저장되었습니다.`);
    });

    socket.on("game-finished", (payload: { roomCode: string; room: RoomDetail; finishedAt: string }) => {
      setRoom(payload.room);
      setGameStarting(null);
      setCountdownRemainingSec(null);
      setGameFinishedAt(payload.finishedAt);
      setResultSaveStatus("saved");
      if (roundResultModalRef.current || roundEndedRef.current) {
        setMessage("게임이 종료되었습니다. 마지막 라운드 결과를 잠시 보여드린 뒤 갤러리로 이동합니다.");
        scheduleGalleryTransition(payload.roomCode);
        return;
      }
      setRoundResultModal(null);
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
      setRemainingMs(null);
      return;
    }

    const updateRemaining = () => {
      const startedAtMs = new Date(activeRound.startedAt).getTime();
      const durationMs = activeRound.durationSec * 1000;
      const nextRemainingMs =
        Number.isFinite(startedAtMs) && durationMs > 0 ? Math.max(0, durationMs - (Date.now() - startedAtMs)) : durationMs;

      setRemainingMs(nextRemainingMs);
      setRemainingSec(Math.ceil(nextRemainingMs / 1000));
    };

    updateRemaining();
    const intervalId = window.setInterval(updateRemaining, 250);

    return () => window.clearInterval(intervalId);
  }, [activeRound]);

  useEffect(() => {
    if (!gameStarting) {
      setCountdownRemainingSec(null);
      return;
    }

    const updateRemaining = () => {
      const startsAtMs = new Date(gameStarting.startsAt).getTime();
      const remainingMs = startsAtMs - Date.now();
      setCountdownRemainingSec(Math.max(0, Math.ceil(remainingMs / 1000)));
    };

    updateRemaining();
    const intervalId = window.setInterval(updateRemaining, 250);

    return () => window.clearInterval(intervalId);
  }, [gameStarting]);

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
        avatarUrl: signedInUser.photoURL || null
      });

      setAuthUser(signedInUser);
      setFirebaseToken(idToken);
      setProfile(upsertedProfile);
      setNickname(upsertedProfile.nickname ?? signedInUser.displayName ?? "");
      if (!upsertedProfile.profileSetupCompletedAt) {
        setActiveModal("nickname");
        setMessage("처음 시작하기 전에 사용할 닉네임을 설정해 주세요.");
        return;
      }
      setMessage(`${upsertedProfile.nickname ?? upsertedProfile.email ?? "사용자"}님, 로그인되었습니다.`);
    });
  }

  async function handleSaveNickname(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!authUser || !firebaseToken) {
      setMessage("Google 로그인 후 닉네임을 설정할 수 있습니다.");
      return;
    }

    const validatedNickname = validateNickname(nickname);

    if (validatedNickname.error) {
      setMessage(validatedNickname.error);
      return;
    }

    await runAction(async () => {
      const updatedProfile = await api.upsertMe({
        nickname: validatedNickname.value,
        avatarUrl: authUser.photoURL || null
      });

      setProfile(updatedProfile);
      setNickname(updatedProfile.nickname ?? "");
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
      setViewMode(resolveViewModeForRoom(joinedRoom, currentFirebaseUid));
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

    if (room.status !== "waiting") {
      setUploadError("게임 시작 준비 중이거나 진행 중에는 이미지를 바꿀 수 없습니다.");
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

    if (isCurrentUserSpectator) {
      setSocketError("관전자는 채팅과 라운드 보기만 사용할 수 있습니다.");
      return;
    }

    const roomCode = normalizeRoomCode(room.roomCode);
    const roundId = activeRound?.roundId ?? createClientRoundId(room);
    const batches = chunkStroke(stroke, maxStrokePointsPerPayload);

    for (const batch of batches) {
      socketRef.current.emit("draw-stroke", {
        roomCode,
        roundId,
        stroke: batch
      });
    }
  }

  function handleCursorMove(cursor: CanvasCursorUpdate) {
    if (
      !room ||
      !activeRound ||
      !socketRef.current ||
      socketStatus !== "connected" ||
      room.status !== "playing" ||
      activeRound.endedAt ||
      isCurrentUserSpectator
    ) {
      return;
    }

    socketRef.current.emit("cursor-move", {
      roomCode: normalizeRoomCode(room.roomCode),
      roundId: activeRound.roundId,
      ...cursor
    });
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

    if (room.status !== "waiting") {
      setSocketError("방이 대기 상태일 때만 시작할 수 있습니다.");
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

  function handlePrepareNextGame() {
    if (!room || !socketRef.current || socketStatus !== "connected") {
      setSocketError("방 연결이 준비되면 다시 준비할 수 있습니다.");
      return;
    }

    if (!isCurrentUserHost) {
      setSocketError("방장만 다시 준비할 수 있습니다.");
      return;
    }

    socketRef.current.emit("prepare-next-game", {
      roomCode: normalizeRoomCode(room.roomCode)
    });
    setSocketError(null);
  }

  async function handleCopyRoomCode() {
    if (!activeRoomCode) {
      setMessage("복사할 방 코드가 없습니다.");
      return;
    }

    try {
      await navigator.clipboard.writeText(activeRoomCode);
      setMessage(`${activeRoomCode} 방 코드를 복사했습니다.`);
    } catch {
      setMessage("방 코드 복사에 실패했습니다. 화면의 코드를 직접 복사해 주세요.");
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
    clearPendingGalleryTransition();
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
    setResultSaveStatus("idle");
    setRemainingSec(null);
    setGameStarting(null);
    setCountdownRemainingSec(null);
    setSocketError(null);
    setSocketStatus("idle");
    clearUploadPreview();
    setUploadedImagePreviewUrl((currentUrl) => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }

      return null;
    });
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

  function clearPendingGalleryTransition() {
    if (pendingGalleryTimeoutRef.current !== null) {
      window.clearTimeout(pendingGalleryTimeoutRef.current);
      pendingGalleryTimeoutRef.current = null;
    }
  }

  function scheduleGalleryTransition(roomCode: string) {
    clearPendingGalleryTransition();
    pendingGalleryTimeoutRef.current = window.setTimeout(() => {
      setRoundResultModal(null);
      setViewMode("gallery");
      void refreshResults(roomCode);
      pendingGalleryTimeoutRef.current = null;
    }, 5000);
  }

  const activeRoomCode = room?.roomCode ?? normalizeRoomCode(joinCode);
  const canUseRoomActions = Boolean(room);
  const currentFirebaseUid = authUser?.uid ?? profile?.firebaseUid ?? null;
  const activeImages = images.filter((image) => image.active !== false);
  const uploadedFirebaseUids = new Set(activeImages.map((image) => image.uploadedBy.firebaseUid));
  const myUploadedImage = currentFirebaseUid
    ? activeImages.find((image) => image.uploadedBy.firebaseUid === currentFirebaseUid) ?? null
    : null;
  const currentParticipant = room?.participants.find((participant) => participant.firebaseUid === currentFirebaseUid) ?? null;
  const isCurrentUserSpectator = currentParticipant?.isSpectator === true;
  const readyParticipantCount =
    room?.participants.filter(
      (participant) => participant.isSpectator === true || uploadedFirebaseUids.has(participant.firebaseUid)
    ).length ?? 0;
  const areAllParticipantsReady = Boolean(
    room &&
      room.participants.length > 0 &&
      room.participants.every(
        (participant) => participant.isSpectator === true || uploadedFirebaseUids.has(participant.firebaseUid)
      )
  );
  const isCurrentUserHost = Boolean(room && currentFirebaseUid && room.hostUid === currentFirebaseUid);

  useEffect(() => {
    if (!myUploadedImage) {
      setUploadedImagePreviewUrl((currentUrl) => {
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
      .downloadImage(myUploadedImage.id)
      .then((blob) => {
        if (isCancelled) {
          return;
        }

        nextUrl = URL.createObjectURL(blob);
        setUploadedImagePreviewUrl((currentUrl) => {
          if (currentUrl) {
            URL.revokeObjectURL(currentUrl);
          }

          return nextUrl;
        });
      })
      .catch(() => {
        if (!isCancelled) {
          setUploadedImagePreviewUrl(null);
        }
      });

    return () => {
      isCancelled = true;
      if (nextUrl) {
        URL.revokeObjectURL(nextUrl);
      }
    };
  }, [myUploadedImage?.id, api]);

  if (!isAuthenticated) {
    return (
      <LoggedOutView
        isBusy={isBusy}
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

      {viewMode !== "lobby" ? (
        <section className="intro-panel" aria-labelledby="app-title">
          <div>
            <p className="eyebrow">Realtime Doodle Relay</p>
            <h1 id="app-title">같이 그리고, 같이 망치고, 같이 저장하기</h1>
            <RoughDecoration className="rough-underline" seed={21} variant="underline" />
            <p className="hero-copy">
              방을 만들거나 초대 코드를 입력해 입장한 뒤, 이미지를 올리고 같은 캔버스 위에서 실시간으로 낙서를 이어가세요.
            </p>
          </div>
        </section>
      ) : null}

      {viewMode !== "lobby" ? (
        <section className="status-strip" aria-live="polite">
          <span>{message}</span>
          {isBusy ? <span className="busy-dot">처리 중</span> : null}
        </section>
      ) : null}

      {viewMode === "lobby" ? (
        <LobbyView
          isBusy={isBusy}
          joinCode={joinCode}
          notice={getLobbyNotice(message)}
          onJoinCodeChange={(value) => setJoinCode(normalizeRoomCode(value))}
          onJoinRoomSubmit={handleJoinRoom}
          onOpenCreateRoom={() => setActiveModal("create-room")}
        />
      ) : null}

      {viewMode === "room" ? (
        <RoomView
          activeRoomCode={activeRoomCode}
          canUseRoomActions={canUseRoomActions}
          images={activeImages}
          isBusy={isBusy}
          resourceErrors={resourceErrors}
          resourceState={resourceState}
          room={room}
          areAllParticipantsReady={areAllParticipantsReady}
          currentFirebaseUid={currentFirebaseUid}
          isCurrentUserHost={isCurrentUserHost}
          isCurrentUserSpectator={isCurrentUserSpectator}
          myUploadedImage={myUploadedImage}
          uploadedImagePreviewUrl={uploadedImagePreviewUrl}
          countdownRemainingSec={countdownRemainingSec}
          gameStarting={gameStarting}
          readyParticipantCount={readyParticipantCount}
          uploadPreview={uploadPreview}
          uploadError={uploadError}
          chatDraft={chatDraft}
          chatMessages={chatMessages}
          socketError={socketError}
          socketStatus={socketStatus}
          onLoadImagePreview={loadImagePreview}
          onCancelUploadPreview={clearUploadPreview}
          onChatDraftChange={setChatDraft}
          onCopyRoomCode={() => void handleCopyRoomCode()}
          onConfirmUpload={() => void handleConfirmUpload()}
          onRefreshRoom={() => void handleRefreshRoom()}
          onSendMessage={handleSendMessage}
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
          countdownRemainingSec={countdownRemainingSec}
          drawStrokes={drawStrokes}
          remoteCursors={Object.values(remoteCursors)}
          gameFinishedAt={gameFinishedAt}
          imageCount={activeImages.length}
          images={activeImages}
          currentFirebaseUid={currentFirebaseUid}
          isCurrentUserSpectator={isCurrentUserSpectator}
          gameStarting={gameStarting}
          remainingMs={remainingMs}
          remainingSec={remainingSec}
          room={room}
          roundEnded={roundEnded}
          roundResultModal={roundResultModal}
          resultSaveStatus={resultSaveStatus}
          socketError={socketError}
          socketStatus={socketStatus}
          onChatDraftChange={setChatDraft}
          onCursorMove={handleCursorMove}
          onDrawStroke={handleDrawStroke}
          onLoadResultPreview={loadResultPreview}
          onSendMessage={handleSendMessage}
        />
      ) : null}

      {viewMode === "gallery" ? (
        <GalleryViewPolished
          chatDraft={chatDraft}
          chatMessages={chatMessages}
          currentFirebaseUid={currentFirebaseUid}
          images={activeImages}
          isBusy={isBusy}
          nextCursor={nextResultCursor}
          results={results}
          room={room}
          state={resourceState.results}
          error={resourceErrors.results}
          socketError={socketError}
          socketStatus={socketStatus}
          isCurrentUserHost={isCurrentUserHost}
          onChatDraftChange={setChatDraft}
          onDownload={(resultId) => void handleDownloadResult(resultId)}
          onLoadResultPreview={loadResultPreview}
          onLoadMore={() => void handleLoadResults(nextResultCursor)}
          onPrepareNextGame={handlePrepareNextGame}
          onRefresh={() => void handleLoadResults(null)}
          onSendMessage={handleSendMessage}
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
        <Modal
          closeDisabled={isProfileSetupRequired}
          title={isProfileSetupRequired ? "닉네임 설정" : "닉네임 변경"}
          onClose={() => setActiveModal(null)}
        >
          <form className="modal-form" onSubmit={handleSaveNickname}>
            <label>
              닉네임
              <input
                autoFocus
                maxLength={12}
                minLength={2}
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
              />
            </label>
            <p className="form-hint">2자 이상 12자 이하로 입력해 주세요. 같은 닉네임은 사용할 수 없습니다.</p>
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

function PreviewApp({ mode }: { mode: PreviewMode }) {
  const currentFirebaseUid = mockProfile.firebaseUid;
  const viewMode: ViewMode = mode === "play" || mode === "gallery" ? mode : mode === "room" ? "room" : "lobby";
  const activeRound = mode === "play" ? mockActiveRound : null;

  if (mode === "login") {
    return (
      <LoggedOutView
        isBusy={false}
        onSignInWithGoogle={noop}
      />
    );
  }

  return (
    <main className="app-shell preview-shell">
      <AppHeader authUser={mockAuthUser} profile={mockProfile} onOpenNickname={noop} onSignOut={noop} />

      {viewMode !== "lobby" ? (
        <section className="intro-panel" aria-labelledby="app-title">
          <div>
            <p className="eyebrow">UI Preview Mode</p>
            <h1 id="app-title">로그인 없이 화면만 확인하기</h1>
            <RoughDecoration className="rough-underline" seed={21} variant="underline" />
            <p className="hero-copy">
              이 화면은 로컬 UI QA 전용 mock preview입니다. 실제 API, Firebase, Socket 요청은 실행하지 않습니다.
            </p>
          </div>
        </section>
      ) : null}

      <PreviewSwitcher activeMode={mode} />

      {viewMode !== "lobby" ? (
        <section className="status-strip" aria-live="polite">
          <span>{getPreviewMessage(mode)}</span>
          <span className="preview-badge">dev preview</span>
        </section>
      ) : null}

      {viewMode === "lobby" ? (
        <LobbyView
          isBusy={false}
          joinCode="ABC123"
          notice={null}
          onJoinCodeChange={noopString}
          onJoinRoomSubmit={preventSubmit}
          onOpenCreateRoom={noop}
        />
      ) : null}

      {viewMode === "room" ? (
        <RoomView
          activeRoomCode={mockRoom.roomCode}
          canUseRoomActions={canUseRoomActions}
          images={mockImages}
          isBusy={false}
          resourceErrors={initialResourceErrors}
          resourceState={readyResourceState}
          room={mockRoom}
          areAllParticipantsReady={areAllParticipantsReady}
          currentFirebaseUid={currentFirebaseUid}
          isCurrentUserHost={isCurrentUserHost}
          isCurrentUserSpectator={false}
          myUploadedImage={mockImages[0]}
          uploadedImagePreviewUrl={mockRoundImageUrl}
          countdownRemainingSec={null}
          gameStarting={null}
          readyParticipantCount={mockRoom.participants.length}
          uploadPreview={null}
          uploadError={null}
          chatDraft=""
          chatMessages={mockChatMessages}
          socketError={null}
          socketStatus="connected"
          onLoadImagePreview={loadMockPreviewBlob}
          onCancelUploadPreview={noop}
          onChatDraftChange={noopString}
          onCopyRoomCode={noop}
          onConfirmUpload={noop}
          onRefreshRoom={noop}
          onSendMessage={preventSubmit}
          onSelectUploadFile={noopSelectFile}
          onStartGame={noop}
        />
      ) : null}

      {viewMode === "play" ? (
        <PlayView
          activeRound={activeRound}
          activeRoundImageUrl={mockRoundImageUrl}
          chatDraft=""
          chatMessages={mockChatMessages}
          countdownRemainingSec={null}
          drawStrokes={mockDrawStrokes}
          remoteCursors={[]}
          gameFinishedAt={null}
          imageCount={mockImages.length}
          images={mockImages}
          currentFirebaseUid={currentFirebaseUid}
          isCurrentUserSpectator={false}
          gameStarting={null}
          remainingMs={83_000}
          remainingSec={83}
          room={mockPlayingRoom}
          roundEnded={null}
          roundResultModal={null}
          resultSaveStatus="idle"
          socketError={null}
          socketStatus="connected"
          onChatDraftChange={noopString}
          onCursorMove={noop}
          onDrawStroke={noopDrawStroke}
          onLoadResultPreview={loadMockPreviewBlob}
          onSendMessage={preventSubmit}
        />
      ) : null}

      {viewMode === "gallery" ? (
        <GalleryViewPolished
          chatDraft=""
          chatMessages={mockChatMessages}
          currentFirebaseUid={currentFirebaseUid}
          images={mockImages}
          isBusy={false}
          nextCursor={null}
          results={mockResults}
          room={mockPlayingRoom}
          state="ready"
          error={null}
          socketError={null}
          socketStatus="connected"
          isCurrentUserHost={true}
          onChatDraftChange={noopString}
          onDownload={noopString}
          onLoadResultPreview={loadMockPreviewBlob}
          onLoadMore={noop}
          onPrepareNextGame={noop}
          onRefresh={noop}
          onSendMessage={preventSubmit}
        />
      ) : null}
    </main>
  );
}

function PreviewSwitcher({ activeMode }: { activeMode: PreviewMode }) {
  const items: Array<{ mode: PreviewMode; label: string }> = [
    { mode: "login", label: "로그인" },
    { mode: "lobby", label: "로비" },
    { mode: "room", label: "방 준비" },
    { mode: "play", label: "드로잉" },
    { mode: "gallery", label: "갤러리" }
  ];

  return (
    <nav className="mode-tabs preview-tabs" aria-label="Preview 화면 전환">
      {items.map((item) => (
        <a
          className={activeMode === item.mode ? "tab-button active" : "tab-button"}
          href={`?preview=${item.mode}`}
          key={item.mode}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}

function getPreviewMode(): PreviewMode | null {
  if (!isPreviewEnabled || typeof window === "undefined") {
    return null;
  }

  const preview = new URLSearchParams(window.location.search).get("preview");
  return isPreviewMode(preview) ? preview : null;
}

function isPreviewMode(value: string | null): value is PreviewMode {
  return value === "login" || value === "lobby" || value === "room" || value === "play" || value === "gallery";
}

function resolveViewModeForRoom(room: RoomDetail, firebaseUid: string | null): ViewMode {
  const participant = room.participants.find((roomParticipant) => roomParticipant.firebaseUid === firebaseUid);

  if (room.status === "waiting" && participant?.isSpectator !== true) {
    return "room";
  }

  if (room.status === "finished") {
    return "gallery";
  }

  return "play";
}

function getPreviewMessage(mode: PreviewMode): string {
  const messages: Record<PreviewMode, string> = {
    login: "로그인 화면 preview입니다.",
    lobby: "로비 preview입니다. 방 만들기/방 입장 CTA 배치를 확인하세요.",
    room: "방 준비 preview입니다. 참가자 ready, 업로드 카드, 시작 버튼 배치를 확인하세요.",
    play: "드로잉 preview입니다. 참가자, 캔버스, 도구, 채팅 배치를 확인하세요.",
    gallery: "결과 갤러리 preview입니다. 라운드 카드와 다운로드 버튼을 확인하세요."
  };

  return messages[mode];
}

const mockCreatedAt = "2026-06-07T08:00:00.000Z";
const mockProfile: UserProfile = {
  firebaseUid: "preview-user-1",
  email: "preview@example.com",
  nickname: "민지",
  nicknameNormalized: "preview",
  avatarUrl: null,
  profileSetupCompletedAt: mockCreatedAt,
  createdAt: mockCreatedAt,
  updatedAt: mockCreatedAt
};
const mockAuthUser = {
  uid: mockProfile.firebaseUid,
  email: mockProfile.email,
  displayName: mockProfile.nickname,
  photoURL: null
} as User;
const mockRoom: RoomDetail = {
  roomCode: "ABC123",
  title: "풍경 드로잉 함께해요",
  status: "waiting",
  hostUid: mockProfile.firebaseUid,
  settings: {
    roundDurationSec: 90,
    maxPlayers: 4,
    maxImagesPerUser: 1
  },
  participantCount: 4,
  maxPlayers: 4,
  createdAt: mockCreatedAt,
  updatedAt: mockCreatedAt,
  participants: [
    { firebaseUid: "preview-user-1", nickname: "민지", avatarUrl: null, isHost: true, joinedAt: mockCreatedAt },
    { firebaseUid: "preview-user-2", nickname: "초호", avatarUrl: null, isHost: false, joinedAt: mockCreatedAt },
    { firebaseUid: "preview-user-3", nickname: "지훈", avatarUrl: null, isHost: false, joinedAt: mockCreatedAt },
    { firebaseUid: "preview-user-4", nickname: "소연", avatarUrl: null, isHost: false, joinedAt: mockCreatedAt }
  ],
  currentRoundIndex: 1
};
const mockPlayingRoom: RoomDetail = {
  ...mockRoom,
  status: "playing"
};
const mockImages: ImageMetadata[] = mockRoom.participants.map((participant, index) => ({
  id: `preview-image-${index + 1}`,
  roomCode: mockRoom.roomCode,
  uploadedBy: {
    firebaseUid: participant.firebaseUid,
    nickname: participant.nickname,
    avatarUrl: participant.avatarUrl
  },
  originalName: ["mountain-lake.jpg", "sunny-beach.webp", "city-walk.png", "flower-garden.jpg"][index],
  mimeType: index === 1 ? "image/webp" : index === 2 ? "image/png" : "image/jpeg",
  size: 1024 * 1024 * (index + 1),
  storageType: "gridfs",
  fileId: `preview-file-${index + 1}`,
  width: 1200,
  height: 900,
  used: index === 1,
  createdAt: mockCreatedAt
}));
const mockActiveRound: ActiveRound = {
  roomCode: mockRoom.roomCode,
  roundId: "preview-round-2",
  roundIndex: 1,
  image: mockImages[1],
  durationSec: 90,
  startedAt: mockCreatedAt,
  endedAt: null
};
const mockResults: ResultMetadata[] = [0, 1, 2, 3].map((index) => ({
  id: `preview-result-${index + 1}`,
  roomCode: mockRoom.roomCode,
  roundId: `preview-round-${index + 1}`,
  roundIndex: index,
  sourceImageId: mockImages[index]?.id ?? mockImages[0].id,
  sourceImageFileId: mockImages[index]?.fileId ?? mockImages[0].fileId,
  resultFileId: `preview-result-file-${index + 1}`,
  thumbnailFileId: null,
  mimeType: "image/png",
  width: 960,
  height: 720,
  strokeCount: 24 + index * 11,
  createdAt: `2026-06-07T08:0${index}:30.000Z`
}));
const mockChatMessages: ChatMessage[] = [
  {
    roomCode: mockRoom.roomCode,
    type: "chat",
    firebaseUid: "preview-user-2",
    nickname: "초호",
    avatarUrl: null,
    message: "색감 좋아요!",
    createdAt: mockCreatedAt
  },
  {
    roomCode: mockRoom.roomCode,
    type: "chat",
    firebaseUid: "preview-user-1",
    nickname: "민지",
    avatarUrl: null,
    message: "왼쪽 산 위에 화살표 추가할게요.",
    createdAt: "2026-06-07T08:00:12.000Z"
  }
];
const mockDrawStrokes: DrawStroke[] = [
  {
    strokeId: "preview-stroke-1",
    tool: "pen",
    color: "#e85d75",
    width: 6,
    points: [
      { x: 0.2, y: 0.32, t: 1 },
      { x: 0.34, y: 0.25, t: 2 },
      { x: 0.48, y: 0.36, t: 3 }
    ]
  },
  {
    strokeId: "preview-stroke-2",
    tool: "pen",
    color: "#4f9d69",
    width: 10,
    points: [
      { x: 0.14, y: 0.72, t: 1 },
      { x: 0.3, y: 0.62, t: 2 },
      { x: 0.52, y: 0.66, t: 3 },
      { x: 0.74, y: 0.56, t: 4 }
    ]
  }
];
const mockRoundImageUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 720">
  <defs><linearGradient id="sky" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#b7dcf4"/><stop offset="1" stop-color="#f7f3ec"/></linearGradient></defs>
  <rect width="960" height="720" fill="url(#sky)"/>
  <path d="M0 430 L180 250 L310 420 L470 210 L640 430 Z" fill="#ccd5c4"/>
  <path d="M130 430 L300 280 L430 430 L590 260 L820 430 Z" fill="#9eb4a0"/>
  <rect y="430" width="960" height="290" fill="#9fc8d5"/>
  <path d="M0 520 C180 470 300 560 470 510 C640 462 760 548 960 500 L960 720 L0 720 Z" fill="#6fa7b8"/>
  <circle cx="760" cy="130" r="54" fill="#ffe28a"/>
</svg>
`)}`;
const readyResourceState: ResourceState = {
  room: "ready",
  participants: "ready",
  images: "ready",
  results: "ready"
};
const canUseRoomActions = true;
const areAllParticipantsReady = true;
const isCurrentUserHost = true;
const noop = () => undefined;
const noopString = (_value: string) => undefined;
const noopSelectFile = (_file: File | null) => undefined;
const noopDrawStroke = (_stroke: DrawStroke) => undefined;
const loadMockPreviewBlob = async () => fetch(mockRoundImageUrl).then((response) => response.blob());
const preventSubmit = (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
};

interface LoggedOutViewProps {
  isBusy: boolean;
  onSignInWithGoogle: () => void;
}

function LoggedOutView(props: LoggedOutViewProps) {
  return (
    <main className="login-shell">
      <DoodlePageCanvas />
      <section className="login-panel" aria-labelledby="login-title">
        <p className="eyebrow">Realtime Doodle Relay</p>
        <div className="login-brand">DOODLE</div>
        <div className="headline-stack">
          <h1 id="login-title" className="split-headline">
            <span>같이 그리고,</span>
            <span>같이 망치고,</span>
            <span>같이 저장하기</span>
          </h1>
          <span className="lobby-marker-line login-marker-line" aria-hidden="true" />
        </div>
        <p className="hero-copy">Google로 로그인하면 바로 방을 만들거나 초대 코드로 입장할 수 있습니다.</p>
        <button className="gsi-material-button" disabled={props.isBusy} onClick={props.onSignInWithGoogle} type="button">
          <div className="gsi-material-button-state" />
          <div className="gsi-material-button-content-wrapper">
            <div className="gsi-material-button-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                />
                <path
                  fill="#4285F4"
                  d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                />
                <path
                  fill="#FBBC05"
                  d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                />
                <path
                  fill="#34A853"
                  d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                />
                <path fill="none" d="M0 0h48v48H0z" />
              </svg>
            </div>
            <span className="gsi-material-button-contents">Google로 로그인</span>
            <span className="sr-only">Google로 로그인</span>
          </div>
        </button>
      </section>
    </main>
  );
}

function DoodlePageCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const lineSegmentsRef = useRef<DoodleLineSegment[]>([]);
  const isDrawingRef = useRef(false);
  const lastPageParticleAtRef = useRef(0);
  const [cursorPoint, setCursorPoint] = useState<{ x: number; y: number } | null>(null);
  const [particles, setParticles] = useState<DoodleParticle[]>([]);

  useEffect(() => {
    const canvasElement = canvasRef.current;

    if (!canvasElement) {
      return;
    }

    function resizeCanvas() {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
      canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      canvas.getContext("2d")?.scale(dpr, dpr);
      redrawPageDoodles();
    }

    function isDrawableTarget(event: globalThis.PointerEvent) {
      const target = event.target;
      return target instanceof Element && Boolean(target.closest(".login-shell, .lobby-page"));
    }

    function getWindowPoint(event: globalThis.PointerEvent) {
      return {
        x: Math.min(1, Math.max(0, event.clientX / Math.max(1, window.innerWidth))),
        y: Math.min(1, Math.max(0, event.clientY / Math.max(1, window.innerHeight)))
      };
    }

    function handlePointerDown(event: globalThis.PointerEvent) {
      if (!isDrawableTarget(event)) {
        return;
      }

      const point = getWindowPoint(event);
      isDrawingRef.current = true;
      lastPointRef.current = point;
      setCursorPoint(point);
      burst(point);
    }

    function handlePointerMove(event: globalThis.PointerEvent) {
      if (!isDrawableTarget(event)) {
        return;
      }

      const point = getWindowPoint(event);
      setCursorPoint(point);

      if (isDrawingRef.current && lastPointRef.current) {
        appendLineSegment(lastPointRef.current, point);
        lastPointRef.current = point;
        emitPageDrawingDust(point);
      }
    }

    function handlePointerUp() {
      isDrawingRef.current = false;
      lastPointRef.current = null;
    }

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerUp);
    };
  }, []);

  function getCanvasSize() {
    const canvas = canvasRef.current;

    return {
      width: canvas ? canvas.width / (window.devicePixelRatio || 1) : window.innerWidth,
      height: canvas ? canvas.height / (window.devicePixelRatio || 1) : window.innerHeight
    };
  }

  function appendLineSegment(from: { x: number; y: number }, to: { x: number; y: number }) {
    lineSegmentsRef.current = [...lineSegmentsRef.current, { from, to }].slice(-1000);
    redrawPageDoodles();
  }

  function emitPageDrawingDust(point: { x: number; y: number }) {
    const now = Date.now();
    if (now - lastPageParticleAtRef.current < 70) {
      return;
    }

    lastPageParticleAtRef.current = now;
    burst(point, 3);
  }

  function redrawPageDoodles() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 5;
    const size = getCanvasSize();
    context.clearRect(0, 0, size.width, size.height);

    lineSegmentsRef.current.forEach((segment) => {
      context.strokeStyle = "#222222";
      context.beginPath();
      context.moveTo(segment.from.x * size.width, segment.from.y * size.height);
      context.lineTo(segment.to.x * size.width, segment.to.y * size.height);
      context.stroke();
    });
  }

  function burst(point: { x: number; y: number }, count = 8) {
    const nextParticles = Array.from({ length: count }, (_, index) => ({
      id: `pad-${Date.now()}-${index}-${Math.random()}`,
      x: point.x,
      y: point.y,
      dx: Math.cos((Math.PI * 2 * index) / count) * (8 + Math.random() * 14),
      dy: Math.sin((Math.PI * 2 * index) / count) * (8 + Math.random() * 14),
      color: "#222222"
    }));

    setParticles((currentParticles) => [...currentParticles.slice(-20), ...nextParticles]);
    window.setTimeout(() => {
      setParticles((currentParticles) =>
        currentParticles.filter(
          (particle) => !nextParticles.some((nextParticle) => nextParticle.id === particle.id)
        )
      );
    }, 700);
  }

  return (
    <div className="doodle-page-canvas" aria-hidden="true">
      <canvas ref={canvasRef} />
      {cursorPoint ? (
        <span
          className="page-pencil-cursor"
          style={{ left: `${cursorPoint.x * 100}%`, top: `${cursorPoint.y * 100}%` }}
          aria-hidden="true"
        >
          <Pencil size={18} />
        </span>
      ) : null}
      {particles.map((particle) => (
        <i
          className="doodle-particle"
          key={particle.id}
          style={{
            left: `${particle.x * 100}%`,
            top: `${particle.y * 100}%`,
            "--particle-color": particle.color,
            "--particle-x": `${particle.dx}px`,
            "--particle-y": `${particle.dy}px`
          } as CSSProperties}
        />
      ))}
    </div>
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
      <strong>DOODLE</strong>
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
  joinCode: string;
  notice: string | null;
  onJoinCodeChange: (value: string) => void;
  onJoinRoomSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onOpenCreateRoom: () => void;
}

function LobbyView(props: LobbyViewProps) {
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

interface ModalProps {
  children: ReactNode;
  closeDisabled?: boolean;
  title: string;
  onClose: () => void;
}

function Modal(props: ModalProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel" aria-modal="true" role="dialog" aria-labelledby="modal-title">
        <div className="modal-heading">
          <h2 id="modal-title">{props.title}</h2>
          {props.closeDisabled ? null : (
          <button className="icon-button" onClick={props.onClose} type="button">
            닫기
          </button>
          )}
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
  isCurrentUserSpectator: boolean;
  isBusy: boolean;
  myUploadedImage: ImageMetadata | null;
  uploadedImagePreviewUrl: string | null;
  countdownRemainingSec: number | null;
  gameStarting: GameStartingPayload | null;
  readyParticipantCount: number;
  resourceState: ResourceState;
  resourceErrors: ResourceErrors;
  uploadPreview: UploadPreview | null;
  uploadError: string | null;
  chatMessages: ChatMessage[];
  chatDraft: string;
  socketStatus: "idle" | "connecting" | "connected" | "error";
  socketError: string | null;
  onLoadImagePreview: (imageId: string) => Promise<Blob>;
  onCancelUploadPreview: () => void;
  onChatDraftChange: (value: string) => void;
  onCopyRoomCode: () => void;
  onConfirmUpload: () => void;
  onRefreshRoom: () => void;
  onSendMessage: (event: FormEvent<HTMLFormElement>) => void;
  onSelectUploadFile: (file: File | null) => void;
  onStartGame: () => void;
}

function RoomView(props: RoomViewProps) {
  const canReplaceUpload =
    Boolean(props.myUploadedImage) &&
    props.room?.status === "waiting" &&
    !props.isCurrentUserSpectator;
  const uploadDisabled =
    !props.canUseRoomActions ||
    props.isBusy ||
    props.room?.status !== "waiting" ||
    props.isCurrentUserSpectator;
  const startDisabled =
    props.isBusy ||
    !props.canUseRoomActions ||
    !props.areAllParticipantsReady ||
    props.room?.status !== "waiting";

  return (
    <section className="room-layout">
      {props.gameStarting ? (
        <CountdownModal countdownSec={props.gameStarting.countdownSec} remainingSec={props.countdownRemainingSec} />
      ) : null}
      <ParticipantPanel
        currentFirebaseUid={props.currentFirebaseUid}
        error={props.resourceErrors.participants}
        images={props.images}
        room={props.room}
        state={props.resourceState.participants}
        variant="waiting"
      />
      <div className="room-main">
      <div className="paper-card room-summary">
        <div className="card-heading">
          <Users size={20} />
          <h2>{props.room?.title ?? "대기실"}</h2>
        </div>
        <div className="room-code-row">
          <div className="room-code">
            <span>{props.activeRoomCode || "------"}</span>
          </div>
          <button
            className="icon-button copy-code-button"
            disabled={!props.canUseRoomActions || props.isBusy}
            onClick={props.onCopyRoomCode}
            type="button"
          >
            <Copy size={16} />
            복사
          </button>
        </div>
      </div>

      <div className="paper-card upload-card">
        <div className="card-heading">
          <ImagePlus size={20} />
          <h2>이미지 업로드</h2>
        </div>
        {props.uploadPreview ? (
          <section className="upload-preview upload-preview-inline" aria-label="업로드 확인">
            <img alt="" src={props.uploadPreview.url} />
            <div>
              <strong>{props.uploadPreview.file.name}</strong>
              <small>{formatBytes(props.uploadPreview.file.size)}</small>
              <p>이 이미지로 업로드할까요?</p>
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
        ) : props.myUploadedImage ? (
          <section className="uploaded-image-card" aria-label="업로드한 이미지">
            {props.uploadedImagePreviewUrl ? (
              <img alt="" src={props.uploadedImagePreviewUrl} />
            ) : (
              <div className="uploaded-image-placeholder">
                <ImagePlus size={24} />
              </div>
            )}
            <div>
              <strong>{props.myUploadedImage.originalName}</strong>
              <small>{formatBytes(props.myUploadedImage.size)}</small>
              <p>{canReplaceUpload ? "시작 전까지 이미지를 교체할 수 있습니다." : "게임 준비 중이거나 진행 중에는 교체할 수 없습니다."}</p>
            </div>
            <label className={canReplaceUpload ? "secondary-button replace-upload-button" : "secondary-button replace-upload-button disabled"}>
              이미지 변경
              <input
                accept="image/jpeg,image/png,image/webp"
                disabled={!canReplaceUpload}
                type="file"
                onChange={(event) => {
                  props.onSelectUploadFile(event.currentTarget.files?.item(0) ?? null);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </section>
        ) : (
          <label className={uploadDisabled ? "upload-box disabled" : "upload-box"}>
            <Upload size={28} />
            <strong>이미지 추가</strong>
            <span>JPG, PNG, WebP 이미지를 선택하세요. 선택 후 확인 패널에서 업로드합니다.</span>
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
        )}
        {props.uploadError ? <p className="error-copy">{props.uploadError}</p> : null}
        <ImageList
          error={props.resourceErrors.images}
          images={props.images}
          state={props.resourceState.images}
          onLoadPreview={props.onLoadImagePreview}
        />
      </div>
      {props.isCurrentUserHost ? (
        <div className="room-action-row">
          <button className="primary-button start-button" disabled={startDisabled} onClick={props.onStartGame} type="button">
            <Play size={18} />
            시작하기
          </button>
          <button className="icon-button" disabled={!props.canUseRoomActions || props.isBusy} onClick={props.onRefreshRoom} type="button">
            <RefreshCw size={18} />
            새로고침
          </button>
        </div>
      ) : (
        <button className="icon-button" disabled={!props.canUseRoomActions || props.isBusy} onClick={props.onRefreshRoom} type="button">
          <RefreshCw size={18} />
          새로고침
        </button>
      )}
      </div>
      <ChatPanelFixed
        chatDraft={props.chatDraft}
        chatMessages={props.chatMessages}
        socketError={props.socketError}
        socketStatus={props.socketStatus}
        title="대기실 채팅"
        onChatDraftChange={props.onChatDraftChange}
        onSendMessage={props.onSendMessage}
      />
    </section>
  );
}

function ImageList({
  error,
  images,
  state,
  onLoadPreview
}: {
  error: string | null;
  images: ImageMetadata[];
  state: LoadState;
  onLoadPreview: (imageId: string) => Promise<Blob>;
}) {
  const imageSlots = Array.from({ length: 4 }, (_, index) => images[index] ?? null);

  if (state === "loading") {
    return <p className="state-copy">이미지 목록을 불러오는 중입니다.</p>;
  }

  if (state === "error") {
    return <p className="error-copy">{error ?? "이미지 목록을 불러오지 못했습니다."}</p>;
  }

  return (
    <ul className="image-list">
      {imageSlots.map((image, index) => (
        <li className={image ? undefined : "empty-image-slot"} key={image?.id ?? `empty-${index}`}>
          {image ? (
            <>
              <ImagePreviewThumb imageId={image.id} loadPreview={onLoadPreview} />
              <span>
                {image.originalName}
                <small>{formatBytes(image.size)}</small>
                <small>{image.uploadedBy.nickname ?? "익명 참가자"} 업로드</small>
              </span>
            </>
          ) : (
            <div className="image-slot-placeholder" aria-label={`빈 이미지 슬롯 ${index + 1}`}>
              <div className="image-list-thumb placeholder">
                <ImagePlus size={22} />
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function ImagePreviewThumb({
  imageId,
  loadPreview
}: {
  imageId: string;
  loadPreview: (imageId: string) => Promise<Blob>;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    let nextUrl: string | null = null;

    loadPreview(imageId)
      .then((blob) => {
        if (isCancelled) {
          return;
        }

        nextUrl = URL.createObjectURL(blob);
        setPreviewUrl((currentUrl) => {
          if (currentUrl) {
            URL.revokeObjectURL(currentUrl);
          }

          return nextUrl;
        });
      })
      .catch(() => {
        if (!isCancelled) {
          setPreviewUrl(null);
        }
      });

    return () => {
      isCancelled = true;
      if (nextUrl) {
        URL.revokeObjectURL(nextUrl);
      }
    };
  }, [imageId, loadPreview]);

  return previewUrl ? (
    <img className="image-list-thumb" alt="" src={previewUrl} />
  ) : (
    <span className="image-list-thumb placeholder" aria-hidden="true">
      <ImagePlus size={18} />
    </span>
  );
}

function ParticipantPanel({
  currentFirebaseUid,
  error,
  images,
  room,
  state,
  variant = "waiting"
}: {
  currentFirebaseUid: string | null;
  error: string | null;
  images: ImageMetadata[];
  room: RoomDetail | null;
  state: LoadState;
  variant?: "waiting" | "playing" | "finished";
}) {
  const uploadedFirebaseUids = new Set(images.map((image) => image.uploadedBy.firebaseUid));
  const getParticipantBadge = (participant: RoomDetail["participants"][number]) => {
    if (participant.isSpectator) {
      return "관전 중";
    }

    if (variant === "finished") {
      return "완료";
    }

    if (variant === "playing") {
      return "참여 중";
    }

    return uploadedFirebaseUids.has(participant.firebaseUid) ? "준비" : "대기";
  };

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
              {participant.avatarUrl ? (
                <img alt="" className="participant-avatar" src={participant.avatarUrl} />
              ) : (
                <i aria-hidden="true">{(participant.nickname ?? "?").slice(0, 1)}</i>
              )}
              <span>
                {participant.nickname ?? "익명 참가자"}
                {participant.firebaseUid === currentFirebaseUid ? <small>나</small> : null}
              </span>
              {participant.isHost ? <em>Host</em> : null}
              <strong>{getParticipantBadge(participant)}</strong>
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
  images: ImageMetadata[];
  currentFirebaseUid: string | null;
  socketStatus: "idle" | "connecting" | "connected" | "error";
  socketError: string | null;
  chatMessages: ChatMessage[];
  chatDraft: string;
  drawStrokes: DrawStroke[];
  activeRound: ActiveRound | null;
  activeRoundImageUrl: string | null;
  roundEnded: RoundEndedPayload | null;
  roundResultModal: RoundResultModalState | null;
  resultSaveStatus: ResultSaveStatus;
  gameFinishedAt: string | null;
  remainingMs: number | null;
  remainingSec: number | null;
  countdownRemainingSec: number | null;
  gameStarting: GameStartingPayload | null;
  isCurrentUserSpectator: boolean;
  remoteCursors: RemoteCursor[];
  onChatDraftChange: (value: string) => void;
  onCursorMove: (cursor: CanvasCursorUpdate) => void;
  onDrawStroke: (stroke: DrawStroke) => void;
  onLoadResultPreview: (resultId: string) => Promise<Blob>;
  onSendMessage: (event: FormEvent<HTMLFormElement>) => void;
}

function PlayView(props: PlayViewProps) {
  const chatListRef = useRef<HTMLDivElement | null>(null);
  const drawingDisabled =
    !props.room ||
    props.room.status !== "playing" ||
    props.socketStatus !== "connected" ||
    !props.activeRound ||
    Boolean(props.activeRound.endedAt) ||
    props.isCurrentUserSpectator;
  const lockMessage = props.isCurrentUserSpectator
    ? "관전자는 현재 라운드와 채팅만 볼 수 있습니다."
    : props.gameStarting
      ? "곧 라운드가 시작됩니다."
      : undefined;

  useEffect(() => {
    const chatList = chatListRef.current;
    if (!chatList) {
      return;
    }

    chatList.scrollTop = chatList.scrollHeight;
  }, [props.chatMessages.length]);

  return (
    <section className="play-layout">
      {props.roundResultModal ? (
        <RoundResultModal
          loadPreview={props.onLoadResultPreview}
          result={props.roundResultModal.result}
          resultSaveStatus={props.resultSaveStatus}
          round={props.roundResultModal.round}
        />
      ) : null}
      <TimerBarFixed
        activeRound={props.activeRound}
        countdownRemainingSec={props.countdownRemainingSec}
        gameFinishedAt={props.gameFinishedAt}
        gameStarting={props.gameStarting}
        imageCount={props.imageCount}
        remainingMs={props.remainingMs}
        remainingSec={props.remainingSec}
        resultSaveStatus={props.resultSaveStatus}
        roundEnded={props.roundEnded}
      />
      <ParticipantPanel
        currentFirebaseUid={props.currentFirebaseUid}
        error={null}
        images={props.images}
        room={props.room}
        state="ready"
        variant="playing"
      />
      <CanvasPanel
        disabled={drawingDisabled}
        backgroundImageUrl={props.activeRoundImageUrl}
        hideControls={props.isCurrentUserSpectator}
        lockMessage={lockMessage}
        remoteCursors={props.remoteCursors}
        strokes={props.drawStrokes}
        title={props.activeRound ? `Round ${props.activeRound.roundIndex + 1}` : "캔버스 준비 중"}
        subtitle={
          props.activeRound
            ? `현재 사진: ${props.activeRound.image.uploadedBy.nickname ?? "익명 참가자"} 업로드`
            : "라운드가 시작되면 사진이 표시됩니다."
        }
        onCursorMove={props.onCursorMove}
        onDrawStroke={props.onDrawStroke}
      />
      <aside className="paper-card chat-card">
        <RoundStatusPanel
          activeRound={props.activeRound}
          gameFinishedAt={props.gameFinishedAt}
          remainingSec={props.remainingSec}
          roundEnded={props.roundEnded}
          resultSaveStatus={props.resultSaveStatus}
        />
        <div className="card-heading">
          <MessageCircle size={20} />
          <h2>채팅</h2>
        </div>
        {props.socketError ? <p className="error-copy">{props.socketError}</p> : null}
        <div className="chat-list" ref={chatListRef} aria-live="polite">
          {props.chatMessages.length === 0 ? (
            <p className="empty-copy">아직 메시지가 없습니다.</p>
          ) : (
            props.chatMessages.map((chatMessage, index) => (
              <article className="chat-message" key={`${chatMessage.createdAt}-${index}`}>
                <div className="chat-message-meta">
                  <strong>{chatMessage.nickname ?? "익명 참가자"}</strong>
                  <time>{formatChatTime(chatMessage.createdAt)}</time>
                </div>
                <p>{chatMessage.message}</p>
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

interface TimerBarProps {
  activeRound: ActiveRound | null;
  countdownRemainingSec: number | null;
  gameFinishedAt: string | null;
  gameStarting: GameStartingPayload | null;
  imageCount: number;
  remainingMs: number | null;
  remainingSec: number | null;
  resultSaveStatus: ResultSaveStatus;
  roundEnded: RoundEndedPayload | null;
}

function TimerBar(props: TimerBarProps) {
  const totalRounds = Math.max(1, props.imageCount);
  let title = "?쇱슫???湲?";
  let meta = "?ъ쭊???좏깮?섎㈃ ?쒖옉?⑸땲??";
  let progress = 0;
  let tone: "idle" | "starting" | "playing" | "ended" | "finished" = "idle";

  if (props.gameStarting) {
    const remaining = props.countdownRemainingSec ?? props.gameStarting.countdownSec;
    const elapsed = props.gameStarting.countdownSec - remaining;
    title = `${remaining}珥??? ?쒖옉`;
    meta = "移댁슫?몃떎??以묒뿉???대?吏瑜?諛붽? ???놁뒿?덈떎.";
    progress =
      props.gameStarting.countdownSec > 0
        ? Math.min(100, Math.max(0, (elapsed / props.gameStarting.countdownSec) * 100))
        : 100;
    tone = "starting";
  } else if (props.gameFinishedAt) {
    title = "寃뚯엫 醫낅즺";
    meta = "寃곌낵瑜?媛ㅻ윭由ъ뿉??蹂?二鍮꾧? ?섏뿀?듬땲??";
    progress = 100;
    tone = "finished";
  } else if (props.roundEnded) {
    title = `Round ${props.roundEnded.roundIndex + 1} 醫낅즺`;
    meta = props.resultSaveStatus === "saved" ? "寃곌낵 ??μ씠 ?꾨즺?섏뿀?듬땲??" : "寃곌낵瑜???ν븯??以묒엯?덈떎.";
    progress = 100;
    tone = "ended";
  } else if (props.activeRound) {
    const remaining = props.remainingSec ?? props.activeRound.durationSec;
    const elapsed = props.activeRound.durationSec - remaining;
    title = `Round ${props.activeRound.roundIndex + 1} / ${totalRounds}`;
    meta = `${remaining}珥??⑥쓬 · ?꾩옱 ?ъ쭊: ${props.activeRound.image.uploadedBy.nickname ?? "?듬챸 李멸???"}`;
    progress =
      props.activeRound.durationSec > 0 ? Math.min(100, Math.max(0, (elapsed / props.activeRound.durationSec) * 100)) : 0;
    tone = "playing";
  }

  return (
    <section className={`timer-bar ${tone}`} aria-label="?쇱슫????대㉧">
      <div>
        <strong>{title}</strong>
        <span>{meta}</span>
      </div>
      <div className="timer-progress" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
    </section>
  );
}

void TimerBar;

function CountdownModal({ countdownSec, remainingSec }: { countdownSec: number; remainingSec: number | null }) {
  const safeCountdownSec = Math.max(1, countdownSec);
  const safeRemainingSec = Math.max(0, remainingSec ?? safeCountdownSec);
  const progress = Math.min(100, Math.max(0, (safeRemainingSec / safeCountdownSec) * 100));

  return (
    <div className="countdown-backdrop" role="status" aria-live="assertive" aria-label="게임 시작 카운트다운">
      <section className="countdown-modal">
        <span>곧 시작합니다</span>
        <strong>{safeRemainingSec}</strong>
        <p>이미지 변경은 잠시 막히고, 카운트다운이 끝나면 바로 그림 화면으로 이동합니다.</p>
        <div className="countdown-progress" aria-hidden="true">
          <i style={{ width: `${progress}%` }} />
        </div>
      </section>
    </div>
  );
}

function RoundResultModal({
  loadPreview,
  result,
  resultSaveStatus,
  round
}: {
  loadPreview: (resultId: string) => Promise<Blob>;
  result: ResultMetadata | null;
  resultSaveStatus: ResultSaveStatus;
  round: RoundEndedPayload;
}) {
  return (
    <div className="round-result-backdrop" role="status" aria-live="polite" aria-label="라운드 결과">
      <section className="round-result-modal">
        <p className="round-result-kicker">Round {round.roundIndex + 1} 종료</p>
        <h2>{result ? "이번 라운드 결과" : "결과 저장 중"}</h2>
        <div className="round-result-preview">
          {result ? (
            <ResultPreviewImage resultId={result.id} loadPreview={loadPreview} />
          ) : (
            <span>저장 중...</span>
          )}
        </div>
        <p>
          {resultSaveStatus === "saved"
            ? "잠시 후 다음 라운드로 이어집니다."
            : "방금 그린 낙서를 결과 이미지로 저장하고 있습니다."}
        </p>
      </section>
    </div>
  );
}

function TimerBarFixed(props: TimerBarProps) {
  const totalRounds = Math.max(1, props.imageCount);
  let label = "Round -";
  let remainingLabel = "";
  let progressRatio = 1;
  let tone: "idle" | "starting" | "playing" | "ended" | "finished" = "idle";

  if (props.gameStarting) {
    const remaining = props.countdownRemainingSec ?? props.gameStarting.countdownSec;
    label = "시작 대기";
    remainingLabel = `${remaining}초`;
    progressRatio = props.gameStarting.countdownSec > 0 ? remaining / props.gameStarting.countdownSec : 1;
    tone = "starting";
  } else if (props.gameFinishedAt) {
    label = "게임 종료";
    remainingLabel = "";
    progressRatio = 0;
    tone = "finished";
  } else if (props.roundEnded) {
    label = `Round ${props.roundEnded.roundIndex + 1}`;
    remainingLabel = props.resultSaveStatus === "saved" ? "저장 완료" : "저장 중";
    progressRatio = 0;
    tone = "ended";
  } else if (props.activeRound) {
    const durationMs = props.activeRound.durationSec * 1000;
    const remainingMs = props.remainingMs ?? (props.remainingSec ?? props.activeRound.durationSec) * 1000;
    const remaining = Math.ceil(remainingMs / 1000);
    label = `Round ${props.activeRound.roundIndex + 1} / ${totalRounds}`;
    remainingLabel = `남은 시간 ${remaining}초`;
    progressRatio = durationMs > 0 ? remainingMs / durationMs : 1;
    tone = "playing";
  }
  const clampedProgress = Math.min(1, Math.max(0, progressRatio));

  return (
    <section className={`timer-bar ${tone}`} aria-label="라운드 타이머">
      <div className="timer-labels">
        <strong>{label}</strong>
        {remainingLabel ? <span>{remainingLabel}</span> : null}
      </div>
      <div className="timer-progress" aria-hidden="true">
        <span style={{ transform: `scaleX(${clampedProgress})` }} />
      </div>
    </section>
  );
}

interface ChatPanelProps {
  chatMessages: ChatMessage[];
  chatDraft: string;
  socketStatus: "idle" | "connecting" | "connected" | "error";
  socketError: string | null;
  title: string;
  onChatDraftChange: (value: string) => void;
  onSendMessage: (event: FormEvent<HTMLFormElement>) => void;
}

function ChatPanelFixed(props: ChatPanelProps) {
  const chatListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const chatList = chatListRef.current;
    if (!chatList) {
      return;
    }

    chatList.scrollTop = chatList.scrollHeight;
  }, [props.chatMessages.length]);

  return (
    <div className="chat-panel">
      <div className="card-heading">
        <MessageCircle size={20} />
        <h2>{props.title}</h2>
      </div>
      {props.socketError ? <p className="error-copy">{props.socketError}</p> : null}
      <div className="chat-list" ref={chatListRef} aria-live="polite">
        {props.chatMessages.length === 0 ? (
          <p className="empty-copy">아직 메시지가 없습니다.</p>
        ) : (
          props.chatMessages.map((chatMessage, index) => (
            <article className="chat-message" key={`${chatMessage.createdAt}-${index}`}>
              <div className="chat-message-meta">
                <strong>{chatMessage.nickname ?? "익명 참가자"}</strong>
                <time>{formatChatTime(chatMessage.createdAt)}</time>
              </div>
              <p>{chatMessage.message}</p>
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
    </div>
  );
}

function ChatPanel(props: ChatPanelProps) {
  return (
    <div className="chat-panel">
      <div className="card-heading">
        <MessageCircle size={20} />
        <h2>{props.title}</h2>
      </div>
      {props.socketError ? <p className="error-copy">{props.socketError}</p> : null}
      <div className="chat-list" aria-live="polite">
        {props.chatMessages.length === 0 ? (
          <p className="empty-copy">?꾩쭅 硫붿떆吏媛 ?놁뒿?덈떎.</p>
        ) : (
          props.chatMessages.map((chatMessage, index) => (
            <article className="chat-message" key={`${chatMessage.createdAt}-${index}`}>
              <div className="chat-message-meta">
                <strong>{chatMessage.nickname ?? "?듬챸 李멸???"}</strong>
                <time>{formatChatTime(chatMessage.createdAt)}</time>
              </div>
              <p>{chatMessage.message}</p>
            </article>
          ))
        )}
      </div>
      <form className="chat-form" onSubmit={props.onSendMessage}>
        <label>
          硫붿떆吏
          <input
            maxLength={maxChatMessageLength}
            value={props.chatDraft}
            onChange={(event) => props.onChatDraftChange(event.target.value)}
          />
        </label>
        <button className="primary-button" disabled={props.socketStatus !== "connected"} type="submit">
          蹂대궡湲?
        </button>
      </form>
    </div>
  );
}

void ChatPanel;

function PlayParticipantsPanelFixed({ room }: { room: RoomDetail | null }) {
  const drawingParticipants =
    room?.participants.filter((participant) => participant.isSpectator !== true) ?? [];
  const spectators =
    room?.participants.filter((participant) => participant.isSpectator === true) ?? [];

  return (
    <aside className="paper-card play-participants-card" aria-label="라운드 참가자">
      <div className="card-heading">
        <Users size={20} />
        <h2>참여자</h2>
      </div>
      {drawingParticipants.length > 0 ? (
        <ul className="participant-list compact">
          {drawingParticipants.map((participant) => (
            <li key={participant.firebaseUid}>
              <i aria-hidden="true" />
              <span>{participant.nickname ?? "익명 참가자"}</span>
              {participant.isHost ? <em>Host</em> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-copy">현재 그리기에 참여 중인 사용자가 없습니다.</p>
      )}
      {spectators.length > 0 ? (
        <>
          <hr className="participant-divider" />
          <div className="participant-subheading">대기자</div>
          <ul className="participant-list compact spectator-list">
            {spectators.map((participant) => (
              <li key={participant.firebaseUid}>
                <i aria-hidden="true" />
                <span>{participant.nickname ?? "익명 참가자"}</span>
                <em>관전</em>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </aside>
  );
}

void PlayParticipantsPanelFixed;

function PlayParticipantsPanel({ room }: { room: RoomDetail | null }) {
  return (
    <aside className="paper-card play-participants-card" aria-label="라운드 참가자">
      <div className="card-heading">
        <Users size={20} />
        <h2>참가자</h2>
      </div>
      {room && room.participants.length > 0 ? (
        <ul className="participant-list compact">
          {room.participants.map((participant) => (
            <li key={participant.firebaseUid}>
              <i aria-hidden="true" />
              <span>{participant.nickname ?? "익명 참가자"}</span>
              {participant.isHost ? <em>Host</em> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-copy">참가자 정보를 기다리는 중입니다.</p>
      )}
    </aside>
  );
}

void PlayParticipantsPanel;

interface RoundStatusPanelProps {
  activeRound: ActiveRound | null;
  roundEnded: RoundEndedPayload | null;
  resultSaveStatus: ResultSaveStatus;
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
    const statusText =
      props.resultSaveStatus === "saved"
        ? "결과 저장이 완료되었습니다. 갤러리로 이동합니다."
        : "결과를 저장하는 중입니다. 잠시만 기다려 주세요.";

    return (
      <section className={`round-status ended ${props.resultSaveStatus}`}>
        <strong>Round {props.roundEnded.roundIndex + 1} 종료</strong>
        <span>{statusText}</span>
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
  hideControls?: boolean;
  lockMessage?: string;
  remoteCursors: RemoteCursor[];
  strokes: DrawStroke[];
  title: string;
  subtitle: string;
  onCursorMove: (cursor: CanvasCursorUpdate) => void;
  onDrawStroke: (stroke: DrawStroke) => void;
}

interface DoodleParticle {
  id: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  color: string;
}

interface DoodleLineSegment {
  from: { x: number; y: number };
  to: { x: number; y: number };
}

function CanvasPanel(props: CanvasPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const backgroundImageRef = useRef<HTMLImageElement | null>(null);
  const draftPointsRef = useRef<DrawPoint[]>([]);
  const lastSentPointRef = useRef<DrawPoint | null>(null);
  const [backgroundImageVersion, setBackgroundImageVersion] = useState(0);
  const [drawingTool, setDrawingTool] = useState<DrawingTool>("pen");
  const [drawingColor, setDrawingColor] = useState(drawingColors[0]);
  const [drawingWidth, setDrawingWidth] = useState(drawingWidths[1]);
  const [particles, setParticles] = useState<DoodleParticle[]>([]);
  const lastCursorSentAtRef = useRef(0);
  const lastCanvasParticleAtRef = useRef(0);

  useEffect(() => {
    if (!props.backgroundImageUrl) {
      backgroundImageRef.current = null;
      setBackgroundImageVersion((version) => version + 1);
      return;
    }

    let isCancelled = false;
    const image = new Image();

    image.onload = () => {
      if (!isCancelled) {
        backgroundImageRef.current = image;
        setBackgroundImageVersion((version) => version + 1);
      }
    };
    image.src = props.backgroundImageUrl;

    return () => {
      isCancelled = true;
    };
  }, [props.backgroundImageUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    redrawCanvas(
      context,
      canvas.width,
      canvas.height,
      backgroundImageRef.current,
      props.strokes
    );
  }, [backgroundImageVersion, props.strokes]);


  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (props.disabled) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    const point = createPoint(event);
    emitCursor(point);
    burstParticles(point, drawingTool === "eraser" ? "#ffffff" : drawingColor);
    draftPointsRef.current = [point];
    lastSentPointRef.current = point;
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (props.disabled) {
      return;
    }

    const point = createPoint(event);
    emitCursor(point);

    if (draftPointsRef.current.length === 0) {
      return;
    }

    const previousPoint = lastSentPointRef.current;

    draftPointsRef.current = [...draftPointsRef.current, point];

    if (previousPoint) {
      const stroke = createDrawStroke([previousPoint, point], drawingTool, drawingColor, drawingWidth);
      previewDraftStroke(event.currentTarget, backgroundImageRef.current, props.strokes, stroke);
      props.onDrawStroke(stroke);
      emitCanvasDrawingDust(point);
    }

    lastSentPointRef.current = point;
  }

  function handlePointerUp(event: PointerEvent<HTMLCanvasElement>) {
    if (props.disabled || draftPointsRef.current.length === 0) {
      return;
    }

    const point = createPoint(event);
    const previousPoint = lastSentPointRef.current;
    const points = [...draftPointsRef.current, point].slice(0, maxStrokePointsPerPayload * 2);
    draftPointsRef.current = [];
    lastSentPointRef.current = null;

    if (points.length < 1) {
      return;
    }

    if (previousPoint) {
      props.onDrawStroke(createDrawStroke([previousPoint, point], drawingTool, drawingColor, drawingWidth));
    } else {
      props.onDrawStroke(createDrawStroke(points, drawingTool, drawingColor, drawingWidth));
    }
  }

  function emitCursor(point: DrawPoint) {
    const now = Date.now();
    if (now - lastCursorSentAtRef.current < 50) {
      return;
    }

    lastCursorSentAtRef.current = now;
    props.onCursorMove({
      x: point.x,
      y: point.y,
      tool: drawingTool,
      color: drawingTool === "eraser" ? "#222222" : drawingColor,
      width: drawingWidth
    });
  }

  function emitCanvasDrawingDust(point: DrawPoint) {
    const now = Date.now();
    if (now - lastCanvasParticleAtRef.current < 70) {
      return;
    }

    lastCanvasParticleAtRef.current = now;
    burstParticles(point, drawingTool === "eraser" ? "#ffffff" : drawingColor, 3);
  }

  function burstParticles(point: DrawPoint, color: string, count = 10) {
    const nextParticles = Array.from({ length: count }, (_, index) => ({
      id: `${Date.now()}-${index}-${Math.random()}`,
      x: point.x,
      y: point.y,
      dx: Math.cos((Math.PI * 2 * index) / count) * (10 + Math.random() * 18),
      dy: Math.sin((Math.PI * 2 * index) / count) * (10 + Math.random() * 18),
      color
    }));

    setParticles((currentParticles) => [...currentParticles.slice(-30), ...nextParticles]);
    window.setTimeout(() => {
      setParticles((currentParticles) =>
        currentParticles.filter(
          (particle) => !nextParticles.some((nextParticle) => nextParticle.id === particle.id)
        )
      );
    }, 700);
  }

  return (
    <div
      className={[
        "canvas-stage",
        props.disabled ? "disabled" : "",
        props.hideControls ? "hide-controls" : ""
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="drawing-toolbar" aria-label="드로잉 도구">
        <div className="tool-group" role="group" aria-label="도구 선택">
          <button
            className={drawingTool === "pen" ? "tool-button active" : "tool-button"}
            disabled={props.disabled}
            onClick={() => setDrawingTool("pen")}
            type="button"
          >
            <Pencil size={16} />
            펜
          </button>
          <button
            className={drawingTool === "eraser" ? "tool-button active" : "tool-button"}
            disabled={props.disabled}
            onClick={() => setDrawingTool("eraser")}
            type="button"
          >
            <Eraser size={16} />
            지우개
          </button>
        </div>
        <div className="tool-group color-group" role="group" aria-label="색상 선택">
          {drawingColors.map((color) => (
            <button
              aria-label={`색상 ${color}`}
              className={drawingColor === color ? "color-swatch active" : "color-swatch"}
              disabled={props.disabled || drawingTool === "eraser"}
              key={color}
              onClick={() => setDrawingColor(color)}
              style={{ backgroundColor: color }}
              type="button"
            />
          ))}
        </div>
        <div className="tool-group" role="group" aria-label="굵기 선택">
          {drawingWidths.map((width) => (
            <button
              className={drawingWidth === width ? "tool-button active" : "tool-button"}
              disabled={props.disabled}
              key={width}
              onClick={() => setDrawingWidth(width)}
              type="button"
            >
              {width}
            </button>
          ))}
        </div>
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
          lastSentPointRef.current = null;
        }}
      />
      <div className="cursor-effects-layer" aria-hidden="true">
        {props.remoteCursors.map((cursor) => (
          <div
            className={`remote-cursor ${cursor.tool}`}
            key={cursor.firebaseUid}
            style={{
              left: `${cursor.x * 100}%`,
              top: `${cursor.y * 100}%`,
              color: cursor.tool === "eraser" ? "#222222" : cursor.color
            }}
          >
            {cursor.tool === "eraser" ? <Eraser size={18} /> : <Pencil size={18} />}
            <span>{cursor.nickname ?? "Guest"}</span>
          </div>
        ))}
        {particles.map((particle) => (
          <i
            className="doodle-particle"
            key={particle.id}
            style={{
              left: `${particle.x * 100}%`,
              top: `${particle.y * 100}%`,
              "--particle-color": particle.color,
              "--particle-x": `${particle.dx}px`,
              "--particle-y": `${particle.dy}px`
            } as CSSProperties}
          />
        ))}
      </div>
      {props.disabled ? (
        <p className="canvas-lock">
          {props.lockMessage ?? "라운드가 시작되고 연결이 준비되면 그림을 그릴 수 있습니다."}
        </p>
      ) : null}
    </div>
  );
}

interface GalleryViewProps {
  chatMessages: ChatMessage[];
  chatDraft: string;
  currentFirebaseUid: string | null;
  images: ImageMetadata[];
  results: ResultMetadata[];
  room: RoomDetail | null;
  nextCursor: string | null;
  isCurrentUserHost: boolean;
  isBusy: boolean;
  state: LoadState;
  error: string | null;
  socketStatus: "idle" | "connecting" | "connected" | "error";
  socketError: string | null;
  onChatDraftChange: (value: string) => void;
  onPrepareNextGame: () => void;
  onLoadResultPreview: (resultId: string) => Promise<Blob>;
  onLoadMore: () => void;
  onRefresh: () => void;
  onDownload: (resultId: string) => void;
  onSendMessage: (event: FormEvent<HTMLFormElement>) => void;
}

function GalleryView(props: GalleryViewProps) {
  const canPrepareNextGame = props.room?.status === "finished" && props.isCurrentUserHost;

  if (props.state === "loading") {
    return (
      <section className="paper-card gallery-empty">
        <RoughDecoration className="rough-empty-frame" seed={43} variant="frame" />
        <RefreshCw size={28} />
        <h2>결과를 불러오는 중입니다.</h2>
      </section>
    );
  }

  if (props.state === "error") {
    return (
      <section className="paper-card gallery-empty">
        <RoughDecoration className="rough-empty-frame" seed={47} variant="frame" />
        <Download size={28} />
        <h2>{props.error ?? "결과 목록을 불러오지 못했습니다."}</h2>
        <button className="secondary-button" disabled={props.isBusy} onClick={props.onRefresh} type="button">
          <RefreshCw size={18} />
          다시 불러오기
        </button>
      </section>
    );
  }

  if (props.results.length === 0) {
    return (
      <section className="paper-card gallery-empty">
        <RoughDecoration className="rough-empty-frame" seed={53} variant="frame" />
        <Download size={28} />
        <h2>저장된 결과가 없습니다.</h2>
        <button className="secondary-button" disabled={props.isBusy} onClick={props.onRefresh} type="button">
          <RefreshCw size={18} />
          결과 새로고침
        </button>
      </section>
    );
  }

  return (
    <>
      <section className="gallery-toolbar" aria-label="결과 갤러리 상태">
        <span>결과 {props.results.length}개</span>
        <span>{props.nextCursor ? "더 불러올 결과가 있습니다." : "마지막 결과까지 불러왔습니다."}</span>
        {canPrepareNextGame ? (
          <button className="secondary-button" disabled={props.isBusy} onClick={props.onPrepareNextGame} type="button">
            <RefreshCw size={18} />
            다시 준비
          </button>
        ) : null}
      </section>
      <section className="gallery-grid">
        {props.results.map((result) => (
          <article className="paper-card result-card" key={result.id}>
            <div className="result-preview">
              <ResultPreviewImage resultId={result.id} loadPreview={props.onLoadResultPreview} />
              <span>Round {result.roundIndex + 1}</span>
            </div>
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

function GalleryViewPolished(props: GalleryViewProps) {
  const canPrepareNextGame = props.room?.status === "finished" && props.isCurrentUserHost;
  const [selectedResultId, setSelectedResultId] = useState<string | null>(props.results[0]?.id ?? null);
  const featuredResult =
    props.results.find((result) => result.id === selectedResultId) ?? props.results[0];

  useEffect(() => {
    if (props.results.length === 0) {
      setSelectedResultId(null);
      return;
    }

    if (!selectedResultId || !props.results.some((result) => result.id === selectedResultId)) {
      setSelectedResultId(props.results[0].id);
    }
  }, [props.results, selectedResultId]);

  if (props.state !== "ready" || props.results.length === 0 || !featuredResult) {
    return <GalleryView {...props} />;
  }

  return (
    <section className="gallery-layout">
      <ParticipantPanel
        currentFirebaseUid={props.currentFirebaseUid}
        error={null}
        images={props.images}
        room={props.room}
        state="ready"
        variant="finished"
      />
      <main className="gallery-main">
        <section className="gallery-toolbar" aria-label="결과 갤러리 상태">
          <span>게임 종료</span>
          {canPrepareNextGame ? (
            <button className="secondary-button" disabled={props.isBusy} onClick={props.onPrepareNextGame} type="button">
              <RefreshCw size={18} />
              다시 준비
            </button>
          ) : null}
        </section>
        <article className="paper-card featured-result-card">
          <div className="result-preview featured-result-preview">
            <ResultPreviewImage resultId={featuredResult.id} loadPreview={props.onLoadResultPreview} />
            <span>Round {featuredResult.roundIndex + 1}</span>
          </div>
          <button className="download-link" disabled={props.isBusy} onClick={() => props.onDownload(featuredResult.id)} type="button">
            <Download size={18} />
            PNG 다운로드
          </button>
        </article>
        <h2 className="section-title">라운드 기록</h2>
        <section className="gallery-grid">
          {props.results.map((result) => (
            <button
              className={result.id === featuredResult.id ? "paper-card result-card selected" : "paper-card result-card"}
              key={result.id}
              onClick={() => setSelectedResultId(result.id)}
              type="button"
            >
              <div className="result-preview">
                <ResultPreviewImage resultId={result.id} loadPreview={props.onLoadResultPreview} />
                <span>Round {result.roundIndex + 1}</span>
              </div>
            </button>
          ))}
          {props.nextCursor ? (
            <button className="secondary-button gallery-more" disabled={props.isBusy} onClick={props.onLoadMore} type="button">
              <RefreshCw size={18} />
              결과 더 보기
            </button>
          ) : null}
        </section>
      </main>
      <ChatPanelFixed
        chatDraft={props.chatDraft}
        chatMessages={props.chatMessages}
        socketError={props.socketError}
        socketStatus={props.socketStatus}
        title="채팅"
        onChatDraftChange={props.onChatDraftChange}
        onSendMessage={props.onSendMessage}
      />
    </section>
  );
}

function ResultPreviewImage({
  resultId,
  loadPreview
}: {
  resultId: string;
  loadPreview: (resultId: string) => Promise<Blob>;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    let nextUrl: string | null = null;

    loadPreview(resultId)
      .then((blob) => {
        if (isCancelled) {
          return;
        }

        nextUrl = URL.createObjectURL(blob);
        setPreviewUrl((currentUrl) => {
          if (currentUrl) {
            URL.revokeObjectURL(currentUrl);
          }

          return nextUrl;
        });
      })
      .catch(() => {
        if (!isCancelled) {
          setPreviewUrl(null);
        }
      });

    return () => {
      isCancelled = true;
      if (nextUrl) {
        URL.revokeObjectURL(nextUrl);
      }
    };
  }, [resultId, loadPreview]);

  return previewUrl ? <img className="result-preview-image" alt="" src={previewUrl} /> : null;
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

function validateNickname(value: string): { value: string; error: null } | { value: null; error: string } {
  const normalized = value.trim().replace(/\s+/g, " ");

  if (normalized.length < 2 || normalized.length > 12) {
    return { value: null, error: "닉네임은 2자 이상 12자 이하로 입력해 주세요." };
  }

  return { value: normalized, error: null };
}

function formatApiError(error: ApiClientError): string {
  if (error.code === "ROOM_PARTICIPANTS_FULL") {
    return "방이 가득 찼습니다. 최대 4명까지 참여할 수 있어요.";
  }

  if (error.code === "USER_NICKNAME_REQUIRED") {
    return "닉네임을 입력해 주세요.";
  }

  if (error.code === "USER_NICKNAME_INVALID") {
    return "닉네임은 2자 이상 12자 이하로 입력해 주세요.";
  }

  if (error.code === "USER_NICKNAME_DUPLICATE") {
    return "이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해 주세요.";
  }

  if (error.code === "USER_AVATAR_URL_INVALID") {
    return "프로필 이미지 주소를 확인해 주세요.";
  }

  const messages: Record<string, string> = {
    AUTH_TOKEN_MISSING: "로그인이 필요합니다.",
    ROOM_NOT_FOUND: "방을 찾을 수 없습니다.",
    ROOM_ACCESS_DENIED: "이 방에 접근할 권한이 없습니다.",
    ROOM_PAYLOAD_INVALID: "방 요청 형식이 올바르지 않습니다.",
    IMAGE_UPLOAD_LIMIT_EXCEEDED: "이미 이 방에 이미지를 업로드했습니다.",
    IMAGE_NOT_FOUND: "라운드 이미지를 찾을 수 없습니다. 이미지를 다시 업로드하거나 방을 새로고침해 주세요.",
    IMAGE_FILE_EMPTY: "빈 파일은 업로드할 수 없습니다.",
    IMAGE_FILE_TOO_LARGE: "이미지는 10MB 이하만 업로드할 수 있습니다.",
    IMAGE_FILE_TYPE_UNSUPPORTED: "JPEG, PNG, WebP 이미지만 업로드할 수 있습니다.",
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

function getLobbyNotice(message: string): string | null {
  const problemKeywords = [
    "실패",
    "오류",
    "문제",
    "못했습니다",
    "없습니다",
    "필요합니다",
    "입력",
    "권한",
    "다시"
  ];

  return problemKeywords.some((keyword) => message.includes(keyword)) ? message : null;
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

  context.save();
  context.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
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
  context.restore();
}

function redrawCanvas(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  backgroundImage: HTMLImageElement | null,
  strokes: DrawStroke[]
) {
  context.clearRect(0, 0, width, height);
  drawCanvasBackground(context, width, height);

  if (backgroundImage) {
    drawImageCover(context, backgroundImage, width, height);
  }

  const drawingLayer = document.createElement("canvas");
  drawingLayer.width = width;
  drawingLayer.height = height;
  const drawingContext = drawingLayer.getContext("2d");

  if (!drawingContext) {
    return;
  }

  for (const stroke of strokes) {
    drawStroke(drawingContext, stroke, width, height);
  }

  context.drawImage(drawingLayer, 0, 0);
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

function previewDraftStroke(
  canvas: HTMLCanvasElement,
  backgroundImage: HTMLImageElement | null,
  strokes: DrawStroke[],
  previewStroke: DrawStroke
) {
  const context = canvas.getContext("2d");

  if (!context || previewStroke.points.length < 2) {
    return;
  }

  redrawCanvas(context, canvas.width, canvas.height, backgroundImage, [...strokes, previewStroke]);
}

function createDrawStroke(points: DrawPoint[], tool: DrawingTool, color: string, width: number): DrawStroke {
  return {
    strokeId: createStrokeId(),
    tool,
    color,
    width,
    points
  };
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

function formatChatTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "numeric",
    minute: "2-digit"
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
