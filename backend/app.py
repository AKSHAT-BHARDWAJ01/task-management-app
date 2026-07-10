from flask import Flask, jsonify, request
from flask_cors import CORS
from database import db, Task
from datetime import datetime

app = Flask(__name__)
CORS(app)

# Database in current folder
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///tasks.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)

# Create tables
with app.app_context():
    db.create_all()
    print("✅ Database ready!")

# ----- GET all tasks -----
@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    tasks = Task.query.all()
    return jsonify([task.to_dict() for task in tasks]), 200

# ----- GET single task -----
@app.route('/api/tasks/<int:task_id>', methods=['GET'])
def get_task(task_id):
    task = Task.query.get(task_id)
    if not task:
        return jsonify({'error': 'Task not found'}), 404
    return jsonify(task.to_dict()), 200

# ----- POST (CREATE) a new task -----
@app.route('/api/tasks', methods=['POST'])
def create_task():
    data = request.get_json()
    
    # Validation: title is required
    if not data or 'title' not in data:
        return jsonify({'error': 'Title is required'}), 400
    
    if not data['title'].strip():
        return jsonify({'error': 'Title cannot be empty'}), 400
    
    # Validate status (if provided)
    valid_statuses = ['pending', 'in-progress', 'completed']
    status = data.get('status', 'pending')
    if status not in valid_statuses:
        return jsonify({'error': f'Status must be: {valid_statuses}'}), 400
    
    # Create new task
    task = Task(
        title=data['title'],
        description=data.get('description', ''),
        status=status
    )
    
    db.session.add(task)
    db.session.commit()
    
    return jsonify(task.to_dict()), 201

# ----- PUT (UPDATE) an existing task -----
@app.route('/api/tasks/<int:task_id>', methods=['PUT'])
def update_task(task_id):
    task = Task.query.get(task_id)
    if not task:
        return jsonify({'error': 'Task not found'}), 404
    
    data = request.get_json()
    
    # Update title if provided
    if 'title' in data:
        if not data['title'].strip():
            return jsonify({'error': 'Title cannot be empty'}), 400
        task.title = data['title']
    
    # Update description if provided
    if 'description' in data:
        task.description = data['description']
    
    # Update status if provided
    if 'status' in data:
        valid_statuses = ['pending', 'in-progress', 'completed']
        if data['status'] not in valid_statuses:
            return jsonify({'error': f'Status must be: {valid_statuses}'}), 400
        task.status = data['status']
    
    # Update timestamp
    task.updated_at = datetime.utcnow()
    db.session.commit()
    
    return jsonify(task.to_dict()), 200

# ----- DELETE a task -----
@app.route('/api/tasks/<int:task_id>', methods=['DELETE'])
def delete_task(task_id):
    task = Task.query.get(task_id)
    if not task:
        return jsonify({'error': 'Task not found'}), 404
    
    db.session.delete(task)
    db.session.commit()
    
    return jsonify({'message': 'Task deleted successfully'}), 200

if __name__ == '__main__':
    app.run(debug=True, port=5000)