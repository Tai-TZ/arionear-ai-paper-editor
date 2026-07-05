import type { DefenseMessage } from "@/components/defense/defense-chat-panel";
import { updatePaper } from "@/lib/api/papers-api";

export type StoredDefenseSession = {
  messages: DefenseMessage[];
  hasStarted: boolean;
  updatedAt?: number;
};

const SESSION_KEY_PREFIX = "defense_session_";
const PERSIST_DEBOUNCE_MS = 600;
/** Keep the most recent messages when syncing to paper metadata. */
const MAX_STORED_MESSAGES = 48;

type PendingPersist = {
  session: StoredDefenseSession;
  onError?: () => void;
};

const pendingByProject = new Map<string, PendingPersist>();
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function sessionStorageKey(projectId: string) {
  return `${SESSION_KEY_PREFIX}${projectId}`;
}

function isDefenseMessage(value: unknown): value is DefenseMessage {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    (row.role === "user" || row.role === "assistant") &&
    typeof row.content === "string"
  );
}

export function parseDefenseSession(raw: unknown): StoredDefenseSession | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.messages)) return undefined;

  const messages = obj.messages.filter(isDefenseMessage).map((m) => ({
    role: m.role,
    content: m.content,
    ...(m.isStreaming ? { isStreaming: true } : {}),
    ...(m.isCancelled ? { isCancelled: true } : {}),
    ...(m.isError ? { isError: true } : {}),
  }));

  return {
    messages,
    hasStarted: Boolean(obj.hasStarted),
    updatedAt: typeof obj.updatedAt === "number" ? obj.updatedAt : undefined,
  };
}

export function stripDefenseMessagesForStorage(messages: DefenseMessage[]): DefenseMessage[] {
  return messages.filter((m) => !m.isStreaming);
}

/** Trim long conversations before server persist (local session keeps full history). */
export function trimDefenseSessionForStorage(
  session: StoredDefenseSession,
): StoredDefenseSession {
  const messages = stripDefenseMessagesForStorage(session.messages);
  if (messages.length <= MAX_STORED_MESSAGES) {
    return { ...session, messages };
  }
  return { ...session, messages: messages.slice(-MAX_STORED_MESSAGES) };
}

export function isPersistableDefenseSession(session: StoredDefenseSession): boolean {
  return session.messages.some(
    (m) =>
      m.role === "assistant" &&
      !m.isCancelled &&
      !m.isStreaming &&
      m.content.trim().length > 0,
  );
}

export function mergeDefenseSessions(
  server: StoredDefenseSession | null | undefined,
  local: StoredDefenseSession | null,
): StoredDefenseSession | null {
  if (!server && !local) return null;
  if (!server) return local;
  if (!local) return server;
  const serverTs = server.updatedAt ?? 0;
  const localTs = local.updatedAt ?? 0;
  return serverTs >= localTs ? server : local;
}

export function loadLocalDefenseSession(projectId: string): StoredDefenseSession | null {
  try {
    const raw = sessionStorage.getItem(sessionStorageKey(projectId));
    if (!raw) return null;
    return parseDefenseSession(JSON.parse(raw)) ?? null;
  } catch {
    return null;
  }
}

export function saveLocalDefenseSession(projectId: string, session: StoredDefenseSession) {
  try {
    const clean: StoredDefenseSession = {
      ...session,
      messages: stripDefenseMessagesForStorage(session.messages),
      updatedAt: Date.now(),
    };
    sessionStorage.setItem(sessionStorageKey(projectId), JSON.stringify(clean));
  } catch {
    /* sessionStorage full — ignore */
  }
}

export function clearLocalDefenseSession(projectId: string) {
  sessionStorage.removeItem(sessionStorageKey(projectId));
}

function flushDefenseSessionPersist() {
  persistTimer = null;
  const batch = new Map(pendingByProject);
  pendingByProject.clear();

  for (const [projectId, { session, onError }] of batch) {
    const trimmed = trimDefenseSessionForStorage(session);
    const payload = {
      messages: stripDefenseMessagesForStorage(trimmed.messages).map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.isCancelled ? { isCancelled: true } : {}),
        ...(m.isError ? { isError: true } : {}),
      })),
      hasStarted: trimmed.hasStarted,
      updatedAt: Date.now(),
    };

    void updatePaper(
      projectId,
      { metadata: { defense_session: payload } },
      { immediate: true },
    ).catch(() => {
      onError?.();
    });
  }
}

export type PersistDefenseSessionOptions = {
  onError?: () => void;
};

export function persistDefenseSession(
  projectId: string,
  session: StoredDefenseSession,
  options?: PersistDefenseSessionOptions,
) {
  saveLocalDefenseSession(projectId, session);

  if (!isPersistableDefenseSession(session)) {
    pendingByProject.delete(projectId);
    void updatePaper(
      projectId,
      { metadata: { defense_session: null } },
      { immediate: true },
    ).catch(() => {
      options?.onError?.();
    });
    return;
  }

  pendingByProject.set(projectId, { session, onError: options?.onError });
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(flushDefenseSessionPersist, PERSIST_DEBOUNCE_MS);
}

export function flushDefenseSessionPersistNow() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (pendingByProject.size > 0) {
    flushDefenseSessionPersist();
  }
}

export function clearDefenseSession(projectId: string, options?: PersistDefenseSessionOptions) {
  pendingByProject.delete(projectId);
  clearLocalDefenseSession(projectId);
  void updatePaper(
    projectId,
    { metadata: { defense_session: null } },
    { immediate: true },
  ).catch(() => {
    options?.onError?.();
  });
}
