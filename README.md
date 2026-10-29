# StockFlow MVP (Node + Express + Prisma + React + Tailwind)

Multi-tenant inventory app. Every record is scoped to the logged-in user's organization.

## Run (needs Node 18+)
```bash
# 1) Backend  -> http://localhost:4000
cd backend
cp .env.example .env
npm install
npx prisma migrate dev --name init
npm run dev

# 2) Frontend -> http://localhost:5173   (new terminal)
cd frontend
npm install
npm run dev
```
Open http://localhost:5173, sign up, add products.

## Switch to PostgreSQL / MySQL
In `backend/prisma/schema.prisma` change `provider = "sqlite"` to `"postgresql"` (or `"mysql"`),
set `DATABASE_URL` in `.env`, then run `npx prisma migrate dev`.

## API (JWT in `Authorization: Bearer <token>`)
POST /api/auth/signup | POST /api/auth/login | GET /api/me
GET/PUT /api/settings
GET /api/dashboard
GET/POST /api/products | PUT/DELETE /api/products/:id | POST /api/products/:id/adjust
