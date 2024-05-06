const express = require('express');
const router = express.Router();
const db = require('../db/index');  // Ensure the database path is correct
const { fetchMatches } = require('../utils/footballDataAPI'); // Adjust the utility path as necessary
const { Parser } = require('json2csv');
const multer = require('multer');
const upload = require('../utils/multerConfig');
// Importing the parse function directly
const csv = require('csv-parser');
const fs = require('fs');


// Admin dashboard - Displays all groups
router.get('/admin', (req, res) => {
    const query = `
        SELECT groups.id, groups.name,
               (SELECT COUNT(*) FROM participants WHERE group_id = groups.id) AS participants_count,
               (SELECT COUNT(*) FROM matches WHERE group_id = groups.id) AS matches_count
        FROM groups;
    `;

    db.all(query, (err, groups) => {
        if (err) {
            console.error('Error fetching groups:', err.message);
            return res.status(500).send('Error fetching groups');
        }
        
        let html = '<h1>Welcome, Admin!</h1>';
        if (groups.length) {
            html += '<h2>Existing Groups:</h2><ul>';
            groups.forEach(group => {
                html += `<li>Name: ${group.name}, Participants: ${group.participants_count}, Matches: ${group.matches_count}
                    <form style="display: inline-block;" action="/group/${group.id}" method="get">
                        <button type="submit">Open</button>
                    </form>
                    <form style="display: inline-block;" action="/delete-group/${group.id}" method="post" onsubmit="return confirm('Are you sure you want to delete this group?');">
                        <button type="submit">Delete</button>
                    </form>
                </li>`;
            });
            html += '</ul>';
        } else {
            html += '<p>No groups found.</p>';
        }
        html += '<a href="/create-group">Create Group</a>';
        res.send(html);
    });
});




// Route to add a new participant
// Handle POST request for adding a participant
router.post('/group/:groupId/add-participant', (req, res) => {
    const { groupId } = req.params;
    const { participantName, participantId } = req.body; // Retrieve participantId from request body

    // Check if participant already exists
    db.get('SELECT * FROM participants WHERE group_id = ? AND name = ?', [groupId, participantName], (err, result) => {
        if (err) {
            console.error('Database error:', err.message);
            return res.status(500).send('Database error');
        }
        if (result) {
            // If participant exists, simply redirect back to group details without adding
            return res.redirect(`/group/${groupId}`);
        }

        // Insert new participant if not exists
        db.run('INSERT INTO participants (group_id, name) VALUES (?, ?)', [groupId, participantName], function(err) {
            if (err) {
                console.error('Error adding participant:', err.message);
                return res.status(500).send('Error adding participant');
            }

            // Retrieve the ID of the newly added participant
            const participantId = this.lastID;

            // Set participant_id in the participants table
            db.run('UPDATE participants SET participant_id = ? WHERE id = ?', [participantId, participantId], (err) => {
                if (err) {
                    console.error('Error setting participant_id:', err.message);
                    // Handle error
                } else {
                    console.log('Participant ID set successfully');
                }
            });

            // Insert placeholder predictions for all matches for the new participant
            db.run('INSERT INTO predictions (participant_id, match_id, match_date, home_team, away_team, prediction) SELECT ?, matches.match_id, matches.match_date, matches.home_team, matches.away_team, "-" FROM matches WHERE group_id = ?', [participantId, groupId], (err) => {
                if (err) {
                    console.error('Error creating predictions for participant:', err.message);
                    // Handle error
                } else {
                    console.log('Placeholder predictions created for participant');

                    // Redirect to group details after adding the participant
                    res.redirect(`/group/${groupId}`);
                }
            });
        });
    });
});





