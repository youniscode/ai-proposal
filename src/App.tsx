import { useState, useEffect } from "react";
import "./index.css";

type SectionKey = "all" | "overview" | "brief" | "proposal" | "miniSpec";

type HistoryItem = {
  id: string;
  createdAt: string;
  title: string;
  leadText: string;
  outputText: string;
  model: string;
  tone: string;
};

const HISTORY_KEY = "jc-ai-proposal-history-v1";

function splitSections(markdown: string) {
  const base = {
    all: markdown,
    overview: "",
    brief: "",
    proposal: "",
    miniSpec: "",
  };

  if (!markdown) return base;

  // Look for headings like: ## 1. Project Overview
  const regex = /^##\s*\d+\.\s*([^\n]+)\s*$/gm;
  const matches = [...markdown.matchAll(regex)];

  if (matches.length === 0) return base;

  const parts: { title: string; start: number; end: number }[] = [];

  matches.forEach((m, idx) => {
    const start = m.index ?? 0;
    const end =
      idx + 1 < matches.length
        ? matches[idx + 1].index ?? markdown.length
        : markdown.length;
    parts.push({ title: m[1].toLowerCase(), start, end });
  });

  let overview = "";
  let brief = "";
  let proposal = "";
  let miniSpec = "";

  parts.forEach((p) => {
    const body = markdown.slice(p.start, p.end).trim();
    if (p.title.includes("project overview")) overview = body;
    else if (p.title.includes("final project brief")) brief = body;
    else if (p.title.includes("proposal")) proposal = body;
    else if (p.title.includes("mini-spec") || p.title.includes("mini spec"))
      miniSpec = body;
  });

  return {
    all: markdown,
    overview,
    brief,
    proposal,
    miniSpec,
  };
}

function deriveTitle(lead: string): string {
  const lines = lead
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const nameLine = lines.find((l) => l.toLowerCase().startsWith("lead name:"));
  if (nameLine) {
    return (
      nameLine.replace(/^[Ll]ead [Nn]ame:\s*/, "").trim() || "Untitled lead"
    );
  }

  return lines[0] || "Untitled lead";
}

