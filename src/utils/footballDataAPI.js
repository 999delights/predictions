const axios = require('axios');

const API_KEY = '9d5fda61c9384aadab6f0c6a08437088'; // Replace with your actual API key
const API_URL = 'https://api.football-data.org/v4/competitions/EC/matches'

async function fetchMatches() {
    try {
        const response = await axios.get(API_URL, {
            headers: { 'X-Auth-Token': API_KEY }
        });
        // Filter matches to exclude those with null in critical fields
        const matches = response.data.matches.filter(match =>
            match.homeTeam && match.awayTeam && match.homeTeam.name && match.awayTeam.name
        );
        return matches;
    } catch (error) {
        console.error('Failed to fetch matches:', error);
        return [];
    }
}


module.exports = { fetchMatches };
