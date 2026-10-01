import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { apiRequest } from "../utils/api";
import { switchWorkspace } from "../api/api";

// Companies that let people with my (verified) work email in
function JoinableCompanies() {
  const [list, setList] = useState([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    apiRequest("/companies/discover", "GET", null, { personal: true }).then(setList).catch(() => {});
  }, []);

  const join = async (c) => {
    setMsg("");
    try {
      const out = await apiRequest(`/companies/${c.id}/join`, "POST", {}, { personal: true });
      if (out.joined) return switchWorkspace(c.id);
      setList(list.map((x) => (x.id === c.id ? { ...x, requested: true } : x)));
    } catch (err) {
      setMsg(err.message);
    }
  };

  if (!list.length) return null;
  return (
    <div className="mb-6">
      <h2 className="font-display text-[17px] font-bold text-gray-900 mb-2">Join your team</h2>
      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
        {list.map((c) => (
          <div key={c.id} className="px-4 py-3 flex items-center gap-3">
            <span className="w-8 h-8 rounded btn-accent flex items-center justify-center text-xs font-semibold">{c.name[0].toUpperCase()}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
              <p className="text-xs text-gray-500">{c.domain_join === "auto" ? "Anyone with your email domain can join" : "An admin approves new people"}</p>
            </div>
            {c.requested ? (
              <span className="text-xs text-gray-400">Request sent</span>
            ) : (
              <button onClick={() => join(c)} className="px-3 py-1.5 btn-accent text-sm rounded-md">
                {c.domain_join === "auto" ? "Join" : "Ask to join"}
              </button>
            )}
          </div>
        ))}
      </div>
      {msg && <p className="text-sm text-red-600 mt-2">{msg}</p>}
    </div>
  );
}

// New company workspace: a name and the kind of work (sets project columns)
export default function CreateCompany() {
  const [name, setName] = useState("");
  const [workType, setWorkType] = useState("general");
  const [types, setTypes] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiRequest("/companies/work-types").then(setTypes).catch(() => {});
  }, []);

  const create = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const company = await apiRequest("/companies", "POST", { name, work_type: workType }, { personal: true });
      switchWorkspace(company.id);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const chosen = types.find((t) => t.key === workType);

  return (
    <div className="p-6 lg:p-8 max-w-xl">
      <JoinableCompanies />
      <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center mb-4">
        <Building2 size={18} className="text-gray-600" />
      </div>
      <h1 className="text-xl font-semibold text-gray-900">Create a company</h1>
      <p className="text-sm text-gray-500 mt-1 mb-6">
        A shared workspace for teams, projects and assigned work. Your personal dones stay private.
      </p>

      <form onSubmit={create} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Company or group name</label>
          <input
            autoFocus
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Inc, or 'Design freelancers'"
            className="w-full text-sm px-3 py-2 border border-gray-200 rounded-md outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 bg-white"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Kind of work</label>
          <div className="grid grid-cols-2 gap-2">
            {types.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setWorkType(t.key)}
                className={`text-left text-sm px-3 py-2 rounded-md border ${
                  workType === t.key ? "border-indigo-600 bg-gray-50 text-gray-900" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {chosen && (
            <p className="text-xs text-gray-400 mt-2">New projects start with: {chosen.statuses.join(" → ")}</p>
          )}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={saving} className="px-4 py-2 btn-accent text-sm font-medium rounded-md disabled:opacity-50">
          {saving ? "Creating…" : "Create company"}
        </button>
      </form>
    </div>
  );
}
