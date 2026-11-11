import { useCallback, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import {
  Activity, ArrowDown, ArrowUpRight, Bell, BriefcaseBusiness, CalendarDays, Check,
  CheckCheck, ChevronDown, CircleHelp, Clock3, LayoutDashboard, ListTodo, LogOut,
  Plus, Search, Sparkles, Trash2, Users, X
} from "lucide-react";

const API = "/api";
const statusNames = { pending: "To do", "in-progress": "In progress", completed: "Completed" };
const priorityClasses = {
  high: "bg-rose-50 text-rose-600",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-emerald-50 text-emerald-700"
};
const statusClasses = {
  pending: "bg-slate-100 text-slate-600",
  "in-progress": "bg-violet-50 text-violet-700",
  completed: "bg-emerald-50 text-emerald-700"
};

async function request(path, token, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Request failed. Please try again.");
  return data;
}

function App() {
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem("taskflow-session") || "null"); }
    catch { return null; }
  });
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [busy, setBusy] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted"
  );

  const signOut = useCallback(() => {
    localStorage.removeItem("taskflow-session");
    setSession(null);
    setTasks([]);
  }, []);

  const loadWorkspace = useCallback(async () => {
    if (!session?.token) return;
    try {
      const { tasks: taskList } = await request("/tasks", session.token);
      setTasks(taskList);
      if (session.user.role === "admin") {
        const { employees: people } = await request("/employees", session.token);
        setEmployees(people);
      }
    } catch (loadError) {
      if (loadError.message.toLowerCase().includes("session") || loadError.message.toLowerCase().includes("sign in")) {
        signOut();
      } else {
        setError(loadError.message);
      }
    }
  }, [session, signOut]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    if (!session?.token) return undefined;
    const socket = io({ auth: { token: session.token } });
    socket.on("task:assigned", ({ task, message }) => {
      setTasks((current) => [task, ...current.filter((item) => item._id !== task._id)]);
      setToast(message);
      if ("Notification" in window && Notification.permission === "granted") {
        const notification = new Notification("New task assigned", {
          body: task.title,
          icon: "/favicon.svg",
          tag: task._id
        });
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      }
    });
    socket.on("task:deleted", ({ taskId, message }) => {
      setTasks((current) => current.filter((task) => task._id !== taskId));
      setToast(message);
    });
    socket.on("connect_error", (socketError) => {
      if (socketError.message === "Authentication required" || socketError.message === "User not found") signOut();
    });
    return () => socket.disconnect();
  }, [session?.token, signOut]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 3800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const visibleTasks = useMemo(() => tasks.filter((task) => {
    const matchesStatus = filter === "all" || task.status === filter;
    const matchesSearch = `${task.title} ${task.description} ${task.assignedTo?.name || ""}`
      .toLowerCase().includes(query.toLowerCase());
    return matchesStatus && matchesSearch;
  }), [tasks, filter, query]);
  const counts = useMemo(() => ({
    total: tasks.length,
    pending: tasks.filter((task) => task.status === "pending").length,
    progress: tasks.filter((task) => task.status === "in-progress").length,
    completed: tasks.filter((task) => task.status === "completed").length
  }), [tasks]);

  async function updateStatus(taskId, status) {
    setError("");
    try {
      const { task } = await request(`/tasks/${taskId}/status`, session.token, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      setTasks((current) => current.map((item) => item._id === task._id ? task : item));
      setToast("Task status updated");
    } catch (updateError) {
      setError(updateError.message);
    }
  }

  async function createTask(payload) {
    setBusy(true);
    setError("");
    try {
      const { task } = await request("/tasks", session.token, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setTasks((current) => [task, ...current]);
      setModal(false);
      setToast(`Task assigned to ${task.assignedTo.name}`);
    } catch (createError) {
      setError(createError.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteTask(task) {
    if (!window.confirm(`Delete "${task.title}"? This will remove it from the employee's task board too.`)) return;

    setDeletingTaskId(task._id);
    setError("");
    try {
      await request(`/tasks/${task._id}`, session.token, { method: "DELETE" });
      setTasks((current) => current.filter((item) => item._id !== task._id));
      setToast("Task deleted");
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setDeletingTaskId("");
    }
  }

  async function enableNotifications() {
    if (!("Notification" in window)) {
      setError("This browser does not support desktop notifications.");
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationsEnabled(permission === "granted");
    if (permission === "granted") setToast("Notifications are enabled");
    else if (permission === "denied") setError("Notifications are blocked. Allow them in your browser settings.");
  }

  if (!session) {
    return <Login onLogin={(nextSession) => {
      localStorage.setItem("taskflow-session", JSON.stringify(nextSession));
      setSession(nextSession);
      setError("");
    }} />;
  }

  const isAdmin = session.user.role === "admin";
  const firstName = session.user.name.split(" ")[0];
  return (
    <div className="min-h-screen bg-[#f6f7fb] text-[#242638]">
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-[248px] flex-col border-r border-[#ececf2] bg-white px-5 py-7 lg:flex">
        <Brand />
        <div className="mt-12 px-3 text-[10px] font-bold uppercase tracking-[.17em] text-slate-400">Workspace</div>
        <nav className="mt-3 space-y-1">
          <div className="flex items-center gap-3 rounded-xl bg-violet-50 px-3.5 py-3 text-sm font-semibold text-violet-700">
            <LayoutDashboard size={18} strokeWidth={2.2} /> Overview
          </div>
          <div className="flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium text-slate-500">
            <ListTodo size={18} /> {isAdmin ? "All tasks" : "My tasks"}
            <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{counts.total}</span>
          </div>
          {isAdmin && <div className="flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium text-slate-500">
            <Users size={18} /> Team <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{employees.length}</span>
          </div>}
        </nav>
        <div className="mt-auto rounded-2xl bg-[#f6f4ff] p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-violet-600 shadow-sm"><Sparkles size={17} /></div>
          <p className="mt-3 text-sm font-semibold">A little more focus.</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">Your team's tasks, all in one calm place.</p>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white"><div className="h-full w-2/3 rounded-full bg-violet-500" /></div>
        </div>
        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <Avatar name={session.user.name} />
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{session.user.name}</div><div className="text-xs capitalize text-slate-400">{session.user.role}</div></div>
            <button title="Sign out" onClick={signOut} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><LogOut size={17} /></button>
          </div>
        </div>
      </aside>

      <main className="min-h-screen lg:ml-[248px]">
        <header className="sticky top-0 z-[5] flex h-[76px] items-center justify-between border-b border-[#ececf2] bg-white/90 px-5 backdrop-blur md:px-9">
          <div className="flex items-center gap-3">
            <div className="lg:hidden"><Brand compact /></div>
            <div className="hidden text-sm text-slate-400 md:block">Workspace <span className="mx-2 text-slate-300">/</span><span className="font-medium text-slate-600">Overview</span></div>
            <div className="md:hidden text-sm font-semibold">Overview</div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            {!isAdmin && <button onClick={enableNotifications} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition sm:px-3.5 ${notificationsEnabled ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
              <Bell size={15} /> <span className="hidden sm:inline">{notificationsEnabled ? "Notifications on" : "Enable alerts"}</span>
            </button>}
            {isAdmin && <button onClick={() => setModal(true)} className="flex items-center gap-2 rounded-xl bg-violet-600 px-3.5 py-2.5 text-xs font-semibold text-white shadow-sm shadow-violet-200 transition hover:bg-violet-700 sm:px-4 sm:text-sm"><Plus size={16} /> <span className="hidden sm:inline">Assign task</span><span className="sm:hidden">Assign</span></button>}
            <button title="Sign out" onClick={signOut} className="rounded-full lg:hidden"><Avatar name={session.user.name} /></button>
          </div>
        </header>

        <div className="mx-auto max-w-[1440px] px-5 pb-12 pt-8 md:px-9 md:pt-10">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.13em] text-violet-600"><span className="h-1.5 w-1.5 rounded-full bg-violet-500" /> {new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date())}</div>
              <h1 className="mt-3 text-[27px] font-bold tracking-[-.04em] text-[#25263a] sm:text-[32px]">Good morning, {firstName} <span aria-hidden="true">✦</span></h1>
              <p className="mt-1.5 text-sm text-slate-500">{isAdmin ? "Here's what's happening across your team today." : "Here's your focus for today. You've got this."}</p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-500 shadow-sm"><CalendarDays size={15} className="text-violet-500" /> {new Date().toLocaleDateString("en", { month: "long", year: "numeric" })}<ChevronDown size={14} /></div>
          </div>

          {error && <div role="alert" className="mt-6 flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X size={16} /></button></div>}

          <section className="mt-8 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard label={isAdmin ? "Total tasks" : "My tasks"} value={counts.total} icon={<BriefcaseBusiness size={18} />} tint="violet" caption="In your workspace" />
            <StatCard label="To do" value={counts.pending} icon={<Clock3 size={18} />} tint="blue" caption="Ready when you are" />
            <StatCard label="In progress" value={counts.progress} icon={<Activity size={18} />} tint="amber" caption="Currently underway" />
            <StatCard label="Completed" value={counts.completed} icon={<CheckCheck size={18} />} tint="green" caption={counts.total ? `${Math.round(counts.completed / counts.total * 100)}% of all tasks` : "A fresh start"} />
          </section>

          <section className="mt-8 overflow-hidden rounded-2xl border border-[#ececf2] bg-white soft-shadow">
            <div className="flex flex-col justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center md:px-6">
              <div><h2 className="text-base font-bold tracking-tight">Task board</h2><p className="mt-1 text-xs text-slate-400">{isAdmin ? "Keep an eye on everything the team is working on." : "A clear view of everything on your plate."}</p></div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks..." className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 sm:w-[190px]" /></div>
                <div className="flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1">
                  {[["all", "All"], ["pending", "To do"], ["in-progress", "Active"], ["completed", "Done"]].map(([value, label]) => <button key={value} onClick={() => setFilter(value)} className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition ${filter === value ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{label}</button>)}
                </div>
              </div>
            </div>
            {visibleTasks.length ? <div className="divide-y divide-slate-100">
              {visibleTasks.map((task) => <TaskRow key={task._id} task={task} isAdmin={isAdmin} onStatus={updateStatus} onDelete={deleteTask} deleting={deletingTaskId === task._id} />)}
            </div> : <div className="px-6 py-16 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-500"><ListTodo size={21} /></div>
              <h3 className="mt-4 text-sm font-semibold">{query || filter !== "all" ? "No tasks match your filters" : "Nothing on the board just yet"}</h3>
              <p className="mt-1 text-xs text-slate-400">{isAdmin ? "Assign a task to get your team moving." : "Your assigned tasks will show up here."}</p>
              {isAdmin && <button onClick={() => setModal(true)} className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-600 hover:text-violet-700"><Plus size={14} /> Assign a task</button>}
            </div>}
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3.5 text-[11px] text-slate-400 md:px-6"><span>Showing {visibleTasks.length} of {tasks.length} tasks</span><button onClick={loadWorkspace} className="flex items-center gap-1.5 font-semibold text-slate-500 hover:text-violet-600"><Activity size={13} /> Refresh</button></div>
          </section>

          <div className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-slate-400"><CircleHelp size={13} /> Your work is automatically kept in sync.</div>
        </div>
      </main>
      {modal && <AssignTaskModal employees={employees} busy={busy} onClose={() => setModal(false)} onSubmit={createTask} />}
      {toast && <div role="status" className="fixed bottom-5 right-5 z-30 flex max-w-[calc(100vw-40px)] items-center gap-2.5 rounded-xl bg-[#25263a] px-4 py-3 text-sm font-medium text-white shadow-xl"><span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-400/20 text-emerald-300"><Check size={14} /></span>{toast}</div>}
    </div>
  );
}

function Brand({ compact = false }) {
  return <div className="flex items-center gap-2.5">
    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-white shadow-md shadow-violet-200"><CheckCheck size={19} strokeWidth={2.4} /></div>
    {!compact && <div className="text-[17px] font-bold tracking-[-.04em]">taskflow<span className="text-violet-600">.</span></div>}
  </div>;
}

function Avatar({ name, small = false }) {
  const initials = name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  return <div className={`flex shrink-0 items-center justify-center rounded-full bg-[#ece8ff] font-bold text-violet-700 ${small ? "h-8 w-8 text-[10px]" : "h-9 w-9 text-xs"}`}>{initials}</div>;
}

function StatCard({ label, value, icon, tint, caption }) {
  const colors = {
    violet: "bg-violet-50 text-violet-600",
    blue: "bg-sky-50 text-sky-600",
    amber: "bg-amber-50 text-amber-600",
    green: "bg-emerald-50 text-emerald-600"
  };
  return <div className="rounded-2xl border border-[#ececf2] bg-white p-4 soft-shadow sm:p-5">
    <div className="flex items-center justify-between"><span className="text-xs font-medium text-slate-500">{label}</span><span className={`flex h-8 w-8 items-center justify-center rounded-xl ${colors[tint]}`}>{icon}</span></div>
    <div className="mt-3 flex items-end justify-between"><div className="text-[28px] font-bold leading-none tracking-[-.05em]">{value}</div><span className="mb-0.5 flex items-center gap-1 text-[10px] text-slate-400"><ArrowUpRight size={12} /> Live</span></div>
    <p className="mt-2 text-[10px] text-slate-400">{caption}</p>
  </div>;
}

function TaskRow({ task, isAdmin, onStatus, onDelete, deleting }) {
  const dateParts = task.dueDate?.slice(0, 10).split("-").map(Number);
  const date = dateParts ? new Date(dateParts[0], dateParts[1] - 1, dateParts[2]) : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isOverdue = date && date < today && task.status !== "completed";
  return <article className="group flex flex-col gap-3 px-5 py-4 transition hover:bg-[#fcfcfe] sm:flex-row sm:items-center md:px-6">
    <div className={`hidden h-10 w-1 shrink-0 rounded-full sm:block ${task.priority === "high" ? "bg-rose-400" : task.priority === "low" ? "bg-emerald-400" : "bg-amber-400"}`} />
    <div className="flex min-w-0 flex-1 items-start gap-3">
      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${task.status === "completed" ? "bg-emerald-50 text-emerald-600" : "bg-slate-50 text-slate-500"}`}>{task.status === "completed" ? <CheckCheck size={17} /> : <ListTodo size={17} />}</div>
      <div className="min-w-0 flex-1">
        <h3 className={`truncate text-sm font-semibold ${task.status === "completed" ? "text-slate-400 line-through" : "text-slate-800"}`}>{task.title}</h3>
        <p className="mt-1 line-clamp-1 text-xs text-slate-400">{task.description || "No description added"}</p>
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-2 pl-12 sm:pl-0">
      {isAdmin && task.assignedTo && <div className="mr-1 flex items-center gap-2 sm:w-[125px]"><Avatar name={task.assignedTo.name} small /><span className="truncate text-xs text-slate-500">{task.assignedTo.name}</span></div>}
      {date && <span className={`flex items-center gap-1.5 text-[11px] ${isOverdue ? "font-semibold text-rose-500" : "text-slate-400"}`}><CalendarDays size={13} />{date.toLocaleDateString("en", { month: "short", day: "numeric" })}{isOverdue && <span className="hidden md:inline"> · overdue</span>}</span>}
      <span className={`rounded-md px-2 py-1 text-[10px] font-bold capitalize ${priorityClasses[task.priority]}`}>{task.priority}</span>
      <select aria-label={`Update status for ${task.title}`} value={task.status} onChange={(event) => onStatus(task._id, event.target.value)} className={`max-w-[120px] cursor-pointer appearance-none rounded-md border-0 px-2.5 py-1.5 text-[10px] font-semibold outline-none ring-1 ring-inset ring-transparent focus:ring-violet-300 ${statusClasses[task.status]}`}>
        {Object.entries(statusNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      {isAdmin && <button type="button" onClick={() => onDelete(task)} disabled={deleting} aria-label={`Delete ${task.title}`} title="Delete task" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-200 disabled:cursor-wait disabled:opacity-50"><Trash2 size={15} /></button>}
    </div>
  </article>;
}

function Login({ onLogin }) {
  const [email, setEmail] = useState("admin@taskflow.demo");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await request("/auth/login", null, { method: "POST", body: JSON.stringify({ email, password }) });
      onLogin(data);
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setLoading(false);
    }
  }

  return <div className="flex min-h-screen bg-white">
    <div className="relative hidden w-[48%] flex-col justify-between overflow-hidden bg-[#26223e] p-12 text-white lg:flex">
      <div className="absolute -right-32 -top-20 h-[480px] w-[480px] rounded-full border border-white/10" />
      <div className="absolute -right-12 top-0 h-[390px] w-[390px] rounded-full border border-white/10" />
      <div className="absolute -bottom-48 -left-28 h-[520px] w-[520px] rounded-full bg-violet-500/15 blur-3xl" />
      <div className="relative z-[1]"><Brand /></div>
      <div className="relative z-[1] max-w-lg">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-violet-200"><Sparkles size={13} /> A better way to work together</div>
        <h1 className="text-[42px] font-bold leading-[1.13] tracking-[-.05em]">Make room for<br /><span className="text-violet-300">meaningful work.</span></h1>
        <p className="mt-5 max-w-sm text-sm leading-7 text-slate-300">One thoughtful space to share priorities, keep projects moving, and celebrate the little wins.</p>
        <div className="mt-9 flex items-center gap-3">
          <div className="flex -space-x-2">{["JL", "AM", "SK", "TR"].map((item, index) => <div key={item} className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#26223e] text-[9px] font-bold ${["bg-violet-300 text-violet-900", "bg-amber-200 text-amber-900", "bg-sky-200 text-sky-900", "bg-emerald-200 text-emerald-900"][index]}`}>{item}</div>)}</div>
          <span className="text-xs text-slate-300">Good work happens together.</span>
        </div>
      </div>
      <div className="relative z-[1] text-[11px] text-slate-400">Thoughtfully built for teams that care.</div>
    </div>
    <div className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-[370px]">
        <div className="mb-9 lg:hidden"><Brand /></div>
        <div className="text-xs font-semibold uppercase tracking-[.14em] text-violet-600">Welcome back</div>
        <h2 className="mt-2 text-[30px] font-bold tracking-[-.045em]">Sign in to Taskflow</h2>
        <p className="mt-2 text-sm text-slate-500">Your team's next great day starts here.</p>
        <form onSubmit={submit} className="mt-8 space-y-5">
          <label className="block"><span className="mb-2 block text-xs font-semibold text-slate-700">Email address</span><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-50" placeholder="you@company.com" /></label>
          <label className="block"><span className="mb-2 block text-xs font-semibold text-slate-700">Password</span><input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3.5 text-sm outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-50" /></label>
          {error && <div role="alert" className="rounded-lg bg-rose-50 px-3 py-2.5 text-xs text-rose-700">{error}</div>}
          <button disabled={loading} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 text-sm font-semibold text-white shadow-md shadow-violet-200 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-70">{loading ? "Signing in..." : "Sign in"} {!loading && <ArrowUpRight size={16} />}</button>
        </form>
        <div className="mt-8 rounded-xl border border-slate-100 bg-slate-50 p-4">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-slate-600"><Sparkles size={13} className="text-violet-500" /> Demo accounts</div>
          <div className="space-y-2 text-[11px] text-slate-500">
            <button onClick={() => { setEmail("admin@taskflow.demo"); setPassword("password123"); }} className="flex w-full justify-between rounded-lg px-2 py-1.5 text-left hover:bg-white"><span>Admin</span><span>admin@taskflow.demo</span></button>
            <button onClick={() => { setEmail("jordan@taskflow.demo"); setPassword("password123"); }} className="flex w-full justify-between rounded-lg px-2 py-1.5 text-left hover:bg-white"><span>Employee</span><span>jordan@taskflow.demo</span></button>
            <div className="px-2 pt-1 text-[10px] text-slate-400">Password for both: password123</div>
          </div>
        </div>
      </div>
    </div>
  </div>;
}

function AssignTaskModal({ employees, busy, onClose, onSubmit }) {
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", dueDate: "", assignedTo: employees[0]?._id || "" });
  function submit(event) {
    event.preventDefault();
    onSubmit({ ...form, dueDate: form.dueDate || null });
  }
  return <div className="modal-backdrop fixed inset-0 z-20 flex items-end justify-center p-0 sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="assign-heading" className="w-full max-w-[500px] rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-7">
      <div className="flex items-start justify-between"><div><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><Plus size={18} /></div><h2 id="assign-heading" className="mt-4 text-lg font-bold">Assign a new task</h2><p className="mt-1 text-xs text-slate-400">Give your teammate a clear place to start.</p></div><button onClick={onClose} aria-label="Close dialog" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={17} /></button></div>
      {employees.length === 0 ? <div className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">No employees are available. Seed the demo data or add an employee first.</div> :
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Task title <span className="text-rose-500">*</span></span><input required maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="What needs to get done?" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" /></label>
        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Description</span><textarea rows={3} maxLength={2000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Add a little context..." className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Assign to</span><select value={form.assignedTo} onChange={(event) => setForm({ ...form, assignedTo: event.target.value })} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-violet-400">{employees.map((employee) => <option key={employee._id} value={employee._id}>{employee.name}</option>)}</select></label>
          <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Priority</span><select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm capitalize outline-none focus:border-violet-400"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
        </div>
        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Due date</span><input type="date" min={new Date().toISOString().slice(0, 10)} value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-violet-400" /></label>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-50">Cancel</button><button disabled={busy || employees.length === 0} className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:opacity-60">{busy ? "Assigning..." : "Assign task"} <ArrowDown size={13} className="rotate-[-45deg]" /></button></div>
      </form>}
    </div>
  </div>;
}

export default App;