// Route to export predictions for a participant in a group
router.get('/group/:groupId/export/:participantId', (req, res) => {
    const { groupId, participantId } = req.params;

    db.get('SELECT name FROM participants WHERE id = ?', [participantId], (err, participant) => {
        if (err) {
            console.error('Error fetching participant:', err.message);
            return res.status(500).send('Error fetching participant');
        }
        if (!participant) {
            return res.status(404).send('Participant not found');
        }

        db.all(`
            SELECT m.home_team, m.away_team, m.match_date, p.prediction
            FROM matches m
            LEFT JOIN predictions p ON m.match_id = p.match_id AND p.participant_id = ?
            WHERE m.group_id = ?
        `, [participantId, groupId], (err, predictions) => {
            if (err) {
                console.error('Error fetching predictions:', err.message);
                return res.status(500).send('Error fetching predictions');
            }

            const enhancedPredictions = predictions.map(prediction => ({
                Match: `${prediction.home_team} vs ${prediction.away_team}`,
                'Match Date': (prediction.match_date),
                Prediction: prediction.prediction || ""
            }));

            const fields = [
                { label: 'Match', value: 'Match' },
                { label: 'Match Date', value: 'Match Date' },
                { label: 'Prediction', value: 'Prediction' }
            ];

            const json2csvParser = new Parser({ fields, header: true });
            const csv = json2csvParser.parse(enhancedPredictions);

            res.header('Content-Type', 'text/csv');
            res.attachment(`${participant.name}_predictions.csv`);
            res.send(csv);
        });
    });
});



// Route to list all participants in a group
router.get('/group/:groupId/participants', (req, res) => {
    const { groupId } = req.params;

    db.all('SELECT id, name FROM participants WHERE group_id = ?', [groupId], (err, participants) => {
        if (err) {
            console.error('Error fetching participants:', err.message);
            return res.status(500).send('Error fetching participants');
        }

        let html = `<h1>Participants in Group</h1><ul>`;
        participants.forEach(p => {
            html += `
                <li>
                    ${p.name}
                    <form action="/edit-participant/${p.id}" method="get" style="display:inline;">
                        <button>Edit</button>
                    </form>
                    <form action="/delete-participant/${p.id}" method="post" onsubmit="return confirm('Are you sure you want to delete this participant?');" style="display:inline;">
                        <button type="submit">Delete</button>
                    </form>
                </li>`;
        });
        html += `</ul><a href="/group/${groupId}"><button>Back to Group Details</button></a>`;

        res.send(html);
    });
});

// Route to delete a group
router.post('/delete-group/:groupId', (req, res) => {
    const { groupId } = req.params;
    db.run('DELETE FROM groups WHERE id = ?', [groupId], function(err) {
        if (err) {
            console.error('Error deleting group:', err.message);
            return res.status(500).send('Error deleting group');
        }
        res.redirect('/admin');
    });
});

// Route to create a group
router.get('/create-group', (req, res) => {
    res.send(`
        <h1>Create Group</h1>
        <form action="/create-group" method="post">
            <input type="text" name="groupName" placeholder="Group Name" required>
            <button type="submit">Create</button>
        </form>
    `);
});

// Assuming the fetchMatches function returns a promise with the match data
router.post('/create-group', async (req, res) => {
    const { groupName } = req.body;
    try {
        const matches = await fetchMatches();  // Fetch matches from the API

        console.log('Inserting a new group into the database.');
        db.run('INSERT INTO groups (name) VALUES (?)', [groupName], function(err) {
            if (err) {
                console.error('Error creating group:', err.message);
                return res.status(500).send('Error creating group');
            }
            console.log('Group created successfully, ID:', this.lastID);
            const groupId = this.lastID;

            matches.forEach(match => {
                console.log(`Inserting match: ${match.id}`);
                const formattedDate = formatMatchDate(match.utcDate);
                db.run('INSERT INTO matches (group_id, match_id, home_team, away_team, match_date, status, winner, home_score, away_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', 
                    [groupId, match.id, match.homeTeam.name, match.awayTeam.name, formattedDate, match.status, match.score.winner, match.score.fullTime.home, match.score.fullTime.away], 
                    err => {
                        if (err) console.error('Error adding match to group:', err);
                        else console.log('Match added successfully');
                    });
            });

            res.redirect(`/group/${groupId}`);
        });
    } catch (error) {
        console.error('Error fetching matches or processing group creation:', error);
        res.status(500).send('Failed to create group or fetch matches');
    }
});



// Route to delete a participant
router.post('/delete-participant/:participantId', (req, res) => {
    const { participantId } = req.params;
    db.run('DELETE FROM participants WHERE id = ?', [participantId], function(err) {
        if (err) {
            console.error('Error deleting participant:', err.message);
            return res.status(500).send('Error deleting participant');
        }
        console.log(`Participant with ID ${participantId} deleted`);
        res.redirect('back');  // Redirect back to the previous page
    });
});

