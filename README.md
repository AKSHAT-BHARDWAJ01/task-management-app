# task-management-app
A full-stack task management application
<div align="center">

<div align="center">

# ✅ TaskFlow

### A Modern Full-Stack Task Management Application

Manage tasks efficiently with a clean and responsive interface powered by **React**, **FastAPI**, and **SQLite**.

![TaskFlow Banner](./docs/banner.png)

</div>

---

# ✨ Features

- Create new tasks
- View all tasks
- Edit existing tasks
- Delete tasks
- Track task status
- Responsive modern UI
- RESTful API
- Input validation
- Error handling
- Loading states
- Swagger API Documentation

---

# 🛠 Tech Stack

## Frontend

- React.js
- Vite
- Tailwind CSS
- Axios

## Backend

- FastAPI
- SQLAlchemy
- Pydantic
- Uvicorn

## Database

- SQLite

## Development Tools

- Git
- GitHub
- VS Code

---

# 📁 Project Structure

```text
taskflow/
│
├── backend/
│   ├── app/
│   │   ├── config/
│   │   ├── database/
│   │   ├── models/
│   │   ├── routers/
│   │   ├── schemas/
│   │   ├── services/
│   │   ├── utils/
│   │   └── main.py
│   │
│   ├── requirements.txt
│   └── .env
│
├── frontend/
│   ├── public/
│   ├── src/
│   └── package.json
│
├── docs/
│
└── README.md
```

---

# 🚀 Getting Started

## Prerequisites

- Python 3.11+
- Node.js 18+
- Git

---

# Backend Setup

Navigate to backend

```bash
cd backend
```

Create virtual environment

```bash
python -m venv .venv
```

Activate

Windows

```bash
.venv\Scripts\activate
```

Linux / macOS

```bash
source .venv/bin/activate
```

Install dependencies

```bash
pip install -r requirements.txt
```

Run server

```bash
uvicorn app.main:app --reload
```

Backend will run at

```
http://localhost:8000
```

Swagger Documentation

```
http://localhost:8000/docs
```

---

# Frontend Setup

Navigate to frontend

```bash
cd frontend
```

Install packages

```bash
npm install
```

Run

```bash
npm run dev
```

Frontend

```
http://localhost:5173
```

---

# API Endpoints

## Get all tasks

```http
GET /api/tasks
```

---

## Get task

```http
GET /api/tasks/{id}
```

---

## Create task

```http
POST /api/tasks
```

Example

```json
{
  "title": "Build README",
  "description": "Complete project documentation",
  "status": "pending"
}
```

---

## Update task

```http
PUT /api/tasks/{id}
```

---

## Delete task

```http
DELETE /api/tasks/{id}
```

---

# Task Model

| Field | Type | Required |
|---------|------|----------|
| id | Integer | Auto |
| title | String | ✅ |
| description | String | Optional |
| status | pending / in-progress / completed | ✅ |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |

---

# Technical Decisions

## FastAPI

Chosen for

- High performance
- Automatic Swagger documentation
- Easy validation with Pydantic
- Clean API development

---

## React

Chosen because

- Component-based architecture
- Easy state management
- Fast development with Vite

---

## SQLite

Chosen because

- Lightweight
- No installation required
- Perfect for small applications and take-home assignments

---

## Layered Architecture

The backend follows a layered architecture.

```
Client

↓

Router

↓

Service

↓

Database
```

This improves readability, scalability, and maintainability.

---

# Validation

The application validates

- Required title
- Allowed task status
- Invalid task IDs
- Empty requests
- Invalid data types

---

# Error Handling

Returns proper HTTP status codes

| Code | Meaning |
|------|----------|
|200|Success|
|201|Created|
|400|Bad Request|
|404|Task Not Found|
|500|Internal Server Error|

---

# Future Improvements

- User Authentication
- Task Categories
- Search & Filtering
- Pagination
- Dark/Light Theme
- Docker Deployment
- Unit Testing
- CI/CD
- Notifications

---

# Git Workflow

The project was developed with meaningful commits showing incremental progress.

Examples

```
Initialize FastAPI backend

Configure SQLite database

Implement CRUD API endpoints

Add task validation

Initialize React frontend

Connect frontend with backend

Improve UI styling

Write project documentation
```

---

# Author

**Akshat Bhardwaj**

GitHub

```
https://github.com/AKSHAT-BHARDWAJ01
```

LinkedIn

```
https://linkedin.com/in/akshat-bhardwaj-84bb52271/
```

---

# License

This project was developed as part of a Full Stack Developer technical assessment.
