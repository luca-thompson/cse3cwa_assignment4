import { useEffect, useState } from "react";
import { fetchJson } from "./api.js";
import ModelDeclaration from "./pages/ModelDeclaration.jsx";
import BusinessPerformance from "./pages/BusinessPerformance.jsx";
import InventoryOperations from "./pages/InventoryOperations.jsx";
import Findings from "./pages/Findings.jsx";
import Assurance from "./pages/Assurance.jsx";
import DailyReport from "./pages/DailyReport.jsx";

const PAGES = [
  { id: "declaration", label: "Model Declaration", Component: ModelDeclaration },
  { id: "business", label: "Business Performance", Component: BusinessPerformance },
  { id: "operations", label: "Inventory & Operations", Component: InventoryOperations },
  { id: "findings", label: "Findings & Recommendations", Component: Findings },
  { id: "assurance", label: "Commercial Assurance", Component: Assurance },
  { id: "daily", label: "Daily Report", Component: DailyReport },
];

export default function App() {
  const [runs, setRuns] = useState([]);
  const [runId, setRunId] = useState(null);
  const [page, setPage] = useState("declaration");
  const [day, setDay] = useState(1);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);

  // Loads the run list. Selects `selectId` if given, otherwise the Submitted Run.
  async function loadRuns(selectId) {
    try {
      const list = await fetchJson("/api/runs");
      setRuns(list);
      const submitted = list.find((r) => r.is_submitted === 1);
      setRunId(selectId || (submitted || list[0] || {}).run_id || null);
      setError(null);
    } catch (e) {
      setError(`Could not load runs: ${e.message}. Is the backend running?`);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadRuns();
  }, []);

  async function startNewRun() {
    setStarting(true);
    try {
      const { run_id } = await fetchJson("/api/runs", { method: "POST" });
      await loadRuns(run_id);
    } catch (e) {
      setError(`Could not start a new run: ${e.message}`);
    }
    setStarting(false);
  }

  function goToDay(d) {
    setDay(d);
    setPage("daily");
  }
  const run = runs.find((r) => r.run_id === runId);
  const Page = PAGES.find((p) => p.id === page).Component;

  return (
    <div className="app">
      <header>
        <h1>Swanston Street Autonomous Supermarket</h1>
        <div className="run-bar">
          <label>
            Run:{" "}
            <select value={runId || ""} onChange={(e) => setRunId(e.target.value)} disabled={runs.length === 0}>
              {runs.map((r) => (
                <option key={r.run_id} value={r.run_id}>
                  {r.run_id}
                  {r.is_submitted === 1 ? " - Submitted Run" : ""} ({r.status})
                </option>
              ))}
            </select>
          </label>
          <button onClick={startNewRun} disabled={starting}>
            {starting ? "Running 60 days..." : "Start new run"}
          </button>
        </div>
      </header>

      {run && (
        <div className={run.is_submitted === 1 ? "banner submitted" : "banner other"}>
          {run.is_submitted === 1
            ? `Submitted Run: ${run.run_id}. This is the run assessed for the assignment.`
            : `Not the Submitted Run. ${run.run_id} is an additional run (${run.status}).`}
        </div>
      )}

      <nav>
        {PAGES.map((p) => (
          <button key={p.id} className={p.id === page ? "tab active" : "tab"} onClick={() => setPage(p.id)}>
            {p.label}
          </button>
        ))}
      </nav>

      <main>
        {loading && <p className="loading">Loading...</p>}
        {error && <p className="error">{error}</p>}
        {!loading && !error && !runId && <p>No runs found. Run <code>npm run seed</code> to create the Submitted Run.</p>}
        {runId && <Page key={runId} runId={runId} day={day} setDay={setDay} goToDay={goToDay} />}
      </main>
    </div>
  );
}
