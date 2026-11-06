import type { Profile } from "@/lib/auth";
import type { Shift } from "@/lib/shifts";

/** GET form that keeps other query params as hidden inputs. Only owners see it. */
export function ShiftPicker({ me, shifts, current, keep = {} }: {
  me: Profile; shifts: Shift[]; current: string | null; keep?: Record<string, string | undefined>;
}) {
  if (me.role !== "owner") return null;
  return (
    <form className="flex items-center gap-2">
      {Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <select name="shift" defaultValue={current ?? ""} className="field-input w-auto" aria-label="Shift">
        <option value="">All shifts</option>
        {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <button className="btn-secondary">Apply</button>
    </form>
  );
}