// Route to show the edit participant form
router.get('/edit-participant/:participantId', (req, res) => {
    const { participantId } = req.params;
    db.get('SELECT * FROM participants WHERE id = ?', [participantId], (err, participant) => {
        if (err) {
            console.error('Error fetching participant:', err.message);
            return res.status(500).send('Error fetching participant');
        }
        if (!participant) {
            return res.status(404).send('Participant not found');
        }
        res.send(`
            <h1>Edit Participant</h1>
            <form action="/edit-participant/${participant.id}" method="post">
                <input type="hidden" name="groupId" value="${participant.group_id}">
                <input type="text" name="participantName" value="${participant.name}" required>
                <button type="submit">Update</button>
            </form>
            <a href="/group/${participant.group_id}"><button>Back to Group Details</button></a>
        `);
    });
});


// Route to handle the edit form submission
router.post('/edit-participant/:participantId', (req, res) => {
    const { participantId } = req.params;
    const { participantName, groupId } = req.body;  // Now also retrieving groupId from the form

    db.run('UPDATE participants SET name = ? WHERE id = ?', [participantName, participantId], function(err) {
        if (err) {
            console.error('Error updating participant:', err.message);
            return res.status(500).send('Error updating participant');
        }
        console.log(`Participant with ID ${participantId} updated`);
        res.redirect(`/group/${groupId}/participants`);  // Correctly redirect back to the participant list using groupId
    });
});

