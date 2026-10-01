import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import { apiRequest } from "../utils/api";
import { STATUSES, STATUS_BADGE, PRIORITIES } from "../utils/taskMeta";
import TaskMeta from "../components/TaskMeta";

const EMPTY_FILTERS = { status: "", priority: "", tag: "", from: "", to: "" };
const filterCls =
  "text-xs px-2 py-1.5 border border-gray-200 rounded-md outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 bg-white text-gray-700";

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function SearchPage() {
  const [query, setQuery]   = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [tags, setTags] = useState([]);
  const navigate = useNavigate();

  const debouncedQ = useDebounce(query, 300);
  const hasFilters = Object.values(filters).some(Boolean);
  const setFilter = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));

  useEffect(() => {
    apiRequest("/tags").then(setTags).catch(() => {});
  }, []);

  useEffect(() => {
    if (!debouncedQ.trim() && !hasFilters) { setResults([]); setSearched(false); return; }

    const run = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: debouncedQ.trim() });
        Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
        const data = await apiRequest(`/tasks/search?${params}`);
        setResults(data || []);
        setSearched(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [debouncedQ, filters, hasFilters]);

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900 mb-1">Search</h1>
        <p className="text-sm text-gray-500">Find any task across your entire history.</p>
      </div>

      {/* Search input */}
      <div className="relative mb-6">
        <Search
          size={16}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tasks…"
          className="w-full pl-10 pr-10 py-2.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-gray-400"
        />
        {query && (
          <button
            onClick={() => { setQuery(""); setResults([]); setSearched(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 -mt-3 mb-6">
        <select className={filterCls} value={filters.status} onChange={setFilter("status")}>
          <option value="">Any status</option>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className={filterCls} value={filters.priority} onChange={setFilter("priority")}>
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select className={filterCls} value={filters.tag} onChange={setFilter("tag")}>
          <option value="">Any tag</option>
          {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <label className="flex items-center gap-1 text-xs text-gray-500">
          From <input type="date" className={filterCls} value={filters.from} onChange={setFilter("from")} />
        </label>
        <label className="flex items-center gap-1 text-xs text-gray-500">
          to <input type="date" className={filterCls} value={filters.to} onChange={setFilter("to")} />
        </label>
        {hasFilters && (
          <button onClick={() => setFilters(EMPTY_FILTERS)} className="text-xs text-gray-500 hover:text-gray-900 underline">
            Clear filters
          </button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <div className="w-4 h-4 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
          Searching…
        </div>
      )}

      {/* Results */}
      {!loading && searched && (
        <>
          <p className="text-xs text-gray-400 mb-3">
            {results.length} result{results.length !== 1 ? "s" : ""}
            {debouncedQ.trim() && <> for &ldquo;{debouncedQ}&rdquo;</>}
          </p>

          {results.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl px-5 py-12 text-center">
              <Search size={24} className="text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No tasks found.</p>
              <p className="text-xs text-gray-400 mt-1">Try a different search term.</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-50">
              {results.map((task) => (
                <div
                  key={task.id}
                  onClick={() => navigate(`/tasks/${task.id}`)}
                  className="px-5 py-3.5 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm text-gray-900 ${task.status === "Done" ? "line-through text-gray-400" : ""}`}>
                        {task.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="text-xs text-gray-400">{task.date_logged}</span>
                        {task.tags?.map((tag) => (
                          <span
                            key={tag.id}
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full text-white"
                            style={{ backgroundColor: tag.color }}
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                      <TaskMeta task={task} />
                    </div>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                        STATUS_BADGE[task.status] || "bg-gray-50 text-gray-700"
                      }`}
                    >
                      {task.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Empty state before search */}
      {!loading && !searched && (
        <div className="text-center py-16 text-gray-400">
          <Search size={32} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm">Type to search titles and notes, or pick a filter</p>
        </div>
      )}
    </div>
  );
}
