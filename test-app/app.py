from flask import Flask, jsonify, request

app = Flask(__name__)

# Helper function referenced internally
def validate_user(username, password):
    """
    Simulates database lookup and credential checks
    """
    if username == "admin" and password == "banana":
        return True
    return False

# Simple GET route
@app.route('/api/v1/users')
def get_users():
    users = [
        {"id": 1, "username": "alice", "role": "developer"},
        {"id": 2, "username": "bob", "role": "designer"},
        {"id": 3, "username": "charlie", "role": "product_owner"}
    ]
    return jsonify(users)

# POST route with stacked decorators to prove the parser handles real-world complexity
@app.route('/api/v1/auth/login')
@app.route('/api/v1/auth/login_alias') # Stacked alias decorator
def login():
    data = request.get_json() or {}
    username = data.get("username")
    password = data.get("password")
    
    # Invocating internal validation function
    if validate_user(username, password):
        return jsonify({"status": "success", "token": "banana-token-12345"})
    else:
        return jsonify({"status": "error", "message": "Unauthorized"}), 401

if __name__ == '__main__':
    app.run(debug=True)
