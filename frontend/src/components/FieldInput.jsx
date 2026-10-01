// One input for a custom field value (text, number, dropdown, date, person, checkbox)
const cls = "text-sm px-2.5 py-1.5 border border-gray-200 rounded-md outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 bg-white text-gray-900 w-full disabled:bg-gray-50";

export default function FieldInput({ field, value, onChange, people = [], disabled, id }) {
  const v = value ?? "";
  switch (field.kind) {
    case "checkbox":
      return <input id={id} type="checkbox" checked={!!value} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-label={field.name} className="w-4 h-4" />;
    case "select":
      return (
        <select id={id} className={cls} value={v} disabled={disabled} onChange={(e) => onChange(e.target.value || null)} aria-label={field.name}>
          <option value="">—</option>
          {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    case "person":
      return (
        <select id={id} className={cls} value={v} disabled={disabled} onChange={(e) => onChange(e.target.value || null)} aria-label={field.name}>
          <option value="">—</option>
          {people.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
        </select>
      );
    case "date":
      return <input id={id} type="date" className={cls} value={v} disabled={disabled} onChange={(e) => onChange(e.target.value || null)} aria-label={field.name} />;
    case "number":
      return <input id={id} type="number" step="any" className={cls} value={v} disabled={disabled} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} aria-label={field.name} />;
    default:
      return <input id={id} className={cls} value={v} disabled={disabled} maxLength={500} onChange={(e) => onChange(e.target.value)} aria-label={field.name} />;
  }
}
