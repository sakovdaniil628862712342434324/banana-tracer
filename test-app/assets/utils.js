/**
 * Formats a list of user structures into a clean printable string block
 * @param {Array} usersList 
 * @returns {string} formatted string
 */
function formatUserData(usersList) {
    if (!Array.isArray(usersList)) {
        return "Invalid users payload received.";
    }
    
    let result = "=== ACTIVE USERS ===\n";
    usersList.forEach(u => {
        result += `User #${u.id}: ${u.username} [Role: ${u.role}]\n`;
    });
    return result;
}
