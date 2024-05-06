
const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Specify the path for the SQLite database file
const dbFolder = path.join(__dirname, 'db');
const dbPath = path.join(dbFolder, 'mydatabase.db');

// Ensure the 'db' directory exists
if (!fs.existsSync(dbFolder)) {
    fs.mkdirSync(dbFolder);
}

// Create database connection
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to database:', err);
    } else {
        console.log('Connected to database');
    }
});

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));


// Create tables
db.serialize(() => {
    // Create groups table
    db.run(`CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL
    )`);
});

// Route for admin dashboard
app.get('/admin', (req, res) => {
    // Fetch all groups from the database
    db.all('SELECT * FROM groups', (err, rows) => {
        if (err) {
            console.error(err.message);
            res.status(500).send('Error fetching groups');
        } else {
            // Display admin dashboard with options based on whether groups exist
            let html = '<h1>Welcome, Admin!</h1>';
            if (rows.length > 0) {
                html += '<h2>Existing Groups:</h2>';
                html += '<ul>';
                rows.forEach(row => {
                    html += `<li>ID: ${row.id}, Name: ${row.name} 
                        <form style="display: inline-block;" action="/delete-group/${row.id}" method="post">
                            <button type="submit">Delete</button>
                        </form>
                        <form style="display: inline-block;" action="/group/${row.id}" method="get">
                            <button type="submit">Open</button>
                        </form>
                    </li>`;
                });
                html += '</ul>';
            } else {
                html += '<p>No groups found.</p>';
            }
            html += '<a href="/create-group">Create Group</a>';
            res.send(html);
        }
    });
});
// Route for deleting a group
app.post('/delete-group/:groupId', (req, res) => {
    const groupId = req.params.groupId;
    // Delete the group from the database
    db.run('DELETE FROM groups WHERE id = ?', [groupId], function(err) {
        if (err) {
            console.error(err.message);
            res.status(500).send('Error deleting group');
        } else {
            console.log(`Group with ID ${groupId} deleted`);
            res.redirect('/admin');
        }
    });
});
// Function to delete a group
function deleteGroup(groupId) {
    // Make an AJAX request to delete the group
    fetch(`/delete-group/${groupId}`, {
        method: 'POST'
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    })
    .then(data => {
        console.log(data);
        // Reload the page after deleting the group
        window.location.reload();
    })
    .catch(error => {
        console.error('Error:', error);
    });
}


// Route for creating a group
app.get('/create-group', (req, res) => {
    // Display form for creating a group
    res.send(`
        <h1>Create Group</h1>
        <form action="/create-group" method="post">
            <input type="text" name="groupName" placeholder="Group Name" required>
            <button type="submit">Create</button>
        </form>
    `);
});

app.post('/create-group', (req, res) => {
    // Logic to create a group
    const groupName = req.body.groupName;
    db.run('INSERT INTO groups (name) VALUES (?)', [groupName], function(err) {
        if (err) {
            console.error(err.message);
            res.status(500).send('Error creating group');
        } else {
            console.log(`Group ${groupName} created with ID ${this.lastID}`);
            res.redirect('/admin');
        }
    });
});

// Route for group page
app.get('/group/:groupId', (req, res) => {
    const groupId = req.params.groupId;
    // Fetch group details from the database
    db.get('SELECT * FROM groups WHERE id = ?', [groupId], (err, row) => {
        if (err) {
            console.error(err.message);
            res.status(500).send('Error fetching group details');
        } else {
            if (row) {
                res.send(`
                    <h1>Group Details</h1>
                    <p>ID: ${row.id}</p>
                    <p>Name: ${row.name}</p>
                    <a href="/admin"><button>Back</button></a>
                    <a href="/add-participant/${row.id}"><button>Add Participant</button></a>
                    <a href="/add-match/${row.id}"><button>Add Match</button></a>
                `);
            } else {
                res.status(404).send('Group not found');
            }
        }
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 