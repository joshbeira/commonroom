import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Copy,
  Download,
  House,
  LayoutDashboard,
  Leaf,
  LogOut,
  Menu,
  Plus,
  Radio,
  ReceiptText,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { api, post } from "./api";
import { Auth, Onboarding } from "./Auth";
import { ExpenseDetail, NewExpense } from "./ExpenseModal";
import { Network } from "./Network";
import {
  formatDate,
  money,
  type Expense,
  type Session,
  type Workspace,
} from "./types";
import {
  Avatar,
  Brand,
  CategoryIcon,
  Empty,
  HouseArt,
  Modal,
  TextLink,
} from "./ui";

type Page =
  | "Overview"
  | "Expenses"
  | "Balances"
  | "Activity"
  | "Network lab"
  | "Household";
const navigation = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Expenses", icon: ReceiptText },
  { label: "Balances", icon: Wallet },
  { label: "Activity", icon: Activity },
] as const;

function ExpenseTable({
  expenses,
  userId,
  open,
}: {
  expenses: Expense[];
  userId: number;
  open: (id: number) => void;
}) {
  if (!expenses.length)
    return (
      <Empty title="A little breathing room.">
        No expenses here yet. Add one to start sharing the load.
      </Empty>
    );
  return (
    <div className="table-scroll">
      <table className="expense-table">
        <thead>
          <tr>
            <th>EXPENSE</th>
            <th>PAID BY</th>
            <th>AMOUNT</th>
            <th>STATUS</th>
            <th>
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {expenses.map((expense) => (
            <tr key={expense.id}>
              <td>
                <button
                  className="expense-name"
                  onClick={() => open(expense.id)}
                >
                  <CategoryIcon category={expense.category} />
                  <span>
                    <strong>{expense.title}</strong>
                    <small>
                      {expense.category} <span>·</span>{" "}
                      {formatDate(expense.incurred_on)}
                    </small>
                  </span>
                </button>
              </td>
              <td>
                <span className="payer">
                  <Avatar
                    name={expense.payer}
                    index={expense.creator_id % 4}
                    small
                  />
                  {expense.creator_id === userId
                    ? "You"
                    : expense.payer.split(" ")[0]}
                </span>
              </td>
              <td className="amount-cell">{money(expense.amount)}</td>
              <td>
                <span
                  className={
                    "status " + (expense.settled ? "settled" : "pending")
                  }
                >
                  {expense.settled ? (
                    <Check size={12} />
                  ) : (
                    <span className="status-dot" />
                  )}
                  {expense.status === "archived"
                    ? "Archived"
                    : expense.settled
                      ? "Settled"
                      : "To settle"}
                </span>
              </td>
              <td>
                <button
                  className="icon-button"
                  aria-label={`View ${expense.title}`}
                  onClick={() => open(expense.id)}
                >
                  <ChevronRight size={17} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SpendingChart({ expenses }: { expenses: Expense[] }) {
  const categories = ["Home", "Groceries", "Utilities", "Transport", "Other"];
  const current = new Date();
  const end = new Date(
    current.getFullYear(),
    current.getMonth(),
    current.getDate(),
  );
  const weeks = Array.from({ length: 6 }, (_, i) => {
    const start = new Date(end);
    start.setDate(start.getDate() - (5 - i) * 7 - 6);
    const finish = new Date(start);
    finish.setDate(finish.getDate() + 7);
    const data = categories.map((c) =>
      expenses
        .filter(
          (e) =>
            e.category === c &&
            new Date(e.incurred_on + "T12:00:00") >= start &&
            new Date(e.incurred_on + "T12:00:00") < finish,
        )
        .reduce((a, e) => a + e.amount, 0),
    );
    return {
      label: start.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      }),
      data,
    };
  });
  const max = Math.max(
    1,
    ...weeks.map((w) => w.data.reduce((a, b) => a + b, 0)),
  );
  const total = expenses.reduce((a, e) => a + e.amount, 0);
  return (
    <section className="card spending-card">
      <div className="section-head">
        <div>
          <h2>The bigger picture</h2>
          <p>What makes a house a home.</p>
        </div>
        <span className="tag">
          Last 6 weeks
          <ChevronDown size={13} />
        </span>
      </div>
      <div
        className="spending-chart"
        role="img"
        aria-label={
          "Weekly household spending. " +
          weeks
            .map(
              (w) => `${w.label}: ${money(w.data.reduce((a, b) => a + b, 0))}`,
            )
            .join(". ")
        }
      >
        <div className="chart-y">
          <span>{money(max)}</span>
          <span>{money(Math.round(max / 2))}</span>
          <span>£0</span>
        </div>
        <div className="chart-plot">
          <div className="grid-line top" />
          <div className="grid-line middle" />
          <div className="grid-line bottom" />
          {weeks.map((week) => (
            <div className="week-column" key={week.label}>
              <div className="bar-stack">
                {week.data.map((amount, i) => (
                  <div
                    key={i}
                    title={`${categories[i]}: ${money(amount)}`}
                    className={`bar-segment segment-${i}`}
                    style={{
                      height: `${(amount / max) * 145}px`,
                      minHeight: amount ? 3 : 0,
                    }}
                  />
                ))}
              </div>
              <small>{week.label}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="chart-legend">
        {categories
          .filter((c) => expenses.some((e) => e.category === c))
          .map((c) => (
            <span key={c}>
              <i className={`segment-${categories.indexOf(c)}`} />
              {c}
            </span>
          ))}
      </div>
      <div className="spending-foot">
        <span>Total recorded expenses</span>
        <strong>{money(total)}</strong>
      </div>
    </section>
  );
}

export default function App() {
  const [session, setSession] = useState<Session>();
  const [workspace, setWorkspace] = useState<Workspace | null>();
  const [page, setPage] = useState<Page>("Overview");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All expenses");
  const [category, setCategory] = useState("All categories");
  const [newExpense, setNewExpense] = useState(false);
  const [detailId, setDetailId] = useState<number>();
  const [help, setHelp] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [live, setLive] = useState("Connecting");
  const [invite, setInvite] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const refresh = useCallback(async () => {
    const result = await api<Workspace | { household: null }>("/workspace");
    setWorkspace(result.household ? (result as Workspace) : null);
  }, []);
  const loadSession = useCallback(async () => {
    const result = await api<Session>("/session");
    setSession(result);
    if (result.user) await refresh();
    else setWorkspace(undefined);
  }, [refresh]);
  useEffect(() => {
    loadSession().catch((e) => setError(e.message));
  }, [loadSession]);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timeout);
  }, [toast]);
  const houseId = workspace?.household.id;
  const initialCursor = useRef(0);
  initialCursor.current = workspace?.events[0]?.id || 0;
  useEffect(() => {
    if (!houseId) return;
    const source = new EventSource(
      "/api/events?after=" + initialCursor.current,
    );
    source.onopen = () => setLive("Connected");
    source.onerror = () => {
      setLive("Reconnecting");
      api<Session>("/session")
        .then((result) => {
          if (!result.user) {
            source.close();
            setSession(result);
            setWorkspace(undefined);
          }
        })
        .catch(() => {
          /* EventSource retries transient network interruptions. */
        });
    };
    source.addEventListener("change", () => {
      refresh().catch((e) => setError(e.message));
    });
    source.addEventListener("expired", () => {
      source.close();
      void loadSession();
    });
    return () => source.close();
  }, [houseId, refresh, loadSession]);
  useEffect(() => {
    function shortcut(e: KeyboardEvent) {
      if (
        e.key === "/" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  function navigate(next: Page) {
    setPage(next);
    setMobile(false);
    setSearch("");
  }
  async function logout() {
    try {
      await post("/auth/logout");
      await loadSession();
      setPage("Overview");
      setInvite("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!session)
    return (
      <main className="loading">
        <Brand />
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button
              className="button primary"
              onClick={() => location.reload()}
            >
              Try again
            </button>
          </>
        ) : (
          <p>Making a little room for you…</p>
        )}
      </main>
    );
  if (!session.user) return <Auth session={session} onSignedIn={loadSession} />;
  if (workspace === undefined)
    return (
      <main className="loading">
        <Brand />
        {error ? <p role="alert">{error}</p> : <p>Opening your household…</p>}
      </main>
    );
  if (!workspace)
    return (
      <>
        <button className="onboarding-logout button secondary" onClick={logout}>
          Sign out
        </button>
        <Onboarding refresh={refresh} />
      </>
    );
  const user = session.user;
  const active = workspace.expenses.filter((e) => e.status !== "archived");
  const owedToYou = active
    .filter((e) => e.creator_id === user.id)
    .flatMap((e) => e.shares)
    .filter((s) => s.user_id !== user.id && s.state !== "confirmed")
    .reduce((a, s) => a + s.amount, 0);
  const youOwe = active
    .flatMap((e) => e.shares)
    .filter((s) => s.user_id === user.id && s.state !== "confirmed")
    .reduce((a, s) => a + s.amount, 0);
  const needingReview = active.filter(
    (e) =>
      e.creator_id === user.id && e.shares.some((s) => s.state === "submitted"),
  );
  const recent = active.filter(
    (e) => Date.now() - new Date(e.incurred_on).getTime() < 30 * 86400000,
  );
  const monthTotal = recent.reduce((a, e) => a + e.amount, 0);
  const expenseDetail = workspace.expenses.find((e) => e.id === detailId);
  const filtered = workspace.expenses.filter(
    (e) =>
      (filter === "Archived"
        ? e.status === "archived"
        : e.status !== "archived") &&
      (filter !== "To settle" || !e.settled) &&
      (filter !== "Settled" || e.settled) &&
      (category === "All categories" || e.category === category) &&
      `${e.title} ${e.payer} ${e.category}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const nameOf = (id: number) =>
    workspace.members.find((m) => m.id === id)?.name || "Housemate";
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {mobile && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={"sidebar " + (mobile ? "is-open" : "")}>
        <Brand />
        <button
          className="house-selector"
          onClick={() => navigate("Household")}
        >
          <span className="house-selector-icon">
            <House size={19} />
          </span>
          <span>
            <b>{workspace.household.name}</b>
            <small>Your shared space</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <span className="nav-label">YOUR SPACE</span>
        <nav aria-label="Main navigation">
          {navigation.map((item) => (
            <button
              key={item.label}
              aria-current={page === item.label ? "page" : undefined}
              className={page === item.label ? "nav-item active" : "nav-item"}
              onClick={() => navigate(item.label)}
            >
              <item.icon size={19} />
              {item.label}
              {item.label === "Expenses" && (
                <span className="nav-count">{active.length}</span>
              )}
            </button>
          ))}
          <button
            className={page === "Household" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("Household")}
          >
            <Users size={19} />
            Household
          </button>
        </nav>
        <div className="sidebar-lower">
          <span className="nav-label">UNDER THE HOOD</span>
          <button
            className={page === "Network lab" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("Network lab")}
          >
            <Radio size={19} />
            Network lab
            <span className="tiny-dot" />
          </button>
          <div className="sidebar-note">
            <span className="mini-leaf">
              <Leaf size={21} />
            </span>
            <h3>A home, in harmony.</h3>
            <p>A little clarity goes a long way.</p>
            <button onClick={() => setHelp(true)}>
              How Commonroom works
              <ArrowUpRight size={14} />
            </button>
          </div>
          <button className="profile-button" onClick={logout} title="Sign out">
            <Avatar name={user.name} />
            <span>
              <b>{user.name}</b>
              <small>{user.demo ? "Demo workspace" : "Personal account"}</small>
            </span>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <span>Your space</span>
            <ChevronRight size={13} />
            <b>{page}</b>
          </div>
          <div className="topbar-actions">
            <label className="global-search">
              <Search size={16} />
              <input
                ref={searchRef}
                aria-label="Search expenses"
                placeholder="Find an expense…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage("Expenses");
                }}
              />
              <kbd>/</kbd>
            </label>
            <button
              className={
                "icon-button notifications " +
                (needingReview.length ? "has-notification" : "")
              }
              onClick={() => navigate("Activity")}
              aria-label={`Activity, ${needingReview.length} expenses awaiting confirmation`}
            >
              <Bell size={19} />
            </button>
            <span className="topbar-divider" />
            <Avatar name={user.name} small />
          </div>
        </header>
        <main id="main" className="main-content">
          {error && (
            <div className="error global-error" role="alert">
              {error}
              <button
                className="icon-button"
                onClick={() => setError("")}
                aria-label="Dismiss error"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {page === "Overview" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    A LITTLE CLARITY. A LOT MORE CALM.
                  </span>
                  <h1>
                    Good to have you home, {user.name.split(" ")[0]}
                    <span className="heading-dot">.</span>
                  </h1>
                  <p>
                    Here’s how things are looking at {workspace.household.name}.
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => setNewExpense(true)}
                >
                  <Plus size={17} />
                  Add expense
                </button>
              </div>
              <section className="welcome-banner">
                <div>
                  <span className="pill">
                    <Leaf size={13} />
                    BETTER, TOGETHER
                  </span>
                  <h2>
                    Less keeping tabs.
                    <br />
                    More making memories.
                  </h2>
                  <p>Your home’s expenses, all in one happy place.</p>
                  <div className="household-faces">
                    <div className="avatar-stack">
                      {workspace.members.map((m, i) => (
                        <Avatar key={m.id} name={m.name} index={i} small />
                      ))}
                    </div>
                    <span>
                      {workspace.members.length} housemates
                      <span className="bullet">·</span>One shared home
                    </span>
                  </div>
                </div>
                <HouseArt />
                <span className="banner-word">make room.</span>
              </section>
              <div className="stats-grid">
                <div className="stat-card">
                  <span>
                    You’re owed{" "}
                    <span className="stat-icon">
                      <ArrowDownLeft size={17} />
                    </span>
                  </span>
                  <strong>{money(owedToYou)}</strong>
                  <p>
                    <span className="tiny-dot" />
                    Coming back your way
                  </p>
                </div>
                <div className="stat-card">
                  <span>
                    You owe{" "}
                    <span className="stat-icon ochre">
                      <ArrowUpRight size={17} />
                    </span>
                  </span>
                  <strong>{money(youOwe)}</strong>
                  <p>A little to square up</p>
                </div>
                <div className="stat-card">
                  <span>
                    Household spending{" "}
                    <span className="stat-icon neutral">
                      <ReceiptText size={17} />
                    </span>
                  </span>
                  <strong>{money(monthTotal)}</strong>
                  <p>
                    Last 30 days<span className="bullet">·</span>
                    {recent.length} shared expenses
                  </p>
                </div>
              </div>
              <div className="overview-grid">
                <div className="overview-main">
                  <section className="card expenses-card">
                    <div className="section-head">
                      <div>
                        <h2>The latest at home</h2>
                        <p>Little things, shared fairly.</p>
                      </div>
                      <TextLink onClick={() => navigate("Expenses")}>
                        View all
                      </TextLink>
                    </div>
                    <ExpenseTable
                      expenses={active.slice(0, 5)}
                      userId={user.id}
                      open={setDetailId}
                    />
                  </section>
                  <SpendingChart expenses={workspace.expenses} />
                </div>
                <div className="overview-aside">
                  <section className="card settle-card">
                    <div className="section-head">
                      <h2>A little to settle</h2>
                      <span className="subtle-icon">
                        <Wallet size={18} />
                      </span>
                    </div>
                    <p className="muted small">
                      Your household’s net balances.
                    </p>
                    <div className="member-balances">
                      {workspace.members.map((member, i) => (
                        <div key={member.id}>
                          <Avatar name={member.name} index={i} />
                          <span>
                            <b>
                              {member.id === user.id
                                ? "You"
                                : member.name.split(" ")[0]}
                            </b>
                            <small>
                              {workspace.balances[member.id] > 0
                                ? member.id === user.id
                                  ? "you’re owed"
                                  : "is owed"
                                : workspace.balances[member.id] < 0
                                  ? "owes"
                                  : "all square"}
                            </small>
                          </span>
                          <strong
                            className={
                              workspace.balances[member.id] >= 0 ? "green" : ""
                            }
                          >
                            {money(Math.abs(workspace.balances[member.id]))}
                          </strong>
                        </div>
                      ))}
                    </div>
                    <button
                      className="button secondary full"
                      onClick={() => navigate("Balances")}
                    >
                      See the full picture
                      <ArrowRight size={16} />
                    </button>
                  </section>
                  <section className="card activity-preview">
                    <div className="section-head">
                      <h2>Around the house</h2>
                      <span className="live-label">
                        <span className="tiny-dot" />
                        {live === "Connected" ? "Live" : "Reconnecting"}
                      </span>
                    </div>
                    <div className="mini-timeline">
                      {workspace.events.slice(0, 3).map((event, i) => (
                        <div key={event.id}>
                          <span
                            className={
                              "timeline-dot " + (i === 0 ? "latest" : "")
                            }
                          />
                          <div>
                            <p>
                              <b>{event.actor.split(" ")[0]}</b>{" "}
                              {event.action === "expense.created"
                                ? "added an expense"
                                : event.action.replaceAll(".", " ")}
                            </p>
                            <span>
                              {JSON.parse(event.payload).title ||
                                "Keeping everyone in the loop"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <TextLink onClick={() => navigate("Activity")}>
                      All activity
                    </TextLink>
                  </section>
                  <div className="quiet-note">
                    <ShieldCheck size={18} />
                    <span>
                      Private by design.
                      <br />
                      <b>Only your household can see this.</b>
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
          {page === "Expenses" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">EVERY PENNY, IN ITS PLACE</span>
                  <h1>The shared ledger.</h1>
                  <p>From the monthly rent to the morning coffee.</p>
                </div>
                <div className="heading-actions">
                  <a className="button secondary" href="/api/export">
                    <Download size={16} />
                    Export
                  </a>
                  <button
                    className="button primary"
                    onClick={() => setNewExpense(true)}
                  >
                    <Plus size={17} />
                    Add expense
                  </button>
                </div>
              </div>
              <section className="card expenses-card">
                <div className="expense-filters">
                  <div
                    className="tabs"
                    role="group"
                    aria-label="Expense status"
                  >
                    {["All expenses", "To settle", "Settled", "Archived"].map(
                      (option) => (
                        <button
                          className={filter === option ? "selected" : ""}
                          key={option}
                          onClick={() => setFilter(option)}
                        >
                          {option}
                        </button>
                      ),
                    )}
                  </div>
                  <label className="category-filter">
                    <SlidersHorizontal size={15} />
                    <select
                      aria-label="Filter by category"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      {[
                        "All categories",
                        "Home",
                        "Groceries",
                        "Utilities",
                        "Transport",
                        "Other",
                      ].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="ledger-search">
                  <Search size={16} />
                  <input
                    aria-label="Search the ledger"
                    placeholder="Search by expense, person, or category…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
                {search && (
                  <p className="search-caption">
                    Results for “{search}”{" "}
                    <button className="text-link" onClick={() => setSearch("")}>
                      Clear
                    </button>
                  </p>
                )}
                <ExpenseTable
                  expenses={filtered}
                  userId={user.id}
                  open={setDetailId}
                />
                <div className="table-footer">
                  {filtered.length} expenses
                  <span>Amounts in GBP · Exact to the penny</span>
                </div>
              </section>
            </>
          )}
          {page === "Balances" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">A FAIR SHARE FOR EVERYONE</span>
                  <h1>Good friends. Clear balances.</h1>
                  <p>Know where you stand, without the awkward conversation.</p>
                </div>
              </div>
              <div className="balances-cards">
                {workspace.members.map((member, i) => (
                  <section className="card member-card" key={member.id}>
                    <Avatar name={member.name} index={i} />
                    <h2>
                      {member.name}
                      {member.id === user.id ? " (you)" : ""}
                    </h2>
                    <span className="muted small">
                      {workspace.balances[member.id] > 0
                        ? "To receive"
                        : workspace.balances[member.id] < 0
                          ? "To pay"
                          : "All settled"}
                    </span>
                    <strong>
                      {money(Math.abs(workspace.balances[member.id]))}
                    </strong>
                  </section>
                ))}
              </div>
              <div className="two-column">
                <section className="card">
                  <div className="section-head">
                    <h2>A simpler way to square up</h2>
                    <Sparkles size={19} />
                  </div>
                  <p className="muted small">
                    Suggested transfers after netting everyone’s outstanding
                    shares. Agree with your housemates before using these.
                  </p>
                  {workspace.transfers.length ? (
                    <div className="transfer-list">
                      {workspace.transfers.map((t, i) => (
                        <div key={i}>
                          <Avatar name={nameOf(t.from)} small />
                          <span>{nameOf(t.from).split(" ")[0]}</span>
                          <ArrowRight size={17} />
                          <span>{nameOf(t.to).split(" ")[0]}</span>
                          <strong>{money(t.amount)}</strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Empty title="All square.">
                      That’s one less thing to think about.
                    </Empty>
                  )}
                  <p className="network-note">
                    Suggestions only. To keep the ledger accurate, record and
                    confirm payments against their original expenses. Commonroom
                    does not move money or reconcile these suggested net
                    transfers automatically.
                  </p>
                </section>
                <section className="card">
                  <h2>Your next small step</h2>
                  <p className="muted small">
                    Outstanding expenses that need your attention.
                  </p>
                  <div className="action-list">
                    {active
                      .filter(
                        (e) =>
                          e.shares.some(
                            (s) =>
                              s.user_id === user.id && s.state === "pending",
                          ) || needingReview.some((n) => n.id === e.id),
                      )
                      .map((e) => (
                        <button key={e.id} onClick={() => setDetailId(e.id)}>
                          <CategoryIcon category={e.category} />
                          <span>
                            <b>{e.title}</b>
                            <small>
                              {e.creator_id === user.id
                                ? "Confirm a housemate’s payment"
                                : "Record your payment"}
                            </small>
                          </span>
                          <ChevronRight size={18} />
                        </button>
                      ))}
                  </div>
                </section>
              </div>
            </>
          )}
          {page === "Activity" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">EVERY CHANGE HAS A STORY</span>
                  <h1>Everyone in the loop.</h1>
                  <p>A shared timeline, with a verifiable record behind it.</p>
                </div>
                <span className="pill">
                  <Radio size={14} />
                  {live}
                </span>
              </div>
              {needingReview.length > 0 && (
                <section className="review-banner">
                  <Bell size={22} />
                  <div>
                    <h3>
                      {needingReview.length} expense
                      {needingReview.length !== 1 ? "s" : ""} ready for your
                      confirmation
                    </h3>
                    <p>A housemate has marked their share as paid.</p>
                  </div>
                  <button
                    className="button primary"
                    onClick={() => setDetailId(needingReview[0].id)}
                  >
                    Review payment
                    <ArrowRight size={16} />
                  </button>
                </section>
              )}
              <div
                className={
                  "audit-banner " + (!workspace.audit.valid ? "invalid" : "")
                }
              >
                <ShieldCheck size={24} />
                <div>
                  <h3>
                    {workspace.audit.valid
                      ? "Audit chain verified"
                      : "Audit chain integrity check failed"}
                  </h3>
                  <p>
                    {workspace.audit.count} linked events · HMAC-SHA256 ·
                    Checked against the server’s audit key
                  </p>
                </div>
                <span className="tag">
                  {workspace.audit.valid ? "Intact" : "Investigate"}
                </span>
              </div>
              <section className="card">
                <div className="section-head">
                  <h2>Household history</h2>
                  <span className="small muted">Latest 100 events</span>
                </div>
                <div className="event-list">
                  {workspace.events.map((event) => (
                    <div key={event.id}>
                      <span className="event-icon">
                        {event.action.startsWith("payment") ? (
                          <CheckCheck size={19} />
                        ) : event.action.startsWith("expense") ? (
                          <ReceiptText size={19} />
                        ) : (
                          <Users size={19} />
                        )}
                      </span>
                      <div>
                        <h3>
                          {JSON.parse(event.payload).title ||
                            event.action.replaceAll(".", " ")}
                        </h3>
                        <p>
                          {event.actor} · {event.action.replaceAll(".", " ")}
                        </p>
                        <code title={event.hash}>
                          #{event.id} · {event.hash.slice(0, 20)}…
                        </code>
                      </div>
                      <time dateTime={event.created_at}>
                        {new Date(event.created_at).toLocaleString("en-GB", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                  ))}
                </div>
                <p className="network-note">
                  A linked audit trail detects edits and missing intermediate
                  events. It does not protect against a compromised server or
                  undetectable tail deletion without an externally saved chain
                  head.
                </p>
              </section>
            </>
          )}
          {page === "Network lab" && <Network live={live} />}
          {page === "Household" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">THE PEOPLE MAKE THE PLACE</span>
                  <h1>
                    {workspace.household.name}
                    <span className="heading-dot">.</span>
                  </h1>
                  <p>A shared space for your shared life.</p>
                </div>
                <span className="pill">
                  <House size={14} />
                  {workspace.members.length} housemates
                </span>
              </div>
              <div className="two-column">
                <section className="card">
                  <h2>Your people</h2>
                  <div className="household-members">
                    {workspace.members.map((m, i) => (
                      <div key={m.id}>
                        <Avatar name={m.name} index={i} />
                        <span>
                          <b>{m.name}</b>
                          <small>
                            {m.id === workspace.household.owner_id
                              ? "Household owner"
                              : "Housemate"}
                          </small>
                        </span>
                        {m.id === user.id && <span className="tag">You</span>}
                      </div>
                    ))}
                  </div>
                </section>
                <section className="card">
                  <div className="section-head">
                    <h2>Make room for someone</h2>
                    <Users size={20} />
                  </div>
                  <p className="muted">
                    Invite a housemate with a private code. It expires in 24
                    hours. Generating a new code revokes the previous one.
                  </p>
                  {user.demo ? (
                    <div className="network-note">
                      Invitations are disabled for sample households. Sign out
                      and create an account to start your own shared home.
                    </div>
                  ) : workspace.household.owner_id === user.id ? (
                    <>
                      <button
                        className="button primary"
                        disabled={inviteBusy}
                        onClick={async () => {
                          setInviteBusy(true);
                          try {
                            const result = await post<{ code: string }>(
                              "/household/invite",
                            );
                            setInvite(result.code);
                            await refresh();
                          } catch (e) {
                            setError((e as Error).message);
                          } finally {
                            setInviteBusy(false);
                          }
                        }}
                      >
                        <Plus size={16} />
                        {inviteBusy
                          ? "Creating…"
                          : invite
                            ? "Replace invitation"
                            : "Create invitation"}
                      </button>
                      {invite && (
                        <div className="invite-code">
                          <code>{invite}</code>
                          <button
                            className="icon-button"
                            aria-label="Copy invitation"
                            onClick={() => {
                              navigator.clipboard
                                .writeText(invite)
                                .then(() => setToast("Invitation copied."))
                                .catch(() =>
                                  setToast(
                                    "Select the code and copy it manually.",
                                  ),
                                );
                            }}
                          >
                            <Copy size={17} />
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="network-note">
                      Ask your household owner to create an invitation.
                    </p>
                  )}
                </section>
              </div>
              <section className="card principles">
                <div>
                  <ShieldCheck size={25} />
                  <h3>Your home, your information.</h3>
                  <p>
                    Access is checked on every request. Receipts and events stay
                    inside your household.
                  </p>
                </div>
                <div>
                  <CheckCheck size={25} />
                  <h3>Clear records, by design.</h3>
                  <p>
                    Published expenses preserve their original amounts. Settled
                    records can be archived, not erased.
                  </p>
                </div>
                <div>
                  <Download size={25} />
                  <h3>Take your ledger with you.</h3>
                  <p>
                    Export your household’s expenses as a spreadsheet-friendly
                    CSV, whenever you like.
                  </p>
                  <a className="text-link" href="/api/export">
                    Download your expenses
                    <ArrowUpRight size={14} />
                  </a>
                </div>
              </section>
            </>
          )}
          <footer className="page-footer">
            <span>Made for the way we live together.</span>
            <span>
              <span className="tiny-dot" />
              {live === "Connected"
                ? "All caught up"
                : "Reconnecting live updates"}
              {user.demo && (
                <span className="demo-label">SAMPLE HOUSEHOLD</span>
              )}
            </span>
          </footer>
        </main>
      </div>
      {newExpense && (
        <NewExpense
          workspace={workspace}
          close={() => setNewExpense(false)}
          saved={async () => {
            await refresh();
            setToast("Expense added. Everyone’s share is in the ledger.");
          }}
        />
      )}{" "}
      {expenseDetail && (
        <ExpenseDetail
          expense={expenseDetail}
          workspace={workspace}
          user={user}
          close={() => setDetailId(undefined)}
          refresh={refresh}
        />
      )}
      {help && (
        <Modal
          title="A little clarity, together."
          onClose={() => setHelp(false)}
        >
          <div className="help-steps">
            <p>
              <b>1. Share the expense.</b> Add a bill you’ve paid and choose who
              shares it. Equal splits or custom weights; every penny finds its
              place.
            </p>
            <p>
              <b>2. Square up in real life.</b> Pay your housemate outside
              Commonroom, then mark your share as paid.
            </p>
            <p>
              <b>3. Confirm and carry on.</b> The original payer confirms
              receipt. Everyone sees the change, and the audit trail keeps the
              record.
            </p>
          </div>
          <button
            className="button primary full"
            onClick={() => setHelp(false)}
          >
            Make yourself at home
            <ArrowRight size={16} />
          </button>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
