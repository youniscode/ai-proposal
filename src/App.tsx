// src/App.tsx
import { useState, useEffect } from "react";
import "./index.css";
import ReactMarkdown, { type Components } from "react-markdown";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

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

const markdownComponents: Components = {
  h1: (props) => (
    <h1
      {...props}
      className={
        "text-lg md:text-xl font-semibold text-slate-50 mt-2 mb-2 " +
        (props.className ?? "")
      }
    />
  ),

  h2: (props) => (
    <h2
      {...props}
      className={
        "text-base md:text-lg font-semibold text-slate-50 mt-6 mb-2 border-b border-[#1E2639] pb-1 " +
        (props.className ?? "")
      }
    />
  ),

  h3: (props) => (
    <h3
      {...props}
      className={
        "text-sm md:text-base font-semibold text-slate-100 mt-4 mb-1 " +
        (props.className ?? "")
      }
    />
  ),

  p: (props) => (
    <p
      {...props}
      className={
        "mt-1 mb-1 text-[13px] md:text-[14px] text-slate-100 leading-relaxed " +
        (props.className ?? "")
      }
    />
  ),

  ul: (props) => (
    <ul
      {...props}
      className={
        "list-disc list-inside mt-1 mb-2 space-y-0.5 text-[13px] md:text-[14px] text-slate-100 " +
        (props.className ?? "")
      }
    />
  ),

  ol: (props) => (
    <ol
      {...props}
      className={
        "list-decimal list-inside mt-1 mb-2 space-y-0.5 text-[13px] md:text-[14px] text-slate-100 " +
        (props.className ?? "")
      }
    />
  ),

  strong: (props) => (
    <strong
      {...props}
      className={"font-semibold text-slate-50 " + (props.className ?? "")}
    />
  ),

  hr: (props) => (
    <hr
      {...props}
      className={
        "my-4 border-t border-dashed border-[#1E2639] " +
        (props.className ?? "")
      }
    />
  ),
};

