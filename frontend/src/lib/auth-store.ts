export type OAuthProvider = "google" | "github";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  affiliation?: string;
  provider?: "email" | OAuthProvider;
};

type StoredUser = AuthUser & {
  password: string;
};

const USERS_KEY = "arionear-users";
const SESSION_KEY = "arionear-session";

function readUsers(): StoredUser[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredUser[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeUsers(users: StoredUser[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getSession(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function isAuthenticated() {
  return getSession() !== null;
}

export function setSession(user: AuthUser) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
}

export function registerUser(input: {
  name: string;
  email: string;
  password: string;
  affiliation?: string;
}): { ok: true; user: AuthUser } | { ok: false; error: string } {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const password = input.password;
  const affiliation = input.affiliation?.trim();

  if (!name) return { ok: false, error: "Please enter your full name." };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  const users = readUsers();
  if (users.some((u) => u.email === email)) {
    return { ok: false, error: "An account with this email already exists." };
  }

  const user: AuthUser = {
    id: crypto.randomUUID(),
    name,
    email,
    affiliation: affiliation || undefined,
  };

  users.push({ ...user, password });
  writeUsers(users);
  setSession(user);
  return { ok: true, user };
}

export function loginUser(
  email: string,
  password: string,
): { ok: true; user: AuthUser } | { ok: false; error: string } {
  const normalized = normalizeEmail(email);
  if (!normalized || !password) {
    return { ok: false, error: "Please enter your email and password." };
  }

  const match = readUsers().find((u) => u.email === normalized && u.password === password);
  if (!match) {
    return { ok: false, error: "Invalid email or password." };
  }

  const user: AuthUser = {
    id: match.id,
    name: match.name,
    email: match.email,
    affiliation: match.affiliation,
  };
  setSession(user);
  return { ok: true, user };
}

export function logoutUser() {
  clearSession();
}

const OAUTH_PROFILES: Record<OAuthProvider, { name: string; email: string }> = {
  google: {
    name: "Alex Chen",
    email: "alex.chen@gmail.com",
  },
  github: {
    name: "researcher-dev",
    email: "researcher-dev@users.noreply.github.com",
  },
};

export function loginWithOAuth(
  provider: OAuthProvider,
): { ok: true; user: AuthUser } | { ok: false; error: string } {
  const profile = OAUTH_PROFILES[provider];
  const users = readUsers();
  const existing = users.find((u) => u.email === profile.email);

  if (existing) {
    const user: AuthUser = {
      id: existing.id,
      name: existing.name,
      email: existing.email,
      affiliation: existing.affiliation,
      provider,
    };
    setSession(user);
    return { ok: true, user };
  }

  const user: AuthUser = {
    id: crypto.randomUUID(),
    name: profile.name,
    email: profile.email,
    provider,
  };

  users.push({ ...user, password: `oauth:${provider}` });
  writeUsers(users);
  setSession(user);
  return { ok: true, user };
}
