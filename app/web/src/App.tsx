import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { LightboxProvider } from "./components/Lightbox";
import { CommandPalette } from "./components/CommandPalette";
import { HealthBanner } from "./components/HealthBanner";
import { Dashboard } from "./pages/Dashboard";
import { Books } from "./pages/Books";
import { BookReader } from "./pages/BookReader";
import { Bookmarks } from "./pages/Bookmarks";
import { Search } from "./pages/Search";
import { Ask } from "./pages/Ask";
import { Frameworks } from "./pages/Frameworks";
import { Glossary } from "./pages/Glossary";
import { SlideIndex } from "./pages/SlideIndex";
import { Labs } from "./pages/Labs";
import { Notes } from "./pages/Notes";
import { Assets } from "./pages/Assets";
import { Quiz } from "./pages/Quiz";
import { ExamIndex } from "./pages/ExamIndex";
import { IndexPrint } from "./pages/IndexPrint";
import { ReferencePrint } from "./pages/ReferencePrint";

export function AppShell() {
  return (
    <div className="flex min-h-screen bg-bg text-fg">
      <LightboxProvider>
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <CommandPalette />
          <main className="w-full max-w-[1160px] px-8 pb-[60px] pt-[30px]
                           print:max-w-none print:px-0 print:pb-0 print:pt-0">
            <HealthBanner />
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/books" element={<Books />} />
              <Route path="/books/:slug" element={<BookReader />} />
              <Route path="/bookmarks" element={<Bookmarks />} />
              <Route path="/search" element={<Search />} />
              <Route path="/ask" element={<Ask />} />
              <Route path="/frameworks" element={<Frameworks />} />
              <Route path="/glossary" element={<Glossary />} />
              <Route path="/slides" element={<SlideIndex />} />
              <Route path="/labs" element={<Labs />} />
              <Route path="/notes" element={<Notes />} />
              <Route path="/assets" element={<Assets />} />
              <Route path="/quiz" element={<Quiz />} />
              <Route path="/index" element={<ExamIndex />} />
              <Route path="/index/print" element={<IndexPrint />} />
              <Route path="/reference/print" element={<ReferencePrint />} />
            </Routes>
          </main>
        </div>
      </LightboxProvider>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
