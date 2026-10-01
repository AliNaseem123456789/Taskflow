import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { apiRequest } from "../utils/api";
import { switchWorkspace } from "../api/api";

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
      <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center mb-4">
        <Building2 size={18} className="text-gray-600" />
      </div>
      <h1 className="text-xl font-semibold text-gray-900">Create a company</h1>
      <p className="text-sm text-gray-500 mt-1 mb-6">
        A shared workspace for teams, projects and assigned work. Your personal dones stay private.
      </p>

      <form onSubmit={create} className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Company or group name</label>
          <input
            autoFocus
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Inc, or 'Design freelancers'"
            className="w-full text-sm px-3 py-2 border border-gray-200 rounded-md outline-none focus:border-gray-400 bg-white"
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
                  workType === t.key ? "border-gray-900 bg-gray-50 text-gray-900" : "border-gray-200 text-gray-600 hover:bg-gray-50"
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
        <button disabled={saving} className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 disabled:opacity-50">
          {saving ? "Creating…" : "Create company"}
        </button>
      </form>
    </div>
  );
}
