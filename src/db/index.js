const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Define the database folder and path
const dbFolder = path.join(__dirname, 'db');  // Adjust path as necessary if the project structure differs
const dbPath = path.join(dbFolder, 'mydatabase.db');

// Ensure the database directory exists
if (!fs.existsSync(dbFolder)) {
    fs.mkdirSync(dbFolder);
    console.log(`Database directory created at: ${dbFolder}`);
} else {
    console.log(`Database directory already exists at: ${dbFolder}`);
}

// Create or open the database
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, err => {
    if (err) {
        console.error(`Error connecting to the database at ${dbPath}:`, err);
        return;
    }
    console.log(`Connected to the database at ${dbPath}`);
    
    // Enable foreign key constraints
    db.exec('PRAGMA foreign_keys = ON', err => {
        if (err) {
            console.error('Failed to enable foreign key constraints:', err);
        } else {
            console.log('Foreign key constraints enabled');
        }
    });

    // Create groups table
    db.run(`
        CREATE TABLE IF NOT EXISTS groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL
        )
    `, err => {
        if (err) {
            console.error('Error creating groups table:', err);
        } else {
            console.log('Groups table created');
        }
    });
// Create participants table
db.run(`
    CREATE TABLE IF NOT EXISTS participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER,
        participant_id INTEGER,  -- Add participant_id column
        name TEXT NOT NULL,
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
    )
`, err => {
    if (err) {
        console.error('Error creating participants table:', err);
    } else {
        console.log('Participants table created');
    }
});

    // Create matches table
    db.run(`
        CREATE TABLE IF NOT EXISTS matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER,
            match_id TEXT NOT NULL,
            home_team TEXT NOT NULL,
            away_team TEXT NOT NULL,
            match_date TEXT NOT NULL,
            status TEXT,
            winner TEXT,
            home_score INTEGER,
            away_score INTEGER,
            FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
        )
    `, err => {
        if (err) {
            console.error('Error creating matches table:', err);
        } else {
            console.log('Matches table created with prediction column');
        }
    });

// Create predictions table without foreign key constraint on match_id
db.run(`
    CREATE TABLE IF NOT EXISTS predictions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        participant_id INTEGER,
        match_id TEXT,
        prediction TEXT,
        match_date TEXT,
        home_team TEXT,
        away_team TEXT,
        FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
    )
`, err => {
    if (err) {
        console.error('Error creating predictions table:', err);
    } else {
        console.log('Predictions table created');
    }
});



});

module.exports = db;
