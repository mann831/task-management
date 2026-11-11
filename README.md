# Taskflow — Employee Task Management

A practical full-stack demo for assigning work and tracking progress. The admin creates tasks for employees; employees see their assigned work and update its status. New assignments are sent in real time using Socket.IO and displayed as browser notifications when the recipient has granted permission.

## Stack

- **Frontend:** React, Vite, Tailwind CSS
- **API:** Express, MongoDB, Mongoose
- **Auth and middleware:** JWT authentication, role authorization, request validation
- **Live updates:** Socket.IO, with the browser Web Notification API

## Run locally

Requirements: Node.js 18+ and Docker (or a local MongoDB instance).

1. Start MongoDB:

   ```sh
   docker compose up -d mongo
   ```

2. Configure the API:

   ```sh
   Copy-Item server\.env.example server\.env
   ```

   Update `JWT_SECRET` in `server/.env` to a long, random value before using this beyond a local demo.

3. Install dependencies from the project root and seed demo data:

   ```sh
   npm install
   npm install --prefix server
   npm install --prefix client
   npm run seed
   ```

4. Start the frontend and API:

   ```sh
   npm run dev
   ```

   Open `http://localhost:5173`.

## Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@taskflow.demo` | `password123` |
| Employee | `jordan@taskflow.demo` | `password123` |

Seeded tasks are created only when the task collection is empty. The seed command ensures these two demo accounts exist.

## Practical flow

1. Sign in as the admin and choose **Assign task**.
2. Choose Jordan Lee and assign the task.
3. Sign in as the employee in another browser profile or private window.
4. Choose **Enable alerts** in that employee session. Browser notifications require permission and a secure context; `localhost` is supported for local development.
5. View the task in the employee task board and change its status.

Task lists and counts update immediately for the assigning employee session. The employee receives a Socket.IO event as soon as the task is assigned; if the tab is closed, the task remains available on their next login. This demo uses browser notifications while the app is open, not background push notifications.

## API overview

- `POST /api/auth/login` — authenticate and return a JWT.
- `GET /api/auth/me` — get the authenticated user.
- `GET /api/employees` — list employees (authenticated).
- `GET /api/tasks` — admins see all tasks; employees see their own.
- `POST /api/tasks` — admin-only task assignment.
- `DELETE /api/tasks/:id` — admin-only deletion; an assigned employee's open dashboard is updated in real time.
- `PATCH /api/tasks/:id/status` — update task status; employees can update only tasks assigned to them.
- `GET /api/health` — API health check.

The API uses `authenticate` middleware for JWT identity and `requireRole("admin")` for admin-only assignment. Socket.IO connections are also authenticated using the session token and join a user-specific room.