router.get('/group/:groupId', (req, res) => {
    const { groupId } = req.params;
    const message = req.query.message;
    const status = req.query.status;

    db.get('SELECT * FROM groups WHERE id = ?', groupId, (err, group) => {
        if (err) {
            console.error('Error fetching group details:', err.message);
            return res.status(500).send('Error fetching group details');
        }
        if (!group) {
            return res.status(404).send('Group not found');
        }

        db.all('SELECT * FROM matches WHERE group_id = ? ORDER BY match_date ASC', groupId, (err, matches) => {
            if (err) {
                console.error('Error fetching matches:', err.message);
                return res.status(500).send('Error fetching matches');
            }

            db.all('SELECT * FROM participants WHERE group_id = ?', groupId, (err, participants) => {
                if (err) {
                    console.error('Error fetching participants:', err.message);
                    return res.status(500).send('Error fetching participants');
                }

                let matchesHeader = matches.map(match => `
                <th class="match-header">
                    <div class="match-name ${match.status === 'FINISHED' ? 'finished-match' : 'unfinished-match'}">${match.home_team} vs ${match.away_team}</div>
                    <div class="match-date">${match.match_date}</div>
                    <div class="match-status">${match.status}</div>
                    <div class="match-winner">${match.winner || 'TBD'}</div>
                    <div class="match-score">${match.home_score !== null ? match.home_score : '-'} : ${match.away_score !== null ? match.away_score : '-'}</div>
                </th>
            `).join('');
            
            let participantsRowsPromises = participants.map(participant => {
                return new Promise((resolve, reject) => {
                    db.all(`
                        SELECT m.home_team, m.away_team, m.match_date, m.status, m.winner, p.prediction
                        FROM matches m
                        LEFT JOIN predictions p ON m.match_id = p.match_id AND p.participant_id = ?
                        WHERE m.group_id = ?
                    `, [participant.id, groupId], (err, predictions) => {
                        if (err) {
                            console.error('Error fetching predictions:', err.message);
                            resolve([]);
                        } else {
                            let points = 0;
                            let predictionsHTML = predictions.map(prediction => {
                                let correctClass = '';
                                if (prediction.status === 'FINISHED') {
                                    if ((prediction.winner === 'HOME_TEAM' && prediction.prediction === '1') ||
                                        (prediction.winner === 'DRAW' && prediction.prediction === 'X') ||
                                        (prediction.winner === 'AWAY_TEAM' && prediction.prediction === '2')) {
                                        correctClass = 'green';
                                        points++;
                                    } else {
                                        correctClass = 'red';
                                    }
                                }
                                return `<td class="${correctClass}">${prediction.prediction || "-"}</td>`;
                            }).join('');

                            resolve({ participant, predictionsHTML, points });
                        }
                    });
                });
            });

            Promise.all(participantsRowsPromises).then(participantsData => {
                let participantsRowsHTML = participantsData.map(({ participant, predictionsHTML }) => {
                    // Parse predictionsHTML into an array of predictions
                    let predictions = predictionsHTML.split('</td>').slice(0, -1).map(html => {
                        return html.replace('<td>', '');
                    });
            
                    // Check if all predictions are correct (1, X, or 2)
                    let allPredictionsCorrect = predictions.every(prediction => ['1', 'X', '2'].includes(prediction.trim()));
            
                    // Determine the class based on the correctness of predictions
                    let participantNameClass = allPredictionsCorrect ? 'participant-name green' : 'participant-name red';
            
                    return `
                        <tr>
                            <td class="${participantNameClass}">${participant.name}</td>
                            <td>
                                <a href="/group/${groupId}/export/${participant.id}" target="_blank" onclick="return confirm('Are you sure you want to export predictions for ${participant.name}?')">
                                    <button>Export</button>
                                </a>
                            </td>
                            ${predictionsHTML}
                        </tr>
                    `;
                }).join('');
            

                let leaderboard = participantsData.sort((a, b) => b.points - a.points).map(({ participant, points }) => `
                    <tr>
                        <td>${participant.name}</td>
                        <td>${points}</td>
                    </tr>
                `).join('');

                let feedbackMessage = message ? `<div class="feedback ${status}">${message.replace(/\+/g, ' ')}</div>` : '';

                res.send(`
                <style>
                .match-header { width: 200px; text-align: center; }
                .match-name { font-size: 16px; font-weight: bold; pointer-events: none; }
                .finished-match { background-color: green; }
                .unfinished-match { background-color: red; }
                .green { background-color: lightgreen; }
                .red { background-color: lightcoral; }
                #scroll-container { overflow-x: auto; cursor: grab; }
                table { border-collapse: collapse; }
                th, td { border: 1px solid black; padding: 8px; min-width: 100px; }
                button { pointer-events: auto; }
                .feedback { padding: 10px; color: ${status === 'error' ? 'red' : 'green'}; margin-bottom: 10px; }
            </style>
                        <h1>Group Details: ${group.name}</h1>
                        <div>Total Participants: ${participants.length}</div>
                        <div>Total Matches: ${matches.length}</div>
                        ${feedbackMessage}
                        <div id="scroll-container">
                            <table>
                                <tr><th>Participants / Matches</th><th>Actions</th>${matchesHeader}</tr>
                                ${participantsRowsHTML}
                            </table>
                        </div>
                        <script>
                            const slider = document.getElementById('scroll-container');
                            let isDown = false;
                            let startX;
                            let scrollLeft;

                            slider.addEventListener('mousedown', (e) => {
                                isDown = true;
                                slider.classList.add('active');
                                startX = e.pageX - slider.offsetLeft;
                                scrollLeft = slider.scrollLeft;
                            });
                            slider.addEventListener('mouseleave', () => {
                                isDown = false;
                                slider.classList.remove('active');
                            });
                            slider.addEventListener('mouseup', () => {
                                isDown = false;
                                slider.classList.remove('active');
                            });
                            slider.addEventListener('mousemove', (e) => {
                                if (!isDown) return;
                                e.preventDefault();
                                const x = e.pageX - slider.offsetLeft;
                                const walk = (x - startX) * 3; //scroll-fast
                                slider.scrollLeft = scrollLeft - walk;
                            });
                        </script>
                        <h2>Leaderboard</h2>
                        <table>
                            <tr><th>Participant</th><th>Points</th></tr>
                            ${leaderboard}
                        </table>
                        <h2>Add Participant:</h2>
                        <form action="/group/${groupId}/add-participant" method="post">
                            <input type="text" name="participantName" placeholder="Participant Name" required>
                            <button type="submit">Add Participant</button>
                        </form>
                        <h2>Import Predictions:</h2>
                        <form action="/group/${groupId}/import" method="post" enctype="multipart/form-data">
                            <input type="file" name="file" required>
                            <button type="submit">Import</button>
                        </form>
                        <h2>Manage Participants:</h2>
                        <a href="/group/${groupId}/participants"><button>View Participants</button></a>
                        <a href="/admin"><button>Back to Admin</button></a>
                    `);
                }).catch(error => {
                    console.error('Error generating participants table:', error.message);
                    res.status(500).send('Error generating participants table');
                });
            });
        });
    });
});

