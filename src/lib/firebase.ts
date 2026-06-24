/**
 * Firebase Initialization Module — Paté Salud Familiar
 *
 * Initializes Firebase App, Firebase Auth (Google provider) and Firestore.
 * Enables Firestore offline persistence (IndexedDB) to replace LocalStorage.
 *
 * IMPORTANT: All config values are read from NEXT_PUBLIC_* environment variables
 * so they are safe to expose in the browser bundle (no private keys here).
 *
 * After obtaining a Firebase Auth token, the app must still request additional
 * Google OAuth scopes (drive.file, calendar.events, gmail.readonly) via GIS
 * to maintain Drive, Calendar and Gmail integrations — those tokens are kept
 * in memory as before and are NOT stored in Firestore or LocalStorage.
 */

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  Auth,
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  Firestore,
} from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Firebase configuration (read from environment variables — safe for browser)
// ---------------------------------------------------------------------------

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// ---------------------------------------------------------------------------
// Guard: prevent double-initialization (Next.js HMR / React StrictMode)
// ---------------------------------------------------------------------------

function getFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) {
    return getApp();
  }
  return initializeApp(firebaseConfig);
}

// ---------------------------------------------------------------------------
// App singleton
// ---------------------------------------------------------------------------

/** Firebase App singleton (safe to import anywhere). */
export const firebaseApp: FirebaseApp = getFirebaseApp();

// ---------------------------------------------------------------------------
// Auth singleton
// ---------------------------------------------------------------------------

/** Firebase Auth singleton. */
export const firebaseAuth: Auth = getAuth(firebaseApp);

/**
 * Pre-configured Google provider.
 *
 * NOTE: We request ONLY the Google profile/email scopes here (needed for
 * Firebase Auth identity). The Drive, Calendar and Gmail OAuth scopes are
 * requested separately via the existing GIS token-client flow and are kept
 * in volatile memory as before — they must NOT be added here because Firebase
 * Auth does not manage those refresh tokens.
 */
export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.addScope('profile');
googleAuthProvider.addScope('email');

// ---------------------------------------------------------------------------
// Firestore singleton with offline persistence
// ---------------------------------------------------------------------------

/**
 * Returns the Firestore instance, initializing it with offline persistence
 * the very first time. Uses `persistentMultipleTabManager` so the user can
 * have the app open in multiple browser tabs simultaneously (required for
 * the PC ↔ mobile sync use-case via shared Chrome sessions).
 *
 * Falls back gracefully if IndexedDB is unavailable (e.g. private browsing)
 * — Firestore will still work but without offline caching.
 */
function getFirestoreInstance(): Firestore {
  // If already initialized (HMR, StrictMode, etc.), return the existing instance.
  try {
    // initializeFirestore throws if the app already has a Firestore instance.
    return initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    // Already initialized — return the existing instance.
    return getFirestore(firebaseApp);
  }
}

/** Firestore singleton with offline persistence enabled. */
export const db: Firestore = getFirestoreInstance();

// ---------------------------------------------------------------------------
// Utility: validate that all required env vars are present at runtime
// ---------------------------------------------------------------------------

/**
 * Checks that every required Firebase environment variable is set.
 * Call this once during app startup (e.g. in layout.tsx) to get an early,
 * human-readable error instead of cryptic Firebase errors.
 *
 * @returns true if all vars are present; false + console.error if any is missing.
 */
export function validateFirebaseConfig(): boolean {
  // Only run on client side (Next.js SSR has no window)
  if (typeof window === 'undefined') return true;

  const required: Array<keyof typeof firebaseConfig> = [
    'apiKey',
    'authDomain',
    'projectId',
    'storageBucket',
    'messagingSenderId',
    'appId',
  ];

  const missing = required.filter((key) => !firebaseConfig[key]);

  if (missing.length > 0) {
    console.error(
      '[Firebase] Missing required environment variables:\n' +
        missing.map((k) => `  NEXT_PUBLIC_FIREBASE_${k.replace(/([A-Z])/g, '_$1').toUpperCase()}`).join('\n') +
        '\n\nAdd them to your .env.local file and restart the dev server.',
    );
    return false;
  }

  return true;
}
