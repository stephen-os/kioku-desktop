import { lazy, Suspense, useState, useEffect } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { ttsWarmup } from "./lib/tts";
import { isTauri } from "./lib/auth";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { SettingsProvider } from "./context/SettingsContext";
import { ShortcutsProvider, useShortcuts, useRegisterShortcut } from "./context/ShortcutsContext";
import { ToastContainer } from "./components/Toast";
import { ShortcutsHelp } from "./components/shortcuts";
import { QuickSwitcher } from "./components/QuickSwitcher";
import { Layout } from "./components/Layout";
import { ErrorBoundary } from "./components/ErrorBoundary";

// Eagerly loaded pages (critical path)
import { DeckDashboard } from "./pages/DeckDashboard";
import { Login } from "./pages/Login";

// Lazy-loaded pages (code splitting)
const DeckView = lazy(() => import("./pages/DeckView").then(m => ({ default: m.DeckView })));
const StudyMode = lazy(() => import("./pages/StudyMode").then(m => ({ default: m.StudyMode })));
const AutoplayMode = lazy(() => import("./pages/AutoplayMode").then(m => ({ default: m.AutoplayMode })));
const NewDeck = lazy(() => import("./pages/NewDeck").then(m => ({ default: m.NewDeck })));
const DeckEdit = lazy(() => import("./pages/DeckEdit").then(m => ({ default: m.DeckEdit })));
const Settings = lazy(() => import("./pages/Settings").then(m => ({ default: m.Settings })));
const Stats = lazy(() => import("./pages/Stats").then(m => ({ default: m.Stats })));
const Help = lazy(() => import("./pages/Help").then(m => ({ default: m.Help })));
const Export = lazy(() => import("./pages/Export").then(m => ({ default: m.Export })));

// Quiz pages (lazy-loaded)
const QuizDashboard = lazy(() => import("./pages/QuizDashboard").then(m => ({ default: m.QuizDashboard })));
const QuizView = lazy(() => import("./pages/QuizView").then(m => ({ default: m.QuizView })));
const QuizEditor = lazy(() => import("./pages/QuizEditor").then(m => ({ default: m.QuizEditor })));
const TakeQuiz = lazy(() => import("./pages/TakeQuiz").then(m => ({ default: m.TakeQuiz })));
const QuizResults = lazy(() => import("./pages/QuizResults").then(m => ({ default: m.QuizResults })));

// Course pages (lazy-loaded)
const CourseDashboard = lazy(() => import("./pages/CourseDashboard").then(m => ({ default: m.CourseDashboard })));
const CourseView = lazy(() => import("./pages/CourseView").then(m => ({ default: m.CourseView })));
const CourseEditor = lazy(() => import("./pages/CourseEditor").then(m => ({ default: m.CourseEditor })));
const CourseNoteView = lazy(() => import("./pages/CourseNoteView").then(m => ({ default: m.CourseNoteView })));

// Notes pages (lazy-loaded)
const NotesDashboard = lazy(() => import("./pages/NotesDashboard").then(m => ({ default: m.NotesDashboard })));
const NotebookView = lazy(() => import("./pages/NotebookView").then(m => ({ default: m.NotebookView })));

// Loading fallback for lazy-loaded pages
function PageLoader() {
  return (
    <div className="h-full flex items-center justify-center bg-[#2d2a2e]">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-[#ffd866] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-[#939293]">Loading...</p>
      </div>
    </div>
  );
}

// Protected route wrapper - requires authentication
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="text-3xl font-bold text-yellow mb-2">Kioku</div>
          <div className="text-foreground-dim">Loading...</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// Login route - only shown if not logged in
function LoginRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="text-3xl font-bold text-yellow mb-2">Kioku</div>
          <div className="text-foreground-dim">Loading...</div>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

// Global shortcuts that are always available
function GlobalShortcuts() {
  const navigate = useNavigate();
  const { showHelp, setShowHelp } = useShortcuts();
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false);

  // Toggle shortcuts help modal
  useRegisterShortcut(
    "show-help",
    { key: "/", ctrl: true },
    () => setShowHelp(!showHelp),
    { label: "Show keyboard shortcuts", scope: "global" }
  );

  // Navigate to settings
  useRegisterShortcut(
    "open-settings",
    { key: ",", ctrl: true },
    () => navigate("/settings"),
    { label: "Open settings", scope: "global" }
  );

  // Open quick switcher
  useRegisterShortcut(
    "quick-switcher",
    { key: "k", ctrl: true },
    () => setShowQuickSwitcher(true),
    { label: "Quick switcher", description: "Jump to any page", scope: "global" }
  );

  return (
    <QuickSwitcher
      isOpen={showQuickSwitcher}
      onClose={() => setShowQuickSwitcher(false)}
    />
  );
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <GlobalShortcuts />
      <Routes>
        {/* Login route */}
        <Route
          path="/login"
          element={
            <LoginRoute>
              <Login />
            </LoginRoute>
          }
        />

        {/* Protected routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DeckDashboard />} />
          <Route path="decks/new" element={<NewDeck />} />
          <Route path="decks/:id" element={<DeckView />} />
          <Route path="decks/:id/edit" element={<DeckEdit />} />
          <Route path="decks/:id/study" element={<StudyMode />} />
          <Route path="decks/:id/autoplay" element={<AutoplayMode />} />
          {/* Quiz routes */}
          <Route path="quizzes" element={<QuizDashboard />} />
          <Route path="quizzes/new" element={<QuizEditor />} />
          <Route path="quizzes/:id" element={<QuizView />} />
          <Route path="quizzes/:id/edit" element={<QuizEditor />} />
          <Route path="quizzes/:id/take" element={<TakeQuiz />} />
          <Route path="quizzes/:id/results/:attemptId" element={<QuizResults />} />
          {/* Course routes */}
          <Route path="courses" element={<CourseDashboard />} />
          <Route path="courses/new" element={<CourseEditor />} />
          <Route path="courses/:id" element={<CourseView />} />
          <Route path="courses/:id/edit" element={<CourseEditor />} />
          <Route path="course-note/:coursePageId" element={<CourseNoteView />} />
          {/* Notes routes */}
          <Route path="notes" element={<NotesDashboard />} />
          <Route path="notes/:notebookId" element={<NotebookView />} />
          <Route path="notes/:notebookId/pages/:pageId" element={<NotebookView />} />
          <Route path="stats" element={<Stats />} />
          <Route path="export" element={<Export />} />
          <Route path="help" element={<Help />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  // Warm up the TTS engine in the background at launch (start the daemon +
  // preload the English model) so study/autoplay is responsive. Best-effort;
  // no-op if the engine isn't installed.
  useEffect(() => {
    if (isTauri()) {
      ttsWarmup("en").catch(() => {});
    }
  }, []);

  return (
    <ErrorBoundary>
      <ToastProvider>
        <SettingsProvider>
          <ShortcutsProvider>
            <AuthProvider>
              <AppRoutes />
              <ToastContainer />
              <ShortcutsHelp />
            </AuthProvider>
          </ShortcutsProvider>
        </SettingsProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
