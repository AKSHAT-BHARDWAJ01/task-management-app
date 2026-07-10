const API_URL = 'http://localhost:5000/api/tasks';

// Load tasks when page loads
document.addEventListener('DOMContentLoaded', loadTasks);

async function loadTasks() {
    try {
        const response = await fetch(API_URL);
        const tasks = await response.json();
        displayTasks(tasks);
    } catch (error) {
        showError('Failed to load tasks. Is the server running?');
    }
}

function displayTasks(tasks) {
    const taskList = document.getElementById('taskList');
    
    if (tasks.length === 0) {
        taskList.innerHTML = '<div class="loading">✨ No tasks yet. Add one above!</div>';
        return;
    }

    taskList.innerHTML = tasks.map(task => `
        <div class="task-item ${task.status === 'completed' ? 'completed' : ''}">
            <div class="task-info">
                <div class="task-title">${task.title}</div>
                <span class="task-status status-${task.status}">${task.status}</span>
                <small style="color: #999; font-size: 11px;">
                    Created: ${new Date(task.createdAt).toLocaleDateString()}
                </small>
            </div>
            <div class="task-actions">
                ${task.status !== 'completed' ? `
                    <button class="btn-complete" onclick="updateTask(${task.id}, 'completed')">
                        ✅ Complete
                    </button>
                ` : `
                    <button class="btn-complete" onclick="updateTask(${task.id}, 'pending')">
                        🔄 Reopen
                    </button>
                `}
                <button class="btn-delete" onclick="deleteTask(${task.id})">🗑️</button>
            </div>
        </div>
    `).join('');
}

async function addTask() {
    const titleInput = document.getElementById('taskInput');
    const statusSelect = document.getElementById('statusSelect');
    
    const title = titleInput.value.trim();
    const status = statusSelect.value;

    if (!title) {
        alert('Please enter a task title!');
        return;
    }

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, status })
        });

        if (response.ok) {
            titleInput.value = '';
            loadTasks();
        } else {
            const error = await response.json();
            alert('Error: ' + error.error);
        }
    } catch (error) {
        alert('Failed to add task. Is the server running?');
    }
}

async function updateTask(id, status) {
    try {
        const response = await fetch(`${API_URL}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });

        if (response.ok) {
            loadTasks();
        } else {
            alert('Failed to update task');
        }
    } catch (error) {
        alert('Failed to update task. Is the server running?');
    }
}

async function deleteTask(id) {
    if (!confirm('Are you sure you want to delete this task?')) return;

    try {
        const response = await fetch(`${API_URL}/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            loadTasks();
        } else {
            alert('Failed to delete task');
        }
    } catch (error) {
        alert('Failed to delete task. Is the server running?');
    }
}

function showError(message) {
    const taskList = document.getElementById('taskList');
    taskList.innerHTML = `<div class="error">❌ ${message}</div>`;
}