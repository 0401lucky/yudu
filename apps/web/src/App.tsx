import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";

const LandingPage = lazy(() => import("./pages/LandingPage"));
const LibraryPage = lazy(() => import("./pages/LibraryPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const NotesPage = lazy(() => import("./pages/NotesPage"));
const ReaderPage = lazy(() => import("./pages/ReaderPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const ReportPage = lazy(() => import("./pages/ReportPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const StudioListPage = lazy(() => import("./pages/StudioListPage"));
const StudioWorkPage = lazy(() => import("./pages/StudioWorkPage"));

function PageFallback() {
  return (
    <main className="min-h-full flex items-center justify-center p-8">
      <p className="text-[var(--text-muted)]">加载中…</p>
    </main>
  );
}

function RequireAuth() {
  const { user, loading } = useAuth();

  if (loading) {
    return <PageFallback />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/studio" element={<StudioListPage />} />
          <Route path="/studio/:bookId" element={<StudioWorkPage />} />
          <Route path="/notes" element={<NotesPage />} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/read/:bookId" element={<ReaderPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
