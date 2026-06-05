import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

import type { ServerEnv } from "../config/env";
import type { TokenVerifier, VerifiedFirebaseToken } from "./tokens";

export function getFirebaseAdminApp(env: ServerEnv): App {
  const existingApp = getApps()[0];

  if (existingApp) {
    return existingApp;
  }

  return initializeApp({
    credential: cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: normalizePrivateKey(env.FIREBASE_PRIVATE_KEY)
    })
  });
}

export function createFirebaseTokenVerifier(app: App): TokenVerifier {
  const auth = getAuth(app);

  return {
    async verifyIdToken(token: string): Promise<VerifiedFirebaseToken> {
      const decoded = await auth.verifyIdToken(token);

      return {
        uid: decoded.uid,
        email: decoded.email,
        name: decoded.name,
        picture: decoded.picture,
        iat: decoded.iat,
        exp: decoded.exp
      };
    }
  };
}

export function normalizePrivateKey(privateKey: string): string {
  return privateKey.replace(/\\n/g, "\n");
}
