import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  signInWithPopup,
  signOut,
  type Auth,
  type User
} from "firebase/auth";

export interface FirebaseClient {
  auth: Auth;
  signInWithGoogle(): Promise<User>;
  signOutUser(): Promise<void>;
}

export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

let firebaseApp: FirebaseApp | null = null;
let firebaseClient: FirebaseClient | null = null;

export function createFirebaseClient(): FirebaseClient {
  if (firebaseClient) {
    return firebaseClient;
  }

  const config = readFirebaseClientConfig();

  firebaseApp =
    firebaseApp ??
    initializeApp({
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
      appId: config.appId
    });

  const auth = getAuth(firebaseApp);

  firebaseClient = {
    auth,
    async signInWithGoogle() {
      await setPersistence(auth, browserLocalPersistence);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const credential = await signInWithPopup(auth, provider);
      return credential.user;
    },
    async signOutUser() {
      await signOut(auth);
    }
  };

  return firebaseClient;
}

export function readFirebaseClientConfig(): FirebaseClientConfig {
  return {
    apiKey: readRequiredViteEnv("VITE_FIREBASE_API_KEY"),
    authDomain: readRequiredViteEnv("VITE_FIREBASE_AUTH_DOMAIN"),
    projectId: readRequiredViteEnv("VITE_FIREBASE_PROJECT_ID"),
    appId: readRequiredViteEnv("VITE_FIREBASE_APP_ID")
  };
}

function readRequiredViteEnv(key: keyof ImportMetaEnv): string {
  const value = import.meta.env[key];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} is required for Firebase client authentication.`);
  }

  return value;
}