router.post('/group/:groupId/import', upload.single('file'), async (req, res) => {
    const { groupId } = req.params;
    let matchCounter = 0; // Counter to count the number of matches processed
    let predictionCounter = 0; // Counter to count the number of correct predictions

    if (!req.file) {
        return res.redirect(`/group/${groupId}?message=No+file+uploaded&status=error`);
    }

    try {
        // Check if participants exist in the group
        const participants = await new Promise((resolve, reject) => {
            db.all('SELECT id, name FROM participants WHERE group_id = ?', [groupId], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });

        if (participants.length === 0) {
            return res.redirect(`/group/${groupId}?message=Import+failed:+No+participants+in+the+group&status=error`);
        }

        // Check if the participant exists based on the filename
        const participantName = req.file.originalname.split('_')[0]; // Assumes filename is formatted as 'name_predictions.csv'
        const participant = participants.find(p => p.name === participantName);
        if (!participant) {
            return res.redirect(`/group/${groupId}?message=Import+failed:+Participant+not+found&status=error`);
        }

        // Parse CSV file and update predictions for the participant
        let isFirstRow = true;
        fs.createReadStream(req.file.path)
            .pipe(csv({ separator: '\t', headers: false })) // Assuming tab-separated values and no header row
            .on('data', async (row) => {
                // Skip the first row (header row)
                if (isFirstRow) {
                    isFirstRow = false;
                    return;
                }

                // Split the row into match details and prediction
                const rowData = Object.values(row)[0].split(';');
                const matchDetails = rowData.slice(0, -1).join(';'); // Join match details excluding prediction
                const prediction = rowData[rowData.length - 1]; // Last element is prediction

                // Split match details into home team, away team, and match date
                const [matchTeams, matchDate] = matchDetails.split(';');
                const [homeTeam, awayTeam] = matchTeams.split(' vs ');

                matchCounter++; // Increment match counter
                
                // Check if the prediction is valid
                if (prediction && ['1', 'X', '2'].includes(prediction.trim())) {
                    // Increment prediction counter if a valid prediction is found
                    predictionCounter++;

                    // Update the database with the prediction if it's correct
                    await new Promise((resolve, reject) => {
                        // Check if a prediction already exists for the home team, away team, and match date combination
                        db.get('SELECT * FROM predictions WHERE participant_id = ? AND match_date = ? AND home_team = ? AND away_team = ?',
                            [participant.id, matchDate, homeTeam, awayTeam], (err, existingPrediction) => {
                                if (err) {
                                    console.error('Error querying database:', err.message);
                                    reject(err);
                                    return;
                                }
                                
                                if (existingPrediction) {
                                    // If prediction exists, update it
                                    db.run('UPDATE predictions SET prediction = ? WHERE id = ?',
                                        [prediction.trim(), existingPrediction.id], (err) => {
                                            if (err) {
                                                console.error('Error updating prediction:', err.message);
                                                reject(err);
                                            } else {
                                                console.log('Prediction updated successfully');
                                                resolve();
                                            }
                                        });
                                } else {
                                    // If prediction doesn't exist, insert a new one
                                    db.run('INSERT INTO predictions (participant_id, match_date, home_team, away_team, prediction) VALUES (?, ?, ?, ?, ?)',
                                        [participant.id, matchDate, homeTeam, awayTeam, prediction.trim()], (err) => {
                                            if (err) {
                                                console.error('Error inserting prediction:', err.message);
                                                reject(err);
                                            } else {
                                                console.log('Prediction inserted successfully');
                                                resolve();
                                            }
                                        });
                                }
                            });
                    });
                }
            })
            .on('end', () => {
                console.log('CSV file successfully parsed.');
                console.log('Number of correct predictions found:', predictionCounter, 'out of the max', matchCounter, 'number of matches');

                // Proceed with your database update operations if needed
                res.redirect(`/group/${groupId}?message=Predictions+updated+successfully+for+<div style="color:blue; padding: 5px; border: 1px solid blue; display: inline-block;">${encodeURIComponent(participantName)}</div>+<div style="color:purple;">(${predictionCounter}+out+of+${matchCounter})</div>&status=success`);
            });

    } catch (error) {
        console.error('Failed to process import:', error);
        res.redirect(`/group/${groupId}?message=Failed+to+process+import:+${encodeURIComponent(error.message)}&status=error`);
    }
});


function formatMatchDate(utcDate) {
    const date = new Date(utcDate);
    date.setHours(date.getHours());  // Adjust for timezone difference by adding 3 hours
    return date.toLocaleString('en-GB', {
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false  // Use 24-hour format
    }).replace(',', ''); // Format: "DD/MM/YYYY HH:MM"
}


module.exports = router;