// Small helper to keep TS happy and keep styling clean
function StyledMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown components={markdownComponents}>{children}</ReactMarkdown>
  );
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
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);

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

      const base =
        API_BASE && API_BASE.trim().length > 0
          ? API_BASE.replace(/\/$/, "")
          : "";

      const res = await fetch(`${base}/api/generate-project-folder`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ leadText, model, tone }),
      });

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
        <aside
          className={`hidden md:flex flex-col border-r border-[#1E2639]/80 bg-[#050713]/95 px-3 py-4 gap-4 transition-all duration-200 ${
            isSidebarExpanded ? "w-72" : "w-20"
          }`}
        >
          {/* Top brand + collapse button */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-[#3CF2E5] to-[#6C2BF3] flex items-center justify-center shadow-[0_0_18px_rgba(60,242,229,0.6)]">
                <span className="text-sm font-semibold text-slate-950">J</span>
              </div>
              {isSidebarExpanded && (
                <div>
                  <p className="text-sm font-semibold tracking-tight text-slate-50">
                    JonasCode Studio
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Proposal Workspace
                  </p>
                </div>
              )}
            </div>

            {/* Collapse toggle */}
            <button
              type="button"
              onClick={() => setIsSidebarExpanded((prev) => !prev)}
              className="hidden md:inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#1E2639] bg-[#0B0F19]/80 text-[11px] text-slate-400 hover:border-[#3CF2E5] hover:text-[#3CF2E5] transition-all"
            >
              {isSidebarExpanded ? "‹" : "›"}
            </button>
          </div>

          <nav className="flex-1 text-sm mt-2">
            {/* Workspace section */}
            {isSidebarExpanded ? (
              <>
                <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-slate-500">
                  Workspace
                </p>
                <ul className="space-y-1 mb-4">
                  <li>
                    <button
                      className="w-full flex items-center gap-2 text-left px-3 py-2.5 rounded-xl bg-gradient-to-r from-[#151C2E] to-[#101624] text-slate-100 text-sm font-medium border border-[#232C45] shadow-[0_4px_18px_rgba(0,0,0,0.6)] hover:shadow-[0_0_20px_rgba(60,242,229,0.32)] transition-all"
                      onClick={handleNewProject}
                    >
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-[#101624] text-[11px] text-[#3CF2E5]">
                        ⚡
                      </span>
                      <span>New project</span>
                    </button>
                  </li>
                </ul>

                {/* History list */}
                <div className="mb-6">
                  <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-slate-500">
                    Recent runs
                  </p>
                  {history.length === 0 ? (
                    <p className="text-[11px] text-slate-500">
                      Nothing yet. Generate your first project to see it here.
                    </p>
                  ) : (
                    <ul className="space-y-1 max-h-64 overflow-auto pr-1">
                      {history.map((item) => (
                        <li key={item.id}>
                          <button
                            onClick={() => handleSelectHistory(item)}
                            className={`w-full text-left px-3 py-2.5 rounded-xl text-[11px] border transition-all ${
                              activeHistoryId === item.id
                                ? "bg-[#12192A] border-[#3CF2E5] text-slate-50 shadow-[0_0_16px_rgba(60,242,229,0.45)]"
                                : "bg-[#090D18]/80 border-[#1E2639] text-slate-300 hover:bg-[#131A2A] hover:border-[#3CF2E5]/60 hover:shadow-[0_0_14px_rgba(60,242,229,0.3)]"
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

                {/* Settings block */}
                <p className="mt-2 mb-2 text-[11px] uppercase tracking-[0.14em] text-slate-500">
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
                      className="w-full rounded-lg bg-[#0B0F19]/90 border border-[#1E2639] px-2 py-1.5 text-[11px] text-slate-100 outline-none focus:border-[#3CF2E5] focus:ring-1 focus:ring-[#3CF2E5]/50"
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
                      className="w-full rounded-lg bg-[#0B0F19]/90 border border-[#1E2639] px-2 py-1.5 text-[11px] text-slate-100 outline-none focus:border-[#3CF2E5] focus:ring-1 focus:ring-[#3CF2E5]/50"
                    >
                      <option value="premium">Premium agency (default)</option>
                      <option value="professional">
                        Professional & neutral
                      </option>
                      <option value="friendly">Friendly & approachable</option>
                      <option value="concise">Ultra concise</option>
                    </select>
                  </div>
                </div>
              </>
            ) : (
              // Collapsed: icon-only rail
              <div className="flex flex-col items-center gap-4 mt-4 text-[11px] text-slate-400">
                <button
                  type="button"
                  onClick={handleNewProject}
                  className="h-9 w-9 rounded-2xl bg-gradient-to-br from-[#3CF2E5] to-[#6C2BF3] flex items-center justify-center shadow-[0_0_14px_rgba(60,242,229,0.6)] hover:brightness-110 transition-all"
                >
                  ⚡
                </button>

                <div className="h-px w-8 bg-[#1E2639]/80 my-1" />

                <div className="flex flex-col items-center gap-2">
                  <span className="h-7 w-7 rounded-xl bg-[#090D18] border border-[#1E2639] flex items-center justify-center text-[11px]">
                    🕒
                  </span>
                  <span className="h-7 w-7 rounded-xl bg-[#090D18] border border-[#1E2639] flex items-center justify-center text-[11px]">
                    ⚙️
                  </span>
                </div>
              </div>
            )}
          </nav>

          <div className="mt-auto text-[10px] text-slate-500 border-t border-[#1E2639] pt-3">
            {isSidebarExpanded ? (
              <p>Built with ❤️ by JonasCode</p>
            ) : (
              <p className="text-center text-[9px]">JC</p>
            )}
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
          <main className="flex-1 px-4 py-6 md:px-8 md:py-8 bg-[#050713] bg-[radial-gradient(circle_at_top,_rgba(60,242,229,0.12),_transparent_60%),radial-gradient(circle_at_bottom,_rgba(160,123,255,0.14),_transparent_55%)]">
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
              <section className="rounded-2xl border border-[#1E2639] bg-[#0B0F19]/90 p-4 md:p-5 flex flex-col shadow-[0_18px_45px_rgba(0,0,0,0.75)] hover:shadow-[0_0_38px_rgba(60,242,229,0.22)] transition-shadow">
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
                  className="mt-3 flex-1 w-full rounded-xl bg-[#050713]/90 border border-[#1E2639] px-3 py-2 text-sm outline-none resize-none focus:border-[#3CF2E5] focus:ring-1 focus:ring-[#3CF2E5]/60 placeholder:text-slate-600 text-slate-100"
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
              <section className="rounded-2xl border border-[#1E2639] bg-[#0B0F19]/90 p-4 md:p-5 flex flex-col shadow-[0_18px_45px_rgba(0,0,0,0.75)] hover:shadow-[0_0_38px_rgba(60,242,229,0.22)] transition-shadow">
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
                  <span className="text-emerald-400 min-h-[1em]">
                    {copyMessage}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleDownload}
                      disabled={!outputText.trim() || isLoading}
                      className="inline-flex items-center gap-1 rounded-full bg-[#050713]/90 border border-[#1E2639] px-3 py-1.5 text-[11px] text-slate-200 hover:border-[#3CF2E5]/80 hover:text-[#E5FBFF] hover:bg-[#0B0F19] disabled:opacity-40 disabled:hover:border-[#1E2639] transition-all"
                    >
                      <span className="text-xs">⬇️</span>
                      <span>.md file</span>
                    </button>

                    <button
                      onClick={handleCopy}
                      disabled={!outputText.trim() || isLoading}
                      className="inline-flex items-center gap-1 rounded-full bg-[#050713]/90 border border-[#1E2639] px-3 py-1.5 text-[11px] text-slate-200 hover:border-[#3CF2E5]/80 hover:text-[#E5FBFF] hover:bg-[#0B0F19] disabled:opacity-40 disabled:hover:border-[#1E2639] transition-all"
                    >
                      <span className="text-xs">⧉</span>
                      <span>Copy all</span>
                    </button>
                  </div>
                </div>

                {/* Tabs */}
                <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-[#050713]/90 border border-[#1E2639] p-1 text-[11px] max-w-full overflow-x-auto">
                  {tabs.map((tab) => {
                    const isActive = activeTab === tab.key;

                    return (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={[
                          "px-3 py-1.5 rounded-full transition-all whitespace-nowrap flex items-center gap-1",
                          isActive
                            ? "bg-gradient-to-r from-[#3CF2E5] via-[#73F4FE] to-[#4BE1FF] text-slate-950 shadow-[0_0_18px_rgba(60,242,229,0.7)]"
                            : "text-slate-300 hover:text-slate-50 bg-transparent",
                        ].join(" ")}
                      >
                        {tab.key === "all" && (
                          <span className="text-[10px]">★</span>
                        )}
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>

                {errorText && (
                  <p className="mt-2 text-xs text-red-400">{errorText}</p>
                )}

                <div className="mt-3 flex-1 rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-3 text-sm text-slate-200 whitespace-pre-wrap overflow-auto max-h-[70vh]">
                  {outputText ? (
                    <div className="prose prose-invert max-w-none prose-sm md:prose-base">
                      <StyledMarkdown>{activeText}</StyledMarkdown>
                    </div>
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
