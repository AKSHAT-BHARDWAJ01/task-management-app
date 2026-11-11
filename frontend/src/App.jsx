import { useState } from "react";

import { AuthPage } from "./components/AuthPage";
import {
  clearAccessToken,
  getAccessToken,
  getCurrentUser,
  setAuthenticatedSession,
} from "./api/taskApi";
import { ToastProvider } from "./notifications/ToastProvider";
import { Home } from "./pages/Home";

function readInviteToken() {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("invite");
  if (fromUrl) {
    sessionStorage.setItem("taskflow-invite-token", fromUrl);
    params.delete("invite");
    const query = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }
  return sessionStorage.getItem("taskflow-invite-token") || "";
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(getCurrentUser());
  const [inviteToken, setInviteToken] = useState(readInviteToken);
  const isAuthenticated = Boolean(getAccessToken() && currentUser);

  function handleAuthenticated(session) {
    setAuthenticatedSession(session.token, session.user);
    setCurrentUser(session.user);
  }

  function handleLogout() {
    clearAccessToken();
    setCurrentUser(null);
  }

  return (
    <ToastProvider>
      {isAuthenticated
        ? <Home currentUser={currentUser} onLogout={handleLogout} inviteToken={inviteToken} onInviteDone={() => { sessionStorage.removeItem("taskflow-invite-token"); setInviteToken(""); }} />
        : <AuthPage onAuthenticated={handleAuthenticated} inviteMessage={inviteToken ? "You have a workspace invitation. Sign in with the invited email address." : ""} />}
    </ToastProvider>
  );
}
