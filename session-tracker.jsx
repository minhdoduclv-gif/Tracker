import React, { useState, useEffect, useCallback } from "react";

// ---- helpers ----------------------------------------------------------
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const monthKey = (iso) => iso.slice(0, 7); // "YYYY-MM"
const todayISO = () => {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
};
const fmtMoney = (n, cur) => {
  const s = Math.round(n).toLocaleString("en-US");
  return cur === "VND" ? `${s}\u00A0₫` : cur === "USD" ? `$${s}` : `${s} ${cur}`;
};
const monthLabel = (key) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
};
const shiftMonth = (key, delta) => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const prettyDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleString("en-US", { weekday: "short", day: "numeric", month: "short" });
};

// ---- tally-mark renderer ---------------------------------------------
function Tally({ count }) {
  const groups = Math.floor(count / 5);
  const rem = count % 5;
  const Group = ({ bars, strike }) => (
    <svg width="34" height="28" viewBox="0 0 34 28" className="inline-block">
      {[0, 1, 2, 3].slice(0, bars).map((i) => (
        <line key={i} x1={4 + i * 6} y1="3" x2={4 + i * 6} y2="25" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      ))}
      {strike && <line x1="1" y1="24" x2="27" y2="4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />}
    </svg>
  );
  if (count === 0) return <span className="text-slate-300 text-sm italic">no sessions</span>;
  return (
    <span className="text-red-700 flex flex-wrap items-center gap-x-1 gap-y-1 leading-none">
      {Array.from({ length: groups }).map((_, i) => <Group key={i} bars={4} strike />)}
      {rem > 0 && <Group bars={rem} strike={false} />}
    </span>
  );
}

// ---- persistence ------------------------------------------------------
const STORE_KEY = "tutor-session-data";
async function loadData() {
  try {
    const r = await window.storage.get(STORE_KEY);
    if (r && r.value) return JSON.parse(r.value);
  } catch (_) {}
  return { students: [], sessions: [] };
}
async function saveData(data) {
  try { await window.storage.set(STORE_KEY, JSON.stringify(data)); } catch (_) {}
}

// ---- main -------------------------------------------------------------
export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [students, setStudents] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [month, setMonth] = useState(monthKey(todayISO()));

  // log panel state
  const [activeStudent, setActiveStudent] = useState(null);
  const [logDate, setLogDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [flash, setFlash] = useState(null);

  // student manager
  const [showStudents, setShowStudents] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRate, setNewRate] = useState("");
  const [newCur, setNewCur] = useState("VND");

  useEffect(() => {
    loadData().then((d) => {
      setStudents(d.students || []);
      setSessions(d.sessions || []);
      if ((d.students || []).length) setActiveStudent(d.students[0].id);
      setLoaded(true);
    });
  }, []);

  const persist = useCallback((st, se) => { saveData({ students: st, sessions: se }); }, []);

  const addStudent = () => {
    const name = newName.trim();
    const rate = parseFloat(String(newRate).replace(/[, ]/g, ""));
    if (!name || !rate || rate <= 0) return;
    const s = { id: uid(), name, rate, cur: newCur };
    const st = [...students, s];
    setStudents(st); persist(st, sessions);
    if (!activeStudent) setActiveStudent(s.id);
    setNewName(""); setNewRate("");
  };
  const updateRate = (id, rate) => {
    const st = students.map((s) => (s.id === id ? { ...s, rate } : s));
    setStudents(st); persist(st, sessions);
  };
  const removeStudent = (id) => {
    if (!window.confirm("Remove this student? Their logged sessions stay in the records.")) return;
    const st = students.filter((s) => s.id !== id);
    setStudents(st); persist(st, sessions);
    if (activeStudent === id) setActiveStudent(st[0]?.id || null);
  };

  const logSession = () => {
    const stu = students.find((s) => s.id === activeStudent);
    if (!stu) return;
    const se = [
      ...sessions,
      { id: uid(), studentId: stu.id, date: logDate, note: note.trim(), rate: stu.rate, cur: stu.cur },
    ];
    setSessions(se); persist(students, se);
    setNote("");
    setMonth(monthKey(logDate));
    setFlash(stu.name);
    setTimeout(() => setFlash(null), 1400);
  };
  const removeSession = (id) => {
    const se = sessions.filter((s) => s.id !== id);
    setSessions(se); persist(students, se);
  };

  if (!loaded)
    return <div className="min-h-screen bg-stone-100 flex items-center justify-center text-slate-400 font-mono text-sm">loading records…</div>;

  // ---- derived for selected month ----
  const monthSessions = sessions.filter((s) => monthKey(s.date) === month);
  const perStudent = students.map((stu) => {
    const list = monthSessions.filter((s) => s.studentId === stu.id).sort((a, b) => a.date.localeCompare(b.date));
    const fee = list.reduce((sum, s) => sum + s.rate, 0);
    return { stu, list, count: list.length, fee };
  });
  const anyLogged = monthSessions.length > 0;
  // grand totals grouped by currency (in case rates differ)
  const totalsByCur = {};
  monthSessions.forEach((s) => { totalsByCur[s.cur] = (totalsByCur[s.cur] || 0) + s.rate; });

  return (
    <div className="min-h-screen bg-stone-100 text-slate-900" style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <div className="max-w-xl mx-auto px-4 pb-24 pt-6">

        {/* masthead */}
        <div className="flex items-baseline justify-between border-b-2 border-slate-900 pb-2">
          <h1 className="text-2xl font-bold tracking-tight">Session Ledger</h1>
          <button
            onClick={() => setShowStudents((v) => !v)}
            className="text-xs font-mono uppercase tracking-wider text-slate-500 hover:text-slate-900"
          >
            {showStudents ? "close" : "students"}
          </button>
        </div>

        {/* students manager */}
        {showStudents && (
          <div className="mt-4 bg-white border border-slate-200 rounded-lg p-4 space-y-3">
            {students.map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <span className="flex-1 font-medium truncate">{s.name}</span>
                <input
                  type="text" inputMode="numeric" defaultValue={s.rate}
                  onBlur={(e) => {
                    const v = parseFloat(String(e.target.value).replace(/[, ]/g, ""));
                    if (v > 0) updateRate(s.id, v);
                  }}
                  className="w-28 text-right font-mono text-sm border border-slate-200 rounded px-2 py-1 focus:border-slate-900 outline-none"
                />
                <span className="text-xs font-mono text-slate-400 w-9">{s.cur}</span>
                <button onClick={() => removeStudent(s.id)} className="text-slate-300 hover:text-red-600 text-lg leading-none px-1">×</button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name"
                className="flex-1 min-w-[7rem] border border-slate-200 rounded px-2 py-1.5 text-sm focus:border-slate-900 outline-none" />
              <input value={newRate} onChange={(e) => setNewRate(e.target.value)} placeholder="Rate / session" inputMode="numeric"
                className="w-32 border border-slate-200 rounded px-2 py-1.5 text-sm font-mono focus:border-slate-900 outline-none" />
              <select value={newCur} onChange={(e) => setNewCur(e.target.value)}
                className="border border-slate-200 rounded px-2 py-1.5 text-sm bg-white outline-none">
                <option>VND</option><option>USD</option>
              </select>
              <button onClick={addStudent} className="bg-slate-900 text-white text-sm font-medium rounded px-4 py-1.5 hover:bg-slate-700">Add</button>
            </div>
          </div>
        )}

        {students.length === 0 ? (
          <div className="mt-10 text-center">
            <p className="text-slate-500">No students yet.</p>
            <button onClick={() => setShowStudents(true)}
              className="mt-3 bg-slate-900 text-white font-medium rounded-lg px-5 py-2.5 hover:bg-slate-700">
              Add your first student
            </button>
          </div>
        ) : (
          <>
            {/* LOG PANEL */}
            <div className="mt-5 bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">Log a finished session</div>
              <div className="flex flex-wrap gap-2 mb-3">
                {students.map((s) => (
                  <button key={s.id} onClick={() => setActiveStudent(s.id)}
                    className={
                      "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors " +
                      (activeStudent === s.id
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-400")
                    }>
                    {s.name}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)}
                  className="border border-slate-200 rounded px-2 py-2 text-sm font-mono focus:border-slate-900 outline-none" />
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="note (optional)"
                  className="flex-1 min-w-[8rem] border border-slate-200 rounded px-2 py-2 text-sm focus:border-slate-900 outline-none" />
              </div>
              <button onClick={logSession}
                className="mt-3 w-full bg-red-700 text-white font-semibold rounded-lg py-3 hover:bg-red-800 active:scale-[0.99] transition-transform">
                ✓ Mark session done
              </button>
              {flash && (
                <div className="mt-2 text-center text-sm font-medium text-emerald-700">Logged for {flash} ✓</div>
              )}
            </div>

            {/* MONTH NAV */}
            <div className="mt-6 flex items-center justify-between">
              <button onClick={() => setMonth(shiftMonth(month, -1))} className="w-9 h-9 rounded-full border border-slate-200 bg-white text-slate-500 hover:border-slate-400">‹</button>
              <div className="text-center">
                <div className="font-semibold">{monthLabel(month)}</div>
                <div className="font-mono text-xs text-slate-400">{monthSessions.length} session{monthSessions.length === 1 ? "" : "s"}</div>
              </div>
              <button onClick={() => setMonth(shiftMonth(month, 1))} className="w-9 h-9 rounded-full border border-slate-200 bg-white text-slate-500 hover:border-slate-400">›</button>
            </div>

            {/* PER-STUDENT SUMMARY */}
            <div className="mt-3 space-y-3">
              {perStudent.map(({ stu, count, fee, list }) => (
                <div key={stu.id} className="bg-white border border-slate-200 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{stu.name}</div>
                      <div className="mt-2 min-h-[28px]"><Tally count={count} /></div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-2xl font-bold tabular-nums">{count}</div>
                      <div className="font-mono text-sm text-slate-500 tabular-nums">{fmtMoney(fee, stu.cur)}</div>
                    </div>
                  </div>
                  {list.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
                      {list.map((s) => (
                        <div key={s.id} className="flex items-center gap-2 text-sm">
                          <span className="font-mono text-slate-400 w-24 shrink-0">{prettyDate(s.date)}</span>
                          <span className="flex-1 text-slate-500 truncate">{s.note || <span className="text-slate-300">—</span>}</span>
                          <span className="font-mono text-slate-400 tabular-nums">{fmtMoney(s.rate, s.cur)}</span>
                          <button onClick={() => removeSession(s.id)} className="text-slate-300 hover:text-red-600 leading-none px-1">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* GRAND TOTAL */}
            {anyLogged && (
              <div className="mt-6 bg-slate-900 text-white rounded-lg p-4 flex items-center justify-between">
                <div className="text-xs font-mono uppercase tracking-wider text-slate-400">
                  {monthLabel(month)} — total due
                </div>
                <div className="text-right font-mono font-bold text-xl tabular-nums space-y-0.5">
                  {Object.entries(totalsByCur).map(([cur, amt]) => (
                    <div key={cur}>{fmtMoney(amt, cur)}</div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <p className="mt-8 text-center text-xs text-slate-400 font-mono">
          saved on this device · rate is snapshotted per session
        </p>
      </div>
    </div>
  );
}
