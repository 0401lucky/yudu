import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import LandingPage from "./pages/LandingPage";
import LibraryPage from "./pages/LibraryPage";
import LoginPage from "./pages/LoginPage";
import NotesPage from "./pages/NotesPage";
import ReaderPage from "./pages/ReaderPage";
import RegisterPage from "./pages/RegisterPage";
import SettingsPage from "./pages/SettingsPage";

function RequireAuth() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <main className="min-h-full flex items-center justify-center p-8">
        <p className="text-[var(--text-muted)]">加载中…</p>
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/notes" element={<NotesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/read/:bookId" element={<ReaderPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
