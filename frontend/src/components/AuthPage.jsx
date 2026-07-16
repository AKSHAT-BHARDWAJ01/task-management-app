import { useState } from "react";

import { authApi } from "../api/taskApi";

export function AuthPage({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      <section className="auth-card" aria-labelledby="auth-heading">
        <div className="brand auth-brand" aria-label="TaskFlow">
          <img className="brand-mark" src="/favicon.ico" alt="" />
          <span>TaskFlow</span>
        </div>
        <div className="auth-copy">
          <p className="eyebrow">Personal productivity</p>
          <h1 id="auth-heading">{mode === "login" ? "Welcome back" : "Create your workspace"}</h1>
          <p>{mode === "login" ? "Sign in to manage your tasks securely." : "Create an account to keep your tasks private."}</p>
        </div>
        <div className="auth-tabs" role="tablist">
          <button className={mode === "login" ? "active" : ""} type="button" onClick={() => switchMode("login")}>Sign in</button>
          <button className={mode === "register" ? "active" : ""} type="button" onClick={() => switchMode("register")}>Create account</button>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "register" && <><label htmlFor="auth-name">Name</label><input id="auth-name" type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your full name" minLength="2" maxLength="100" autoComplete="name" required disabled={isSubmitting} /></>}
          <label htmlFor="auth-email">Email</label>
          <input id="auth-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required disabled={isSubmitting} />
          <label htmlFor="auth-password">Password</label>
          <input id="auth-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" minLength="8" autoComplete={mode === "login" ? "current-password" : "new-password"} required disabled={isSubmitting} />
          {mode === "register" && <><label htmlFor="auth-confirm-password">Confirm password</label><input id="auth-confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat your password" minLength="8" autoComplete="new-password" required disabled={isSubmitting} /></>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
        </form>
      </section>
    </main>
  );
}
