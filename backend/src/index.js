require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
app.use(cors());
app.use(express.json());

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => { console.error(e); res.status(500).json({ error: 'Server error' }); });

function auth(req, res, next) {
  try {
    req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET);
    next();
  } catch { res.status(401).json({ error: 'Please log in again.' }); }
}
const sign = (u) => jwt.sign({ id: u.id, orgId: u.orgId, email: u.email }, SECRET, { expiresIn: '7d' });
const numOrNull = (v) => (v === '' || v == null ? null : Number(v));

/* ---- Auth ---- */
app.post('/api/auth/signup', wrap(async (req, res) => {
  const { email, password, orgName } = req.body;
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email.' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (!orgName || !orgName.trim()) return res.status(400).json({ error: 'Organization name is required.' });
  const e = email.trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { email: e } }))
    return res.status(409).json({ error: 'That email is already registered.' });
  const org = await prisma.organization.create({ data: { name: orgName.trim() } });
  const user = await prisma.user.create({ data: { email: e, passwordHash: await bcrypt.hash(password, 10), orgId: org.id } });
  res.json({ token: sign(user), user: { email: user.email, orgName: org.name } });
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email: (email || '').trim().toLowerCase() }, include: { org: true } });
  if (!user || !(await bcrypt.compare(password || '', user.passwordHash)))
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  res.json({ token: sign(user), user: { email: user.email, orgName: user.org.name } });
}));

app.get('/api/me', auth, wrap(async (req, res) => {
  const org = await prisma.organization.findUnique({ where: { id: req.user.orgId } });
  res.json({ email: req.user.email, orgName: org.name });
}));

/* ---- Settings ---- */
app.get('/api/settings', auth, wrap(async (req, res) => {
  const o = await prisma.organization.findUnique({ where: { id: req.user.orgId } });
  res.json({ defaultLowStock: o.defaultLowStock });
}));
app.put('/api/settings', auth, wrap(async (req, res) => {
  const n = parseInt(req.body.defaultLowStock, 10);
  if (!Number.isInteger(n) || n < 0) return res.status(400).json({ error: 'Enter a whole number, 0 or more.' });
  await prisma.organization.update({ where: { id: req.user.orgId }, data: { defaultLowStock: n } });
  res.json({ defaultLowStock: n });
}));

/* ---- Products (always scoped by orgId) ---- */
function parseProduct(b) {
  const name = (b.name || '').trim(), sku = (b.sku || '').trim(), quantity = Number(b.quantity ?? 0);
  if (!name || !sku) return { error: 'Name and SKU are required.' };
  if (!Number.isInteger(quantity) || quantity < 0) return { error: 'Quantity must be a whole number, 0 or more.' };
  const t = numOrNull(b.lowStockThreshold);
  if (t !== null && (!Number.isInteger(t) || t < 0)) return { error: 'Threshold must be a whole number, 0 or more.' };
  return { data: { name, sku, description: (b.description || '').trim() || null, quantity,
    costPrice: numOrNull(b.costPrice), sellingPrice: numOrNull(b.sellingPrice), lowStockThreshold: t } };
}

app.get('/api/products', auth, wrap(async (req, res) => {
  const q = (req.query.q || '').trim();
  const where = { orgId: req.user.orgId };
  if (q) where.OR = [{ name: { contains: q } }, { sku: { contains: q } }];
  const [items, org] = await Promise.all([
    prisma.product.findMany({ where, orderBy: { updatedAt: 'desc' } }),
    prisma.organization.findUnique({ where: { id: req.user.orgId } }),
  ]);
  res.json(items.map((p) => ({ ...p, isLow: p.quantity <= (p.lowStockThreshold ?? org.defaultLowStock) })));
}));

app.post('/api/products', auth, wrap(async (req, res) => {
  const { data, error } = parseProduct(req.body);
  if (error) return res.status(400).json({ error });
  if (await prisma.product.findUnique({ where: { orgId_sku: { orgId: req.user.orgId, sku: data.sku } } }))
    return res.status(409).json({ error: 'That SKU is already used by another product.' });
  res.json(await prisma.product.create({ data: { ...data, orgId: req.user.orgId, lastUpdatedBy: req.user.email } }));
}));

app.put('/api/products/:id', auth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { data, error } = parseProduct(req.body);
  if (error) return res.status(400).json({ error });
  const clash = await prisma.product.findFirst({ where: { orgId: req.user.orgId, sku: data.sku, NOT: { id } } });
  if (clash) return res.status(409).json({ error: 'That SKU is already used by another product.' });
  const r = await prisma.product.updateMany({ where: { id, orgId: req.user.orgId }, data: { ...data, lastUpdatedBy: req.user.email } });
  if (!r.count) return res.status(404).json({ error: 'Product not found.' });
  res.json({ ok: true });
}));

app.post('/api/products/:id/adjust', auth, wrap(async (req, res) => {
  const id = Number(req.params.id), delta = Number(req.body.delta);
  if (!Number.isInteger(delta)) return res.status(400).json({ error: 'Enter a whole number.' });
  const p = await prisma.product.findFirst({ where: { id, orgId: req.user.orgId } });
  if (!p) return res.status(404).json({ error: 'Product not found.' });
  if (p.quantity + delta < 0) return res.status(400).json({ error: `Stock can’t go below 0. Current stock is ${p.quantity}.` });
  res.json(await prisma.product.update({ where: { id }, data: { quantity: p.quantity + delta, lastUpdatedBy: req.user.email } }));
}));

app.delete('/api/products/:id', auth, wrap(async (req, res) => {
  const r = await prisma.product.deleteMany({ where: { id: Number(req.params.id), orgId: req.user.orgId } });
  if (!r.count) return res.status(404).json({ error: 'Product not found.' });
  res.json({ ok: true });
}));

/* ---- Dashboard ---- */
app.get('/api/dashboard', auth, wrap(async (req, res) => {
  const [items, org] = await Promise.all([
    prisma.product.findMany({ where: { orgId: req.user.orgId } }),
    prisma.organization.findUnique({ where: { id: req.user.orgId } }),
  ]);
  const withT = items.map((p) => ({ ...p, threshold: p.lowStockThreshold ?? org.defaultLowStock }));
  res.json({
    totalProducts: items.length,
    totalUnits: items.reduce((s, p) => s + p.quantity, 0),
    lowStock: withT.filter((p) => p.quantity <= p.threshold)
      .map(({ name, sku, quantity, threshold, id }) => ({ id, name, sku, quantity, threshold })),
  });
}));

app.listen(process.env.PORT || 4000, () => console.log('StockFlow API on :' + (process.env.PORT || 4000)));
