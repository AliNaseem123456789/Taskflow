import { useCallback, useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { apiRequest } from "../utils/api";
import { useMembersOf } from "../utils/fields";
import FieldInput from "./FieldInput";

// The project's custom fields on one task. Typed fields save as you change them,
// text and numbers when you leave the box.
export default function TaskFields({ task, opts }) {
  const [data, setData] = useState(null);
  const [values, setValues] = useState({});
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const people = useMembersOf(task.company_id);

  const load = useCallback(
    () => apiRequest(`/tasks/${task.id}/fields`, "GET", null, opts).then((d) => { setData(d); setValues(d.values); }).catch(() => setData(null)),
    [task.id, opts.company] // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => { load(); }, [load]);

  const save = async (fieldId, value) => {
    setError("");
    try {
      const r = await apiRequest(`/tasks/${task.id}/fields`, "PUT", { values: { [fieldId]: value } }, opts);
      setValues(r.values);
      setSaved(fieldId);
      setTimeout(() => setSaved(""), 1200);
    } catch (err) {
      setError(err.message);
      setValues(data.values);
    }
  };

  if (!data || data.fields.length === 0) return null;
  return (
    <section className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <SlidersHorizontal size={14} className="text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-900 flex-1">Fields</h2>
      </div>
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
        {data.fields.map((f) => {
          const lazy = f.kind === "text" || f.kind === "number";
          return (
            <div key={f.id} className={f.kind === "checkbox" ? "flex items-center gap-2" : ""}
              onBlur={lazy ? () => (values[f.id] ?? null) !== (data.values[f.id] ?? null) && save(f.id, values[f.id] ?? null) : undefined}>
              <label htmlFor={`f-${f.id}`} className={`text-xs text-gray-500 ${f.kind === "checkbox" ? "order-2" : "block mb-1"}`}>
                {f.name}{saved === f.id && <span className="text-emerald-600 ml-1.5">saved</span>}
              </label>
              <FieldInput id={`f-${f.id}`} field={f} value={values[f.id]} people={people.list} disabled={!data.can_edit}
                onChange={(v) => {
                  setValues({ ...values, [f.id]: v });
                  if (!lazy) save(f.id, v);
                }} />
            </div>
          );
        })}
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </section>
  );
}
