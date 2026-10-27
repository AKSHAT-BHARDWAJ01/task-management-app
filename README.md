<div align="center">

<img src="frontend/favicon.ico" alt="TaskFlow Logo" width="90"/>


# TaskFlow

### Modern Full-Stack Task Management Application

A clean and responsive task management application built with **React** and **FastAPI**. Local development uses **SQLite**. Production uses **Supabase PostgreSQL**.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-Local-003B57?logo=sqlite&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-4169E1?logo=postgresql&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)

</div>

---

# ✨ Features

- ✅ Create new tasks
- 📝 Edit existing tasks
- 🗑 Delete tasks
- 📋 View all tasks
- 🔄 Update task status
- 📱 Responsive UI
- ⚡ FastAPI REST API
- ✔ Input validation
- 🚨 Proper error handling
- 📖 Interactive Swagger Documentation

---

# 📸 Screenshots

## Dashboard

<img width="1279" height="674" alt="Screenshot 2026-07-16 175207" src="https://github.com/user-attachments/assets/b11adc9d-19fe-4d89-a5f5-4a502726b60c" />

## Add Task

<img width="1267" height="677" alt="Screenshot 2026-07-16 183141" src="https://github.com/user-attachments/assets/72ab3669-38d1-4c44-afde-a8bec6979978" />

## API Documentation

<img width="1267" height="679" alt="Screenshot 2026-07-16 183254" src="https://github.com/user-attachments/assets/cefbc630-602d-413c-bc38-9fc2c5b39bb5" />


## 🌐 Live Demo

**Live Application:**  
https://task-manager-frontend-self-chi.vercel.app/




https://github.com/user-attachments/assets/04e0a7fd-6170-48f3-be6d-4c1dd7a693bc









---

# 🛠 Tech Stack

## Frontend

- React.js
- Vite
- Tailwind CSS
- Axios

## Backend

- FastAPI
- Uvicorn
- Vercel
- JWT Auth

## Database

- SQLite for local development
- Supabase PostgreSQL for production

## Tools

- Git
- Swagger UI
- Docker

---

# 📂 Project Structure

```text
TaskFlow
│
├── backend
│   ├── app
│   │   ├── config
│   │   ├── database
│   │   ├── models
│   │   ├── routers
│   │   ├── schemas
│   │   ├── services
│   │   ├── utils
│   │   └── main.py
│   │
│   ├── requirements.txt
│   └── .env
│
├── frontend
│   ├── public
│   ├── src
│   └── package.json
│
├── docs
│   ├── logo.png
│   ├── dashboard.png
│   ├── add-task.png
│   └── swagger.png
│
└── README.md
```

---

# Getting Started

## Clone Repository

```bash
git clone https://github.com/AKSHAT-BHARDWAJ01/TaskFlow.git

cd TaskFlow
```

---

# Backend Setup

```bash
cd backend

python -m venv .venv
```

### Activate Virtual Environment

Windows

```bash
.venv\Scripts\activate
```

Linux / macOS

```bash
source .venv/bin/activate
```

### Install Dependencies

```bash
pip install -r requirements.txt
```

### Run Backend

```bash
uvicorn app.main:app --reload
```

Backend URL

```
http://localhost:8000
```

Swagger API Docs

```
http://localhost:8000/docs
```

---

# Frontend Setup

```bash
cd frontend

npm install

npm run dev
```

Frontend URL

```
http://localhost:5173
```

---

# 📌 API Endpoints

| Method | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/tasks` | Get all tasks |
| GET | `/api/tasks/{id}` | Get task by ID |
| POST | `/api/tasks` | Create task |
| PUT | `/api/tasks/{id}` | Update task |
| DELETE | `/api/tasks/{id}` | Delete task |

---

# 🗃 Task Model

| Field | Type | Required |
|---------|------|----------|
| id | Integer | Auto Generated |
| title | String | ✅ |
| description | String | Optional |
| status | pending / in-progress / completed | ✅ |
| createdAt | DateTime | Auto Generated |
| updatedAt | DateTime | Auto Updated |

---

# 💡 Technical Decisions

### FastAPI

- High-performance backend
- Automatic Swagger documentation
- Built-in request validation
- Easy REST API development

### React

- Component-based architecture
- Fast development with Vite
- Reusable UI components

### SQLite

- Default database when `DATABASE_URL` is not set
- No separate database server for local development

### Supabase PostgreSQL

- Production database on Vercel
- Set `DATABASE_URL` to the Supabase connection string
- SQLite is not used on Vercel

### Layered Architecture

The backend follows a layered architecture:

```
Client
   ↓
Routers
   ↓
Services
   ↓
Database
```

This separation improves maintainability and scalability.

---

# ✅ Validation & Error Handling

- Required field validation
- Invalid status validation
- Meaningful error messages
- Proper HTTP status codes

| Status Code | Meaning |
|--------------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 404 | Task Not Found |
| 500 | Internal Server Error |

---

# 🚀 Future Improvements


- Notifications
- Mobile App
- Web Socket
- CI/CD Pipeline
- Kubernetes Support

---

<div align="center">

### ⭐ If you found this project helpful, consider giving it a star!

Made with ❤️ by **Akshat Bhardwaj**

[GitHub](https://github.com/AKSHAT-BHARDWAJ01) • [LinkedIn](https://www.linkedin.com/in/akshat-bhardwaj-84bb52271/)

</div>

---

# License

This project is licensed under the MIT License.
