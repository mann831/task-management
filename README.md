# Taskflow — Employee Task Management

A practical full-stack demo for assigning work and tracking progress. The admin creates tasks for employees; employees see their assigned work and update its status. New assignments are sent in real time using Socket.IO and displayed as browser notifications when the recipient has granted permission.

## Stack

- **Frontend:** React, Vite, Tailwind CSS
- **API:** Express, MongoDB, Mongoose
- **Auth and middleware:** JWT authentication, role authorization, request validation
- **Live updates:** Socket.IO, with the browser Web Notification API

## Quick setup on Windows 11

Copy or download the complete project folder onto the computer, then double-click `setup.bat`. It checks for Docker Desktop, installs it with `winget` if needed, creates a local `.env` with a random JWT secret, and uses Docker Compose to build and start the frontend, API, and MongoDB containers. It also creates the demo accounts and sample tasks.

Open `http://localhost:5173` when setup finishes. Docker Desktop must be running; its installation may require administrator approval, WSL 2, or a Windows restart. If prompted to restart, do so and double-click `setup.bat` again. The computer needs an internet connection to install Docker Desktop and download the container images. `.env` is local and git-ignored; keep it if you want to preserve the same JWT secret on later runs.

## Manual setup

Requirements: Docker Desktop with Docker Compose.

1. Create a root `.env` file containing a long, random `JWT_SECRET`:

   ```sh
   JWT_SECRET=replace-this-with-a-long-random-secret
   ```

2. Build and start the application:

   ```sh
   docker compose up -d --build mongo server client
   docker compose --profile setup run --rm seed
   ```

3. Open `http://localhost:5173`. Stop the containers with `docker compose down`; the MongoDB data remains in its Docker volume.

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
