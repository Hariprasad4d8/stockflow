import { useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const money = (n) => (n == null ? '—' : Number(n).toFixed(2));

function Field({ label, hint, ...p }) {
  return (
    <label className="mb-3 block text-sm font-medium">
      {label}
      <input className="inp" {...p} />
      {hint && <span className="text-xs font-normal text-slate-500">{hint}</span>}
    </label>
  );
}

function Auth({ onAuth }) {
  const [signup, setSignup] = useState(false);
  const [f, setF] = useState({ orgName: '', email: '', password: '', confirm: '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (signup && f.password !== f.confirm) return setErr('Passwords don’t match.');
    try {
      const d = await api(signup ? '/auth/signup' : '/auth/login', 'POST', f);
      setToken(d.token);
      onAuth(d.user);
    } catch (x) { setErr(x.message); }
  }
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <form onSubmit={submit} className="card border-t-4 border-t-teal-700">
        <h1 className="text-3xl font-semibold">StockFlow</h1>
        <p className="mb-5 text-slate-500">{signup ? 'Create your store and start tracking stock.' : 'Log in to your inventory.'}</p>
        {signup && <Field label="Organization name" required value={f.orgName} onChange={set('orgName')} placeholder="My Test Store" />}
        <Field label="Email" type="email" required value={f.email} onChange={set('email')} />
        <Field label="Password" type="password" required minLength={6} value={f.password} onChange={set('password')} hint={signup ? 'At least 6 characters' : ''} />
        {signup && <Field label="Confirm password" type="password" required value={f.confirm} onChange={set('confirm')} />}
        <p className="min-h-5 text-sm font-medium text-orange-700" role="alert">{err}</p>
        <button className="btn w-full">{signup ? 'Create account' : 'Log in'}</button>
        <p className="mt-4 text-sm text-slate-500">
          {signup ? 'Already have an account?' : 'New here?'}{' '}
          <button type="button" className="text-teal-700 underline" onClick={() => { setSignup(!signup); setErr(''); }}>
            {signup ? 'Log in' : 'Create an account'}
          </button>
        </p>
      </form>
    </div>
  );
}

function Dashboard({ goForm }) {
  const [d, setD] = useState(null);
  useEffect(() => { api('/dashboard').then(setD); }, []);
  if (!d) return <p>Loading…</p>;
  const Stat = ({ v, l, warn }) => (
    <div className={`card border-l-4 ${warn ? 'border-l-orange-600' : 'border-l-teal-700'}`}>
      <div className={`text-4xl font-semibold ${warn && v ? 'text-orange-600' : ''}`}>{v}</div>
      <div className="text-sm text-slate-500">{l}</div>
    </div>
  );
  return (
    <>
      <h1 className="mb-4 text-3xl font-semibold">Dashboard</h1>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat v={d.totalProducts} l="Products" />
        <Stat v={d.totalUnits} l="Units on hand" />
        <Stat v={d.lowStock.length} l="Low stock" warn />
      </div>
      <div className="card overflow-x-auto">
        <h2 className="mb-2 text-lg font-semibold">Low stock items</h2>
        {!d.totalProducts ? (
          <p className="text-slate-500">No products yet. <button className="text-teal-700 underline" onClick={() => goForm(null)}>Add your first product</button> to see stock here.</p>
        ) : !d.lowStock.length ? (
          <p className="text-slate-500">Nothing is running low. Every product is above its threshold.</p>
        ) : (
          <table className="w-full min-w-[480px] text-left">
            <thead className="text-sm text-slate-500"><tr><th className="p-2">Name</th><th className="p-2">SKU</th><th className="p-2 text-right">On hand</th><th className="p-2 text-right">Threshold</th></tr></thead>
            <tbody>{d.lowStock.map((p) => (
              <tr key={p.id} className="border-t"><td className="p-2">{p.name}</td><td className="p-2">{p.sku}</td>
                <td className="p-2 text-right font-semibold text-orange-600">{p.quantity}</td><td className="p-2 text-right">{p.threshold}</td></tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  );
}

function Products({ goForm }) {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const load = () => api('/products?q=' + encodeURIComponent(q)).then(setItems).catch((e) => setMsg(e.message));
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [q]);
  async function remove(p) {
    if (!window.confirm(`Delete “${p.name}” (${p.sku})? This can’t be undone.`)) return;
    await api('/products/' + p.id, 'DELETE'); load();
  }
  async function adjust(p) {
    const v = window.prompt(`Adjust stock for ${p.name} (now ${p.quantity}). Enter +N or -N:`);
    if (v === null || v === '') return;
    try { await api(`/products/${p.id}/adjust`, 'POST', { delta: Number(v) }); load(); } catch (e) { alert(e.message); }
  }
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-3xl font-semibold">Products</h1>
        <input className="inp !mt-0 max-w-xs" type="search" placeholder="Search by name or SKU" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" onClick={() => goForm(null)}>Add product</button>
      </div>
      <p className="text-orange-700">{msg}</p>
      <div className="card overflow-x-auto">
        {!items.length ? (
          <p className="text-slate-500">{q ? 'No products match your search.' : 'No products yet. Select Add product to create one.'}</p>
        ) : (
          <table className="w-full min-w-[600px] text-left">
            <thead className="bg-slate-50 text-sm text-slate-500"><tr><th className="p-2">Name</th><th className="p-2">SKU</th><th className="p-2 text-right">Quantity</th><th className="p-2">Status</th><th className="p-2 text-right">Selling price</th><th /></tr></thead>
            <tbody>{items.map((p) => (
              <tr key={p.id} className="border-t hover:bg-slate-50">
                <td className="p-2">{p.name}</td><td className="p-2">{p.sku}</td><td className="p-2 text-right">{p.quantity}</td>
                <td className="p-2"><span className={`rounded-full px-3 py-0.5 text-xs font-semibold ${p.isLow ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>{p.isLow ? 'Low stock' : 'In stock'}</span></td>
                <td className="p-2 text-right">{money(p.sellingPrice)}</td>
                <td className="space-x-1 whitespace-nowrap p-2 text-right">
                  <button className="btn-alt" onClick={() => adjust(p)}>Adjust</button>
                  <button className="btn-alt" onClick={() => goForm(p)}>Edit</button>
                  <button className="btn-alt" onClick={() => remove(p)}>Delete</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  );
}

function ProductForm({ product, onDone }) {
  const p = product || {};
  const [f, setF] = useState({
    name: p.name ?? '', sku: p.sku ?? '', description: p.description ?? '', quantity: p.quantity ?? 0,
    lowStockThreshold: p.lowStockThreshold ?? '', costPrice: p.costPrice ?? '', sellingPrice: p.sellingPrice ?? '',
  });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    try { await api(p.id ? '/products/' + p.id : '/products', p.id ? 'PUT' : 'POST', f); onDone(); }
    catch (x) { setErr(x.message); }
  }
  return (
    <>
      <h1 className="mb-4 text-3xl font-semibold">{p.id ? 'Edit product' : 'Add product'}</h1>
      <form onSubmit={submit} className="card">
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Name" required value={f.name} onChange={set('name')} />
          <Field label="SKU" required value={f.sku} onChange={set('sku')} hint="Must be unique in your store" />
        </div>
        <label className="mb-3 block text-sm font-medium">Description (optional)
          <textarea className="inp" rows={2} value={f.description} onChange={set('description')} /></label>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Quantity on hand" type="number" min="0" step="1" required value={f.quantity} onChange={set('quantity')} />
          <Field label="Low stock threshold" type="number" min="0" step="1" value={f.lowStockThreshold} onChange={set('lowStockThreshold')} hint="Leave empty to use the store default" />
          <Field label="Cost price" type="number" min="0" step="0.01" value={f.costPrice} onChange={set('costPrice')} />
          <Field label="Selling price" type="number" min="0" step="0.01" value={f.sellingPrice} onChange={set('sellingPrice')} />
        </div>
        <p className="min-h-5 text-sm font-medium text-orange-700" role="alert">{err}</p>
        <div className="flex gap-2"><button className="btn">Save product</button>
          <button type="button" className="btn-alt" onClick={onDone}>Cancel</button></div>
      </form>
    </>
  );
}

function Settings() {
  const [v, setV] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => { api('/settings').then((s) => setV(s.defaultLowStock)); }, []);
  async function save(e) {
    e.preventDefault();
    try { await api('/settings', 'PUT', { defaultLowStock: v }); setMsg('Settings saved.'); } catch (x) { setMsg(x.message); }
  }
  return (
    <>
      <h1 className="mb-4 text-3xl font-semibold">Settings</h1>
      <form onSubmit={save} className="card max-w-md">
        <Field label="Default low stock threshold" type="number" min="0" step="1" required value={v} onChange={(e) => setV(e.target.value)} hint="Used for products with no threshold of their own" />
        <p className="min-h-5 text-sm font-medium text-teal-700">{msg}</p>
        <button className="btn">Save settings</button>
      </form>
    </>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!getToken());
  const [view, setView] = useState('dashboard');
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    if (getToken()) api('/me').then(setUser).catch(() => setToken(null)).finally(() => setReady(true));
  }, []);
  if (!ready) return null;
  if (!user) return <div className="px-4"><Auth onAuth={setUser} /></div>;

  const goForm = (p) => { setEditing(p); setView('form'); };
  const logout = () => { setToken(null); setUser(null); setView('dashboard'); };
  const tab = (k, l) => (
    <button key={k} onClick={() => setView(k)}
      className={`rounded-lg px-4 py-1.5 text-sm font-medium ${view === k || (view === 'form' && k === 'products') ? 'bg-teal-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{l}</button>
  );
  return (
    <div className="mx-auto max-w-4xl px-4 pb-12">
      <nav className="sticky top-2 z-10 my-4 flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
        <span className="mr-auto text-xl font-semibold">{user.orgName}</span>
        {tab('dashboard', 'Dashboard')}{tab('products', 'Products')}{tab('settings', 'Settings')}
        <button onClick={logout} className="rounded-lg px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-100">Log out</button>
      </nav>
      <main className="mt-6">
        {view === 'dashboard' && <Dashboard goForm={goForm} />}
        {view === 'products' && <Products goForm={goForm} />}
        {view === 'form' && <ProductForm product={editing} onDone={() => setView('products')} />}
        {view === 'settings' && <Settings />}
      </main>
    </div>
  );
}
