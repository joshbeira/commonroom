import { useState, type FormEvent } from "react";
import { ArrowRight, Check, LockKeyhole, Sprout } from "lucide-react";
import { post } from "./api";
import type { Session } from "./types";
import { Brand, HouseArt } from "./ui";

export function Auth({
  session,
  onSignedIn,
}: {
  session: Session;
  onSignedIn: () => Promise<void>;
}) {
  const resetToken = new URLSearchParams(location.search).get("reset");
  const [mode, setMode] = useState(resetToken ? "reset" : "login");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const response = await post<{ message?: string }>("/auth/" + mode, {
        ...data,
        token: resetToken,
      });
      if (mode === "recover")
        setMessage(response.message || "Check your inbox.");
      else if (mode === "reset") {
        history.replaceState({}, "", "/");
        setMode("login");
        setMessage("Password updated. Sign in with your new password.");
        await onSignedIn();
      } else await onSignedIn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function enterDemo() {
    setBusy(true);
    setError("");
    try {
      await post("/auth/demo");
      await onSignedIn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Brand />
        <div className="auth-story-content">
          <span className="pill">
            <Sprout size={15} /> A LITTLE MORE HARMONY AT HOME
          </span>
          <h1>
            Shared living.
            <br />
            <em>Settled.</em>
          </h1>
          <p>
            For the big bills, the little shops,
            <br />
            and the people you share it all with.
          </p>
          <HouseArt />
          <div className="auth-promises">
            <span>
              <Check size={16} /> Every penny accounted for
            </span>
            <span>
              <Check size={16} /> A clear picture, together
            </span>
          </div>
        </div>
        <small>Good housemates. Clear balances. Room to breathe.</small>
      </section>
      <section className="auth-panel">
        <div className="auth-form-wrap">
          <span className="eyebrow">MAKE YOURSELF AT HOME</span>
          <h2>
            {mode === "register"
              ? "A fresh start, together."
              : mode === "recover"
                ? "Let’s get you back in."
                : mode === "reset"
                  ? "A new set of keys."
                  : "Welcome home."}
          </h2>
          <p className="muted">
            {mode === "register"
              ? "Create your account and bring your household together."
              : mode === "recover"
                ? "We’ll email you a link to reset your password."
                : mode === "reset"
                  ? "Choose a strong password of at least 12 characters."
                  : "Less chasing payments. More living your life."}
          </p>
          <form onSubmit={submit}>
            {mode === "register" && (
              <label>
                Your name
                <input
                  name="name"
                  autoComplete="name"
                  minLength={2}
                  maxLength={60}
                  required
                  placeholder="Alex Morgan"
                />
              </label>
            )}
            {mode !== "reset" && (
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  placeholder="you@example.com"
                />
              </label>
            )}
            {mode !== "recover" && (
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  minLength={mode === "login" ? 1 : 12}
                  maxLength={128}
                  required
                  placeholder={
                    mode === "login"
                      ? "Your password"
                      : "At least 12 characters"
                  }
                />
              </label>
            )}
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            {message && (
              <div className="success" role="status">
                {message}
              </div>
            )}
            <button className="button primary full" disabled={busy}>
              {busy
                ? "One moment…"
                : mode === "register"
                  ? "Create account"
                  : mode === "recover"
                    ? "Send recovery link"
                    : mode === "reset"
                      ? "Update password"
                      : "Sign in"}
              <ArrowRight size={17} />
            </button>
          </form>
          <div className="auth-links">
            <button
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
                setMessage("");
              }}
            >
              {mode === "login"
                ? "New here? Create an account"
                : "Back to sign in"}
            </button>
            {mode === "login" && session.recovery_enabled && (
              <button onClick={() => setMode("recover")}>
                Forgot password?
              </button>
            )}
          </div>
          {session.demo_enabled && (
            <div className="demo-entry">
              <span>JUST HAVING A LOOK?</span>
              <button
                className="button secondary full"
                disabled={busy}
                onClick={enterDemo}
              >
                Explore the demo <ArrowRight size={17} />
              </button>
              <small>A private sample household. No sign-up needed.</small>
            </div>
          )}
          <p className="auth-security">
            <LockKeyhole size={14} /> Your household’s business stays in your
            household.
          </p>
        </div>
      </section>
    </main>
  );
}

export function Onboarding({ refresh }: { refresh: () => Promise<void> }) {
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await post(
        joining ? "/household/join" : "/household",
        Object.fromEntries(new FormData(e.currentTarget)),
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="onboarding">
      <Brand />
      <HouseArt />
      <h1>A place for your people.</h1>
      <p className="muted">
        Create a household, or join one with an invitation from a housemate.
      </p>
      <form onSubmit={submit}>
        <label>
          {joining ? "Invitation code" : "Household name"}
          <input
            key={String(joining)}
            name={joining ? "code" : "name"}
            required
            minLength={joining ? 10 : 2}
            maxLength={joining ? 100 : 60}
            placeholder={
              joining ? "Paste your invitation code" : "The Maple House"
            }
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary full" disabled={busy}>
          {busy
            ? "One moment…"
            : joining
              ? "Join household"
              : "Create household"}
          <ArrowRight size={16} />
        </button>
      </form>
      <button className="text-link" onClick={() => setJoining(!joining)}>
        {joining ? "Create a household instead" : "I have an invitation code"}
      </button>
    </div>
  );
}
