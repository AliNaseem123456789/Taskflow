import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronsUpDown, Check, Plus, User, Building2, Settings } from "lucide-react";
import { switchWorkspace, getWorkspace } from "../api/api";
import { useWorkspace, ROLE_LABELS } from "../utils/workspace";

// Personal first, then each company. Switching reloads onto that workspace.
export default function WorkspaceSwitcher({ onNavigate }) {
  const navigate = useNavigate();
  const { companies, current } = useWorkspace();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const chosen = getWorkspace();

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const go = (path) => {
    setOpen(false);
    navigate(path);
    onNavigate?.();
  };

  const Item = ({ active, icon: Icon, title, subtitle, onClick }) => (
    <button onClick={onClick} className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50">
      <span className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center shrink-0">
        <Icon size={13} className="text-gray-500" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] text-gray-900 truncate">{title}</span>
        {subtitle && <span className="block text-[11px] text-gray-400">{subtitle}</span>}
      </span>
      {active && <Check size={14} className="text-gray-900 shrink-0" />}
    </button>
  );

  return (
    <div ref={ref} className="relative px-3 pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md border border-gray-200 hover:bg-gray-50 text-left"
        title="Switch workspace"
      >
        <span className="w-6 h-6 rounded bg-gray-900 text-white flex items-center justify-center text-[11px] font-semibold shrink-0">
          {current ? current.name[0].toUpperCase() : <User size={12} />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] font-medium text-gray-900 truncate">{current ? current.name : "Personal"}</span>
          <span className="block text-[11px] text-gray-400">{current ? ROLE_LABELS[current.role] : "Only you"}</span>
        </span>
        <ChevronsUpDown size={14} className="text-gray-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute left-3 right-3 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 py-1 max-h-96 overflow-y-auto">
          <Item active={!chosen} icon={User} title="Personal" subtitle="Your private dones" onClick={() => switchWorkspace("")} />
          {companies.length > 0 && <div className="border-t border-gray-100 my-1" />}
          {companies.map((c) => (
            <Item key={c.id} active={chosen === c.id} icon={Building2} title={c.name} subtitle={ROLE_LABELS[c.role]}
              onClick={() => switchWorkspace(c.id)} />
          ))}
          <div className="border-t border-gray-100 my-1" />
          {current && <Item icon={Settings} title="Company settings" onClick={() => go("/company")} />}
          <Item icon={Plus} title="Create a company" onClick={() => go("/companies/new")} />
        </div>
      )}
    </div>
  );
}
