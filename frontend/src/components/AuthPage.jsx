import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

import { authApi } from "../api/taskApi";

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function AuthPage({ onAuthenticated }) {
  const sceneRef = useRef(null);
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || prefersReducedMotion()) return undefined;

    const animation = gsap.fromTo(
      scene,
      { autoAlpha: 0, y: 48, rotateX: 18, scale: 0.94 },
      { autoAlpha: 1, y: 0, rotateX: 0, scale: 1, duration: 1.05, ease: "power3.out", clearProps: "transform,opacity,visibility" },
    );

    let accumulated = 0;
    function onWheel(event) {
      if (event.target.closest("input, textarea, button")) return;
      event.preventDefault();
      accumulated += event.deltaY;
      if (accumulated > 90) {
        setMode("register");
        accumulated = 0;
      } else if (accumulated < -90) {
        setMode("login");
        accumulated = 0;
      }
    }

    scene.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      animation.kill();
      scene.removeEventListener("wheel", onWheel);
    };
  }, []);

  function tiltScene(event) {
    if (prefersReducedMotion()) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    event.currentTarget.style.setProperty("--tilt-x", `${(-y * 7).toFixed(2)}deg`);
    event.currentTarget.style.setProperty("--tilt-y", `${(x * 9).toFixed(2)}deg`);
  }

  function resetTilt(event) {
    event.currentTarget.style.setProperty("--tilt-x", "0deg");
    event.currentTarget.style.setProperty("--tilt-y", "0deg");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (mode === "register" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setError("");
    setIsSubmitting(true);
    try {
      const credentials = { email, password };
      if (mode === "register") await authApi.register({ ...credentials, name });
      const session = await authApi.login(credentials);
      onAuthenticated({ token: session.access_token, user: session.user });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setError("");
  }

  return (
    <main className="auth-page">
      <div className="auth-aurora" aria-hidden="true" />
      <div className="auth-grid" aria-hidden="true" />
      <div
        ref={sceneRef}
        className="auth-scene"
        onPointerMove={tiltScene}
        onPointerLeave={resetTilt}
      >
        <div className="auth-glow" aria-hidden="true" />
        <div className={mode === "register" ? "auth-flip is-flipped" : "auth-flip"}>
          <AuthFace
            mode="login"
            active={mode === "login"}
            email={email}
            password={password}
            error={error}
            isSubmitting={isSubmitting}
            onEmail={setEmail}
            onPassword={setPassword}
            onSubmit={handleSubmit}
            onSwitch={switchMode}
          />
          <AuthFace
            mode="register"
            active={mode === "register"}
            name={name}
            email={email}
            password={password}
            confirmPassword={confirmPassword}
            error={error}
            isSubmitting={isSubmitting}
            onName={setName}
            onEmail={setEmail}
            onPassword={setPassword}
            onConfirmPassword={setConfirmPassword}
            onSubmit={handleSubmit}
            onSwitch={switchMode}
          />
        </div>
        <p className="auth-hint">Scroll or choose a tab to flip the card</p>
      </div>
    </main>
  );
}

function AuthFace({
  mode,
  active,
  name,
  email,
  password,
  confirmPassword,
  error,
  isSubmitting,
  onName,
  onEmail,
  onPassword,
  onConfirmPassword,
  onSubmit,
  onSwitch,
}) {
  const isLogin = mode === "login";

  return (
    <section
      className={`auth-card auth-face ${isLogin ? "auth-face-front" : "auth-face-back"}`}
      aria-labelledby={`${mode}-heading`}
      aria-hidden={!active}
      inert={!active}
    >
      <div className="brand auth-brand" aria-label="TaskFlow">
        <img className="brand-mark" src="/favicon.ico" alt="" />
        <span>TaskFlow</span>
      </div>
      <div className="auth-copy">
        <p className="eyebrow">Personal productivity</p>
        <h1 id={`${mode}-heading`}>{isLogin ? "Welcome back" : "Create your workspace"}</h1>
        <p>{isLogin ? "Sign in to manage your tasks securely." : "Create an account to keep your tasks private."}</p>
      </div>
      <div className="auth-tabs" role="tablist">
        <button className={isLogin ? "active" : ""} type="button" onClick={() => onSwitch("login")}>Sign in</button>
        <button className={!isLogin ? "active" : ""} type="button" onClick={() => onSwitch("register")}>Create account</button>
      </div>
      <form className="auth-form" onSubmit={onSubmit}>
        {!isLogin && (
          <>
            <label htmlFor="auth-name">Name</label>
            <input id="auth-name" type="text" value={name} onChange={(event) => onName(event.target.value)} placeholder="Your full name" minLength="2" maxLength="100" autoComplete="name" required disabled={isSubmitting} />
          </>
        )}
        <label htmlFor={isLogin ? "auth-email" : "register-email"}>Email</label>
        <input id={isLogin ? "auth-email" : "register-email"} type="email" value={email} onChange={(event) => onEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required disabled={isSubmitting} />
        <label htmlFor={isLogin ? "auth-password" : "register-password"}>Password</label>
        <input id={isLogin ? "auth-password" : "register-password"} type="password" value={password} onChange={(event) => onPassword(event.target.value)} placeholder="At least 8 characters" minLength="8" autoComplete={isLogin ? "current-password" : "new-password"} required disabled={isSubmitting} />
        {!isLogin && (
          <>
            <label htmlFor="auth-confirm-password">Confirm password</label>
            <input id="auth-confirm-password" type="password" value={confirmPassword} onChange={(event) => onConfirmPassword(event.target.value)} placeholder="Repeat your password" minLength="8" autoComplete="new-password" required disabled={isSubmitting} />
          </>
        )}
        {active && error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? "Please wait…" : isLogin ? "Sign in" : "Create account"}</button>
      </form>
    </section>
  );
}
