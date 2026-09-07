import React, { useState } from "react";
import { confirmPickup, getQuote, storePackage } from "./api";

const emptyStore = {
  agentUsername: "", customerUsername: "", packageName: "", widthCm: "", heightCm: "",
  breadthCm: "", weightGrams: "", hasFragileItems: false
};
const emptyRetrieve = { username: "", lockerId: "", pickupCode: "" };

const money = (cents) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
    .format((Number(cents) || 0) / 100);

function Field({ label, children, hint }) {
  return <label className="field">
    <span>{label}</span>{children}{hint && <small>{hint}</small>}
  </label>;
}

function ErrorBox({ error }) {
  return error ? <div className="error">{error}</div> : null;
}

function StorePage() {
  const [form, setForm] = useState(emptyStore);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const update = (k, v) => setForm(x => ({ ...x, [k]: v }));

  async function submit(e) {
    e.preventDefault(); setError(""); setResult(null); setLoading(true);
    try {
      // 1. Generate a unique UUID for this specific transaction attempt
      const idempotencyKey = crypto.randomUUID();

      console.log(form)
      
      const payload = {
        // Replace this placeholder mapping with your real username -> customer UUID lookup.
        // customerId: form.username,
        storedByUsername: form.agentUsername,
        recipientUsername: form.customerUsername,
        packageName: form.packageName.trim(),
        widthCm: Number(form.widthCm),
        heightCm: Number(form.heightCm),
        breadthCm: Number(form.breadthCm),
        weightGrams: Number(form.weightGrams),
        hasFragileItems: form.hasFragileItems
      };
      setResult(await storePackage(payload, idempotencyKey));
      setForm(emptyStore);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  return <section className="page-grid">
    <div className="card">
      <div className="eyebrow">DELIVERY AGENT</div>
      <h1>Store a package</h1>
      <p className="muted">Enter the customer and package details. The system assigns the smallest compatible locker.</p>

      <form onSubmit={submit}>
        <Field label="Agent username">
          <input value={form.agentUsername} onChange={e => update("agentUsername", e.target.value)}
            placeholder="e.g. john.doe" required />
        </Field>

        <Field label="Customer username">
          <input value={form.customerUsername} onChange={e => update("customerUsername", e.target.value)}
            placeholder="e.g. john.doe" required />
        </Field>

        <Field label="Package name">
          <input value={form.packageName} onChange={e => update("packageName", e.target.value)}
            placeholder="e.g. Laptop accessories" required />
        </Field>

        <div className="three-cols">
          <Field label="Width (cm)">
            <input type="number" min="1" value={form.widthCm}
              onChange={e => update("widthCm", e.target.value)} required />
          </Field>
          <Field label="Height (cm)">
            <input type="number" min="1" value={form.heightCm}
              onChange={e => update("heightCm", e.target.value)} required />
          </Field>
          <Field label="Breadth (cm)">
            <input type="number" min="1" value={form.breadthCm}
              onChange={e => update("breadthCm", e.target.value)} required />
          </Field>
        </div>

        <Field label="Weight (grams)">
          <input type="number" min="1" value={form.weightGrams}
            onChange={e => update("weightGrams", e.target.value)} required />
        </Field>

        <label className="check">
          <input type="checkbox" checked={form.hasFragileItems}
            onChange={e => update("hasFragileItems", e.target.checked)} />
          <span>Package contains fragile items</span>
        </label>

        <ErrorBox error={error} />
        <button disabled={loading}>{loading ? "Storing…" : "Store Package"}</button>
      </form>
    </div>

    {result && <div className="card result-card success">
      <div className="status-icon">✓</div>
      <div className="eyebrow">PACKAGE STORED</div>
      <h2>Ready for pickup</h2>

      <div className="result-list">
        <div><span>Package ID</span><strong>{result.packageId}</strong></div>
        <div><span>Locker ID</span><strong>{result.lockerId}</strong></div>
        <div><span>Locker size</span><strong>{result.lockerSize}</strong></div>
      </div>

      <div className="pickup-code">
        <span>Pickup code</span><strong>{result.pickupCode}</strong>
      </div>
      <p className="warning">Share the pickup code only through the trusted delivery workflow.</p>
    </div>}
  </section>;
}

function RetrievePage() {
  const [form, setForm] = useState(emptyRetrieve);
  const [quote, setQuote] = useState(null);
  const [confirmed, setConfirmed] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const update = (k, v) => setForm(x => ({ ...x, [k]: v }));

  async function quotePackage(e) {
    e.preventDefault(); setError(""); setConfirmed(null); setQuote(null); setLoading(true);
    try {
      setQuote(await getQuote({
        receivedByUsername: form.username,
        lockerId: form.lockerId.trim(),
        pickupCode: form.pickupCode.trim()
      }));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function confirm() {
    setError(""); setLoading(true);
    try {
      const idempotencyKey = crypto.randomUUID();
      setConfirmed(await confirmPickup({
        receivedByUsername: form.username,
        lockerId: form.lockerId.trim(),
        pickupCode: form.pickupCode.trim(),
        pickupConfirmed: true
      }, idempotencyKey));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  function reset() {
    setForm(emptyRetrieve); setQuote(null); setConfirmed(null); setError("");
  }

  return <section className="page-grid">
    <div className="card">
      <div className="eyebrow">CUSTOMER</div>
      <h1>Retrieve your package</h1>
      <p className="muted">Get a current storage quote first, then confirm pickup.</p>

      <form onSubmit={quotePackage}>
        <Field label="Customer username">
          <input value={form.username} onChange={e => update("username", e.target.value)}
            placeholder="e.g. john.doe" required />
        </Field>

        <Field label="Locker ID">
          <input value={form.lockerId} onChange={e => update("lockerId", e.target.value)}
            placeholder="Locker UUID" required />
        </Field>

        <Field label="Pickup code" hint="6-digit code">
          <input inputMode="numeric" maxLength="6" pattern="[0-9]{6}"
            value={form.pickupCode}
            onChange={e => update("pickupCode", e.target.value.replace(/\D/g, ""))}
            placeholder="123456" required />
        </Field>

        <ErrorBox error={error} />
        {!quote && !confirmed &&
          <button disabled={loading}>{loading ? "Checking…" : "Get Quote"}</button>}
      </form>
    </div>

    {quote && !confirmed && <div className="card quote-card">
      <div className="eyebrow">CURRENT QUOTE</div>
      <h2>Review before pickup</h2>
      <div className="money-row"><span>Storage charges</span><strong>{money(quote.calculatedChargesCents)}</strong></div>
      <div className="money-row"><span>Wallet balance</span><strong>{money(quote.walletBalanceCents)}</strong></div>

      {quote.walletBalanceCents < quote.calculatedChargesCents &&
        <div className="error">Insufficient wallet balance. Recharge the wallet before confirming pickup.</div>}

      <div className="actions">
        <button disabled={loading || quote.walletBalanceCents < quote.calculatedChargesCents}
          onClick={confirm}>{loading ? "Confirming…" : "Confirm Pickup"}</button>
        <button className="secondary" onClick={reset}>Cancel</button>
      </div>
    </div>}

    {confirmed && <div className="card result-card success">
      <div className="status-icon">✓</div>
      <div className="eyebrow">PICKUP CONFIRMED</div>
      <h2>Package collected</h2>

      <div className="collected-package">
        <span>Package Name</span>
        <strong>{confirmed.packageName}</strong>
        <small>Collected</small>
      </div>

      <div className="result-list">
        <div><span>Charges deducted</span><strong>{money(confirmed.chargedAmountCents)}</strong></div>
        <div><span>Updated wallet balance</span><strong>{money(confirmed.walletBalanceCents)}</strong></div>
        <div><span>Locker released</span><strong>{confirmed.lockerReleased ? "Yes" : "No"}</strong></div>
      </div>
      <button onClick={reset}>Retrieve Another Package</button>
    </div>}
  </section>;
}

export default function App() {
  const [tab, setTab] = useState("store");
  return <main className="app-shell">
    <header className="topbar">
      <div><div className="brand">SMART PACKAGE</div><div className="brand-sub">Storage & pickup</div></div>
      <nav>
        <button className={tab === "store" ? "nav-active" : "nav-button"} onClick={() => setTab("store")}>Delivery Agent</button>
        <button className={tab === "retrieve" ? "nav-active" : "nav-button"} onClick={() => setTab("retrieve")}>Customer</button>
      </nav>
    </header>
    <div className="content">{tab === "store" ? <StorePage /> : <RetrievePage />}</div>
  </main>;
}