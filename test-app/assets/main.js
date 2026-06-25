// Event listener handlers for fetching backend API list
document.getElementById("load-users-btn").addEventListener("click", () => {
    fetchUsers();
});

document.getElementById("trigger-login-btn").addEventListener("click", () => {
    triggerLogin();
});

// Fetches user records from Flask server
function fetchUsers() {
    const apiPath = "/api/v1/users";
    
    // Utilizing template literals/backticks to verify parser's support for backticks
    fetch(`${apiPath}`)
        .then(res => res.json())
        .then(data => {
            // Calling utility function defined in utils.js
            const formatted = formatUserData(data);
            document.getElementById("output-box").innerText = formatted;
        })
        .catch(err => {
            document.getElementById("output-box").innerText = "Failed to fetch users: " + err;
        });
}

// Simulates user authentication backend login request
function triggerLogin() {
    const payload = { username: "admin", password: "banana" };
    
    fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        document.getElementById("output-box").innerText = JSON.stringify(data, null, 2);
    })
    .catch(err => {
         document.getElementById("output-box").innerText = "Auth request error: " + err;
    });
}
