import { useState } from "react";

import { AuthPage } from "./components/AuthPage";
import {
  clearAccessToken,
  getAccessToken,
  getCurrentUser,
  setAuthenticatedSession,
} from "./api/taskApi";
import { Home } from "./pages/Home";

export default function App() {
  const [currentUser, setCurrentUser] = useState(getCurrentUser());
  const isAuthenticated = Boolean(getAccessToken() && currentUser);

  function handleAuthenticated(session) {
    setAuthenticatedSession(session.token, session.user);
    setCurrentUser(session.user);
  }

  function handleLogout() {
    clearAccessToken();
    setCurrentUser(null);
  }

  return isAuthenticated
    ? <Home currentUser={currentUser} onLogout={handleLogout} />
    : <AuthPage onAuthenticated={handleAuthenticated} />;
}
