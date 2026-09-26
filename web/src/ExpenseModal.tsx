import { useRef, useState, type FormEvent } from "react";
import { Check, CheckCheck, FileImage, Plus, Upload } from "lucide-react";
import { api, post } from "./api";
import {
  formatDate,
  money,
  type Expense,
  type User,
  type Workspace,
} from "./types";
import { Avatar, CategoryIcon, Modal } from "./ui";

export function NewExpense({
  workspace,
  close,
  saved,
}: {
  workspace: Workspace;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const [weighted, setWeighted] = useState(false);
  const [weights, setWeights] = useState<Record<number, number>>(
    Object.fromEntries(workspace.members.map((m) => [m.id, 1])),
  );
  const requestKey = useRef(crypto.randomUUID());
  const lastPayload = useRef("");
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const data = Object.fromEntries(new FormData(e.currentTarget));
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(amount)) {
      setError("Enter an amount with up to two decimal places.");
      setBusy(false);
      return;
    }
    const [pounds, pennies = ""] = amount.split(".");
    const integerAmount = Number(pounds) * 100 + Number(pennies.padEnd(2, "0"));
    const payload = {
      ...data,
      amount: integerAmount,
      weights: Object.fromEntries(
        Object.entries(weights).filter(([, w]) => w > 0),
      ),
    };
    const serialized = JSON.stringify(payload);
    if (lastPayload.current && lastPayload.current !== serialized)
      requestKey.current = crypto.randomUUID();
    lastPayload.current = serialized;
    try {
      await post("/expenses", payload, requestKey.current);
      await saved();
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Add a shared expense" onClose={close}>
      <form onSubmit={submit}>
        <label>
          What was it for?
          <input
            name="title"
            required
            maxLength={100}
            placeholder="The weekly food shop"
            autoFocus
          />
        </label>
        <div className="form-row">
          <label>
            Amount (£)
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              required
            />
          </label>
          <label>
            Category
            <select name="category">
              {["Groceries", "Home", "Utilities", "Transport", "Other"].map(
                (c) => (
                  <option key={c}>{c}</option>
                ),
              )}
            </select>
          </label>
        </div>
        <label>
          Expense date
          <input
            name="incurred_on"
            type="date"
            required
            defaultValue={new Date().toLocaleDateString("en-CA")}
            max={new Date().toLocaleDateString("en-CA")}
          />
        </label>
        <div className="split-header">
          <h3>Split with your people</h3>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={weighted}
              onChange={(e) => {
                setWeighted(e.target.checked);
                setWeights((old) =>
                  Object.fromEntries(
                    Object.entries(old).map(([id, w]) => [id, w ? 1 : 0]),
                  ),
                );
              }}
            />
            Custom weights
          </label>
        </div>
        <div className="split-list">
          {workspace.members.map((member, i) => (
            <div key={member.id}>
              <label className="member-check">
                <input
                  type="checkbox"
                  checked={weights[member.id] > 0}
                  onChange={(e) =>
                    setWeights({
                      ...weights,
                      [member.id]: e.target.checked ? 1 : 0,
                    })
                  }
                />
                <Avatar name={member.name} index={i} small />
                <span>{member.name}</span>
              </label>
              {weighted && weights[member.id] > 0 ? (
                <input
                  className="weight-input"
                  aria-label={`${member.name} split weight`}
                  type="number"
                  min="1"
                  max="100"
                  value={weights[member.id]}
                  onChange={(e) =>
                    setWeights({
                      ...weights,
                      [member.id]: Number(e.target.value),
                    })
                  }
                />
              ) : (
                <span className="muted small">
                  {totalWeight && weights[member.id]
                    ? `${Math.round((weights[member.id] / totalWeight) * 100)}%`
                    : "—"}
                </span>
              )}
            </div>
          ))}
        </div>
        <p className="small muted">
          You paid the original bill. Shares are allocated to the penny,
          including any rounding remainder.
        </p>
        <label>
          A note, if you like
          <textarea
            name="note"
            maxLength={500}
            placeholder="Anything your housemates should know"
            rows={2}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={close}>
            Cancel
          </button>
          <button className="button primary" disabled={busy || !totalWeight}>
            <Plus size={16} />
            {busy ? "Adding…" : "Add expense"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ExpenseDetail({
  expense,
  workspace,
  user,
  close,
  refresh,
}: {
  expense: Expense;
  workspace: Workspace;
  user: User;
  close: () => void;
  refresh: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function action(uid: number, action: string) {
    setBusy(true);
    setError("");
    try {
      await post(`/expenses/${expense.id}/shares/${uid}`, { action });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    const data = new FormData();
    data.set("receipt", file);
    try {
      await api(`/expenses/${expense.id}/receipt`, {
        method: "POST",
        body: data,
      });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={expense.title} onClose={close} wide>
      <div className="expense-summary">
        <CategoryIcon category={expense.category} />
        <div>
          <strong>{money(expense.amount)}</strong>
          <p>
            Paid by {expense.payer} · {formatDate(expense.incurred_on)}
          </p>
        </div>
        <span className="tag">{expense.category}</span>
      </div>
      {expense.note && <p className="expense-note">{expense.note}</p>}
      <h3>Everyone’s share</h3>
      <p className="small muted">
        Record a transfer after paying outside Commonroom. The bill payer
        confirms receipt.
      </p>
      <div className="detail-shares">
        {expense.shares.map((share) => {
          const member = workspace.members.find((m) => m.id === share.user_id)!;
          return (
            <div key={share.user_id}>
              <Avatar
                name={member.name}
                index={workspace.members.indexOf(member)}
                small
              />
              <div className="share-person">
                <strong>
                  {member.name}
                  {share.user_id === user.id ? " (you)" : ""}
                </strong>
                <span>
                  {share.user_id === expense.creator_id
                    ? "Original payer"
                    : share.state === "confirmed"
                      ? "Confirmed"
                      : share.state === "submitted"
                        ? "Awaiting confirmation"
                        : "To settle"}
                </span>
              </div>
              <b>{money(share.amount)}</b>
              {share.state === "confirmed" ? (
                <CheckCheck className="green" size={19} />
              ) : share.user_id === user.id && share.state === "pending" ? (
                <button
                  className="button small-button secondary"
                  disabled={busy}
                  onClick={() => action(share.user_id, "submit")}
                >
                  I’ve paid
                </button>
              ) : share.state === "submitted" &&
                expense.creator_id === user.id ? (
                <div className="payment-buttons">
                  <button
                    className="button small-button primary"
                    disabled={busy}
                    onClick={() => action(share.user_id, "confirm")}
                  >
                    <Check size={14} />
                    Confirm
                  </button>
                  <button
                    className="text-link small"
                    disabled={busy}
                    onClick={() => action(share.user_id, "reject")}
                  >
                    Not received
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {expense.receipt ? (
        <a
          className="receipt-link"
          target="_blank"
          rel="noreferrer"
          href={`/api/expenses/${expense.id}/receipt`}
        >
          <FileImage size={20} />
          View original receipt<span>PNG · Verified image</span>
        </a>
      ) : (
        expense.creator_id === user.id && (
          <label className="upload-zone">
            <Upload size={23} />
            <b>Attach the original receipt</b>
            <span>PNG or JPEG · Up to 5 MB · Image metadata removed</span>
            <input
              type="file"
              accept="image/png,image/jpeg"
              aria-label="Upload receipt"
              disabled={busy}
              onChange={(e) => upload(e.target.files?.[0])}
            />
          </label>
        )
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        {expense.creator_id === user.id &&
          expense.settled &&
          expense.status !== "archived" && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await post(`/expenses/${expense.id}/archive`);
                  await refresh();
                  close();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Archive settled expense
            </button>
          )}
        <button className="button primary" onClick={close}>
          Done
        </button>
      </div>
    </Modal>
  );
}
