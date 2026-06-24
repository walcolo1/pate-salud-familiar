/**
 * Data Backend Feature Flag — Paté Salud Familiar
 *
 * Controls which data backend the app uses: the existing Google Sheets
 * integration or the new Firebase/Firestore backend.
 *
 * HOW TO USE
 * ----------
 * In .env.local set:
 *   NEXT_PUBLIC_DATA_BACKEND=sheets    ← default, current behaviour unchanged
 *   NEXT_PUBLIC_DATA_BACKEND=firebase  ← new Firestore backend
 *
 * The flag is read at module load time. Changing it requires a dev-server
 * restart (or a new Vercel deployment).
 *
 * DESIGN INTENT
 * -------------
 * The DataRepository abstraction layer (src/lib/dataRepository.ts, created
 * in a later phase) will call `getRepository()` to obtain the correct
 * implementation. AppContext.tsx will call DataRepository methods instead of
 * calling the Sheets/Drive libraries directly.
 *
 * During the migration period BOTH backends coexist in the bundle; only the
 * active one is imported at runtime (dynamic import with code splitting).
 *
 * SAFETY GUARANTEE
 * ----------------
 * If the env var is missing or has an unexpected value the flag defaults to
 * 'sheets', so the app never breaks silently.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DataBackend = 'sheets' | 'firebase';

// ---------------------------------------------------------------------------
// Current active backend (resolved once at startup)
// ---------------------------------------------------------------------------

function resolveBackend(): DataBackend {
  const raw = process.env.NEXT_PUBLIC_DATA_BACKEND?.trim().toLowerCase();
  if (raw === 'firebase') return 'firebase';
  // Default: fall back to existing Sheets backend
  return 'sheets';
}

/** The active data backend for this session. */
export const DATA_BACKEND: DataBackend = resolveBackend();

/** True when the app is using the new Firestore backend. */
export const isFirebaseBackend: boolean = DATA_BACKEND === 'firebase';

/** True when the app is using the existing Google Sheets backend. */
export const isSheetsBackend: boolean = DATA_BACKEND === 'sheets';

// ---------------------------------------------------------------------------
// Repository factory (lazy — loads the concrete implementation on demand)
// ---------------------------------------------------------------------------

/**
 * Returns the active DataRepository implementation.
 *
 * Uses dynamic import so only the relevant backend code is executed.
 * The DataRepository interface and concrete classes will be created in
 * Phase 5 (firestoreService / DataRepository abstraction layer).
 *
 * For now this function is a placeholder that logs the active backend
 * and throws if called before the repository implementations exist.
 *
 * @internal — Do NOT call from AppContext.tsx yet.
 *             This will be wired up in Phase 8.
 */
export async function getRepository(): Promise<never> {
  // if (typeof window !== 'undefined') {
  //   console.info(`[DataBackend] Active backend: ${DATA_BACKEND}`);
  // }

  throw new Error(
    `[DataBackend] getRepository() called before DataRepository implementations exist. ` +
    `This will be implemented in Phase 5 (firestoreService) and Phase 8 (DataRepository abstraction). ` +
    `Current backend: ${DATA_BACKEND}`,
  );
}

// ---------------------------------------------------------------------------
// Debug helper (dev only)
// ---------------------------------------------------------------------------

/**
 * Logs the current backend selection to the browser console.
 * Call this once during app startup for observability.
 * Is a no-op in production builds.
 */
export function logBackendSelection(): void {
  if (typeof window === 'undefined') return;
  if (process.env.NODE_ENV === 'production') return;

  const style =
    DATA_BACKEND === 'firebase'
      ? 'background:#F59E0B;color:#000;padding:2px 6px;border-radius:4px;font-weight:bold'
      : 'background:#6366F1;color:#fff;padding:2px 6px;border-radius:4px;font-weight:bold';

  // eslint-disable-next-line no-console
  console.log(`%c Paté Salud Familiar — Data Backend: ${DATA_BACKEND.toUpperCase()} `, style);
}