function makeId(): string {
  if (
    typeof crypto !== "undefined" &&
    "randomUUID" in crypto &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}


function App() {
  const [leadText, setLeadText] = useState("");
  const [outputText, setOutputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [activeTab, setActiveTab] = useState<SectionKey>("all");
  const [model, setModel] = useState("gpt-4.1-mini");
  const [tone, setTone] = useState("premium");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);

  // Load history from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(HISTORY_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as HistoryItem[];
      if (Array.isArray(parsed)) {
        setHistory(parsed);
      }
    } catch {
      // ignore parsing errors, start fresh
    }
  }, []);

  // Persist history whenever it changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      // ignore storage errors
    }
  }, [history]);

  const handleNewProject = () => {
    setLeadText("");
    setOutputText("");
    setErrorText("");
    setCopyMessage("");
    setActiveTab("all");
    setActiveHistoryId(null);
  };

  const handleGenerate = async () => {
    if (!leadText.trim()) {
      setOutputText("");
      setErrorText("Paste a lead on the left, then click Generate.");
      return;
    }

    try {
      setIsLoading(true);
      setErrorText("");
      setCopyMessage("");
      setActiveTab("all");
      setOutputText("Generating project folder from backend…");
      setActiveHistoryId(null);

      const res = await fetch(
        "http://localhost:5000/api/generate-project-folder",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ leadText, model, tone }),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to generate project folder.");
      }

      const data = await res.json();
      const folder = data.projectFolder || "No project folder returned.";
      setOutputText(folder);

      // Save to history (keep latest 15)
      const item: HistoryItem = {
        id: makeId(),
        createdAt: new Date().toISOString(),
        title: deriveTitle(leadText),
        leadText,
        outputText: folder,
        model,
        tone,
      };

      setHistory((prev) => [item, ...prev].slice(0, 15));
      setActiveHistoryId(item.id);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Something went wrong while contacting the backend.";

      setErrorText(message);
      setOutputText("");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!outputText.trim()) return;
    try {
      await navigator.clipboard.writeText(outputText);
      setCopyMessage("Copied to clipboard.");
      setTimeout(() => setCopyMessage(""), 2000);
    } catch {
      setCopyMessage("Unable to copy. Please try again.");
      setTimeout(() => setCopyMessage(""), 2000);
    }
  };

  const handleDownload = () => {
    if (!outputText.trim()) return;

    const blob = new Blob([outputText], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "project-folder.md";
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  };

  const handleSelectHistory = (item: HistoryItem) => {
    setLeadText(item.leadText);
    setOutputText(item.outputText);
    setModel(item.model);
    setTone(item.tone);
    setErrorText("");
    setCopyMessage("");
    setActiveTab("all");
    setActiveHistoryId(item.id);
  };

  const sections = splitSections(outputText);
  const activeText: string =
    activeTab === "all"
      ? sections.all
      : activeTab === "overview"
      ? sections.overview || sections.all
      : activeTab === "brief"
      ? sections.brief || sections.all
      : activeTab === "proposal"
      ? sections.proposal || sections.all
      : sections.miniSpec || sections.all;

  const tabs: { key: SectionKey; label: string }[] = [
    { key: "all", label: "All" },
    { key: "overview", label: "Overview" },
    { key: "brief", label: "Brief" },
    { key: "proposal", label: "Proposal" },
    { key: "miniSpec", label: "Mini-spec" },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="hidden md:flex w-72 flex-col border-r border-slate-800 bg-slate-950/90 px-5 py-6 gap-6">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold text-lg">
              J
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight">
                JonasCode Studio
              </p>
              <p className="text-[11px] text-slate-500">
                AI Proposal Workspace
              </p>
            </div>
          </div>

          <nav className="flex-1 text-sm">
            <p className="mb-2 text-[11px] uppercase tracking-[0.12em] text-slate-500">
              Workspace
            </p>
            <ul className="space-y-1 mb-3">
              <li>
                <button
                  className="w-full text-left px-3 py-2 rounded-lg bg-slate-900 text-slate-100 text-sm font-medium"
                  onClick={handleNewProject}
                >
                  New project
                </button>
              </li>
            </ul>

            {/* History list */}
            <div className="mb-6">
              <p className="mb-2 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                Recent runs
              </p>
              {history.length === 0 ? (
                <p className="text-[11px] text-slate-500">
                  No history yet. Generate a project to see it here.
                </p>
              ) : (
                <ul className="space-y-1 max-h-64 overflow-auto pr-1">
                  {history.map((item) => (
                    <li key={item.id}>
                      <button
                        onClick={() => handleSelectHistory(item)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-[11px] border ${
                          activeHistoryId === item.id
                            ? "bg-slate-900 border-cyan-500 text-slate-100"
                            : "border-slate-800 text-slate-300 hover:bg-slate-900 hover:text-slate-100"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium">
                            {item.title}
                          </span>
                          <span className="text-[9px] text-slate-500">
                            {new Date(item.createdAt).toLocaleTimeString(
                              undefined,
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                              }
                            )}
                          </span>
                        </div>
                        <div className="mt-1 text-[9px] text-slate-500 flex gap-2">
                          <span>{item.model}</span>
                          <span>•</span>
                          <span>{item.tone}</span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="mt-2 mb-2 text-[11px] uppercase tracking-[0.12em] text-slate-500">
              Settings
            </p>

            <div className="space-y-3 text-[11px] text-slate-400">
              <div className="space-y-1">
                <label
                  htmlFor="model-select"
                  className="block text-[10px] uppercase tracking-[0.16em] text-slate-500"
                >
                  Model
                </label>
                <select
                  id="model-select"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-500"
                >
                  <option value="gpt-4.1-mini">
                    GPT-4.1 mini (fast, cheap)
                  </option>
                  <option value="gpt-4.1">GPT-4.1 (higher quality)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="tone-select"
                  className="block text-[10px] uppercase tracking-[0.16em] text-slate-500"
                >
                  Tone preset
                </label>
                <select
                  id="tone-select"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-500"
                >
                  <option value="premium">Premium agency (default)</option>
                  <option value="professional">Professional & neutral</option>
                  <option value="friendly">Friendly & approachable</option>
                  <option value="concise">Ultra concise</option>
                </select>
              </div>
            </div>
          </nav>

          <div className="mt-auto text-[11px] text-slate-500">
            <p>Built with ❤️ by JonasCode</p>
          </div>
        </aside>

        {/* Main area */}
        <div className="flex-1 flex flex-col">
          {/* Top bar (mobile) */}
          <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/90">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-cyan-500/20 flex items-center justify-center text-cyan-400 font-semibold text-base">
                J
              </div>
              <div>
                <p className="text-sm font-semibold tracking-tight">
                  JonasCode Studio
                </p>
                <p className="text-[11px] text-slate-500">
                  AI Proposal Workspace
                </p>
              </div>
            </div>
          </header>

          {/* Content */}
          <main className="flex-1 px-4 py-6 md:px-8 md:py-8 bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900">
            {/* Page header */}
            <div className="mb-6">
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
                AI Proposal & Brief Generator
              </h1>
              <p className="mt-2 text-sm text-slate-400 max-w-2xl">
                Paste a raw lead block and let JonasCode generate a full,
                client-ready Project Folder: overview, brief, proposal and
                mini-spec in one go.
              </p>
            </div>

            {/* Panels */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Left: lead input */}
              <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 md:p-5 flex flex-col shadow-[0_0_0_1px_rgba(15,23,42,0.9)]">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-100">
                      1. Raw lead input
                    </h2>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Paste the client info exactly as you receive it (email,
                      Notion, form, notes…).
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] text-slate-400">
                    Internal only
                  </span>
                </div>

                <textarea
                  className="mt-3 flex-1 w-full rounded-xl bg-slate-950/80 border border-slate-800 px-3 py-2 text-sm outline-none resize-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-500"
                  placeholder={`Lead Name: Claire Meyer
Email: claire@brightscale.studio
Source: Referral – Existing Client
Project Type: SaaS Web App + AI Automation
Budget: €4,000 – €7,000
Timeline: 4–6 weeks
Notes: I run a small web design & no-code studio and we lose a lot of time writing proposals, project briefs and mini-specs...`}
                  value={leadText}
                  onChange={(e) => setLeadText(e.target.value)}
                />

                <button
                  className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500 text-slate-950 text-sm font-semibold py-2.5 px-3 hover:bg-cyan-400 transition-colors disabled:opacity-60"
                  onClick={handleGenerate}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <span className="h-3 w-3 rounded-full border-2 border-slate-950 border-t-transparent animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>⚡ Generate Project Folder</>
                  )}
                </button>
              </section>

              {/* Right: output */}
              <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 md:p-5 flex flex-col shadow-[0_0_0_1px_rgba(15,23,42,0.9)]">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-100">
                      2. Generated project folder
                    </h2>
                    <p className="mt-1 text-[11px] text-slate-500">
                      The AI output appears here as a full JonasCode-style
                      Project Folder you can review, copy or export later.
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] text-slate-400">
                    Read-only
                  </span>
                </div>

                {/* Actions row */}
                <div className="mt-3 flex items-center justify-between text-[11px]">
                  <span className="text-emerald-400">{copyMessage}</span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleDownload}
                      disabled={!outputText.trim() || isLoading}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800 disabled:opacity-40 transition-colors"
                    >
                      ⬇️ Download .md
                    </button>

                    <button
                      onClick={handleCopy}
                      disabled={!outputText.trim() || isLoading}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800 disabled:opacity-40 transition-colors"
                    >
                      ⧉ Copy all
                    </button>
                  </div>
                </div>

                {/* Tabs */}
                <div className="mt-3 flex flex-wrap gap-1 text-[11px]">
                  {tabs.map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`px-2 py-1 rounded-lg border transition-colors ${
                        activeTab === tab.key
                          ? "bg-cyan-500 text-slate-950 border-cyan-500"
                          : "border-slate-700 text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {errorText && (
                  <p className="mt-2 text-xs text-red-400">{errorText}</p>
                )}

                <div className="mt-3 flex-1 rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-3 text-sm text-slate-200 whitespace-pre-wrap overflow-auto max-h-[70vh]">
                  {outputText ? (
                    activeText
                  ) : (
                    <>
                      Waiting for input… Paste a lead on the left and click{" "}
                      <span className="font-semibold text-cyan-400">
                        Generate
                      </span>{" "}
                      to create a complete Project Folder.
                    </>
                  )}
                </div>
              </section>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export default App;
