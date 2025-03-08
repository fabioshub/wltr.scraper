import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { createServer } from 'http';
import { Server } from 'socket.io';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: 'http://localhost:5173', // Vite's default port
        methods: ['GET', 'POST'],
    },
});

const port = 4444;

// Middleware
app.use(cors());
app.use(express.json());

// File paths
const ENV_FILE = path.join(__dirname, '.env');
const CONFIG_FILE = path.join(__dirname, 'config.json');
const PORTFOLIOS_FILE = path.join(__dirname, 'portfolios.json');
const PROCESSED_TOKENS_FILE = path.join(__dirname, 'processed_tokens.json');
const STATS_FILE = path.join(__dirname, 'scraper_stats.json');

// Create portfolios.json with empty object if it doesn't exist
if (!fs.existsSync(PORTFOLIOS_FILE)) {
    fs.writeFileSync(PORTFOLIOS_FILE, '{}', 'utf8');
    console.log('Created empty portfolios.json file');
}

// Create scraper_stats.json with default values if it doesn't exist
if (!fs.existsSync(STATS_FILE)) {
    fs.writeFileSync(STATS_FILE, JSON.stringify({ portfoliosChecked: 0 }, null, 2), 'utf8');
    console.log('Created scraper_stats.json with default values');
}

// Track scraper process
let scraperProcess = null;

// Watch portfolios.json for changes
fs.watch(PORTFOLIOS_FILE, (eventType, filename) => {
    if (eventType === 'change') {
        try {
            const portfolios = JSON.parse(fs.readFileSync(PORTFOLIOS_FILE, 'utf8'));
            io.emit('portfolios-updated', portfolios);
        } catch (error) {
            console.error('Error reading portfolios file:', error);
        }
    }
});

// Socket.IO connection handler
io.on('connection', (socket) => {
    console.log('Client connected');

    // Send initial portfolios data
    try {
        const portfolios = JSON.parse(fs.readFileSync(PORTFOLIOS_FILE, 'utf8'));
        socket.emit('portfolios-updated', portfolios);
    } catch (error) {
        console.error('Error reading initial portfolios:', error);
    }

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// GET endpoint to retrieve portfolios
app.get('/portfolios', (req, res) => {
    try {
        const portfolios = fs.existsSync(PORTFOLIOS_FILE) ? JSON.parse(fs.readFileSync(PORTFOLIOS_FILE, 'utf8')) : {};
        res.json(portfolios);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read portfolios' });
    }
});

// GET endpoint to retrieve processed tokens
app.get('/processed-tokens', (req, res) => {
    try {
        if (fs.existsSync(PROCESSED_TOKENS_FILE)) {
            const tokens = JSON.parse(fs.readFileSync(PROCESSED_TOKENS_FILE, 'utf8'));
            res.json(tokens);
        } else {
            // If file doesn't exist, create it with an empty array
            fs.writeFileSync(PROCESSED_TOKENS_FILE, '[]');
            res.json([]);
        }
    } catch (error) {
        console.error('Error reading processed tokens:', error);
        res.status(500).json({ error: 'Failed to read processed tokens' });
    }
});

// GET endpoint to retrieve scraper stats
app.get('/scraper-stats', (req, res) => {
    try {
        if (fs.existsSync(STATS_FILE)) {
            const stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
            res.json(stats);
        } else {
            // If file doesn't exist, create it with default values
            const defaultStats = { portfoliosChecked: 0 };
            fs.writeFileSync(STATS_FILE, JSON.stringify(defaultStats, null, 2));
            res.json(defaultStats);
        }
    } catch (error) {
        console.error('Error reading scraper stats:', error);
        res.status(500).json({ error: 'Failed to read scraper stats' });
    }
});

// Helper function to read .env file
function parseEnvFile(content) {
    const config = {};
    const lines = content.split('\n');
    for (const line of lines) {
        if (line && !line.startsWith('#')) {
            const [key, value] = line.split('=').map((part) => part.trim());
            if (key && value) {
                config[key] = value;
            }
        }
    }
    return config;
}

// Helper function to convert config object to .env format
function convertToEnvFormat(config) {
    let envContent = '';
    for (const [key, value] of Object.entries(config)) {
        envContent += `${key}=${value}\n`;
    }
    return envContent;
}

// GET endpoint to retrieve current configuration
app.get('/config', (req, res) => {
    try {
        const config = fs.existsSync(CONFIG_FILE)
            ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
            : {
                  MIN_PNL: '25000',
                  MIN_ROI: '2000',
                  MAX_TOKENS_TO_PROCESS: '10',
                  MAX_TRADERS_PER_TOKEN: '20',
                  START_FROM_ROW: '3',
                  CHROME_DEBUG_PORT: '9222',
                  BASE_URL: 'https://neo.bullx.io',
                  HOST_IP: 'localhost',
              };
        res.json(config);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read configuration' });
    }
});

// POST endpoint to update configuration
app.post('/config', (req, res) => {
    try {
        const config = req.body;
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        fs.writeFileSync(ENV_FILE, convertToEnvFormat(config));
        res.json(config);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update configuration' });
    }
});

// GET endpoint to check scraper status
app.get('/scraper/status', (req, res) => {
    res.json({
        status: scraperProcess && !scraperProcess.killed ? 'running' : 'stopped',
        pid: scraperProcess?.pid,
    });
});

// POST endpoint to start scraper
app.post('/scraper/start', (req, res) => {
    try {
        if (scraperProcess && !scraperProcess.killed) {
            return res.json({
                status: 'running',
                pid: scraperProcess.pid,
            });
        }

        // Check if we're on Windows
        const isWindows = process.platform === 'win32';

        // Configure the command and options based on platform
        let command;
        if (isWindows) {
            // For Windows, create a command that waits before executing
            command = `start cmd.exe /K "timeout 5 /nobreak && npx tsx test.ts"`;
        } else {
            // For macOS/Linux, use osascript to open Terminal
            command = `osascript -e 'tell app "Terminal" to do script "cd ${__dirname} && npx tsx test.ts"'`;
        }

        const options = {
            env: {
                ...process.env,
                NODE_NO_WARNINGS: '1',
                CHROME_DEBUG_PORT: '9222',
                HOST_IP: 'localhost',
                BASE_URL: 'https://neo.bullx.io',
                DEBUG: '*',
            },
            shell: true,
        };

        console.log('Starting scraper with command:', command);
        exec(command, options);

        res.json({
            status: 'running',
            pid: 1,
        });
    } catch (error) {
        console.error('Error starting scraper:', error);
        res.status(500).json({
            status: 'stopped',
            error: 'Failed to start scraper',
        });
    }
});

// POST endpoint to stop scraper
app.post('/scraper/stop', (req, res) => {
    try {
        if (scraperProcess && !scraperProcess.killed) {
            // Check if we're on Windows
            const isWindows = process.platform === 'win32';

            if (isWindows) {
                // On Windows, we need to use taskkill to terminate the process tree
                exec('taskkill /pid ' + scraperProcess.pid + ' /f /t');
            } else {
                // On Unix-like systems, we can use the kill method
                scraperProcess.kill();
            }

            scraperProcess = null;
        }
        res.json({
            status: 'stopped',
        });
    } catch (error) {
        console.error('Error stopping scraper:', error);
        res.status(500).json({
            status: 'stopped',
            error: 'Failed to stop scraper',
        });
    }
});

// POST endpoint to clear processed tokens
app.post('/clear-processed-tokens', (req, res) => {
    try {
        // Read the current tokens to get the count
        let tokenCount = 0;
        if (fs.existsSync(PROCESSED_TOKENS_FILE)) {
            const currentTokens = JSON.parse(fs.readFileSync(PROCESSED_TOKENS_FILE, 'utf8'));
            tokenCount = Array.isArray(currentTokens) ? currentTokens.length : 0;
        }

        // Clear the processed tokens file by writing an empty array
        fs.writeFileSync(PROCESSED_TOKENS_FILE, '[]');
        res.json({
            success: true,
            message: 'Processed tokens cleared successfully',
            clearedCount: tokenCount,
        });
    } catch (error) {
        console.error('Error clearing processed tokens:', error);
        res.status(500).json({ success: false, message: 'Failed to clear processed tokens' });
    }
});

// POST endpoint to update code from git
app.post('/update', (req, res) => {
    try {
        exec('git pull', { cwd: __dirname }, (error, stdout, stderr) => {
            if (error) {
                console.error('Error executing git pull:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to update code',
                    error: error.message,
                });
                return;
            }

            res.json({
                success: true,
                message: 'Code updated successfully',
                output: stdout,
                error: stderr,
            });
        });
    } catch (error) {
        console.error('Error updating code:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update code',
            error: error.message,
        });
    }
});

// Start the server
httpServer.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log('Available endpoints:');
    console.log('  GET  /config          - Retrieve current configuration');
    console.log('  POST /config          - Update configuration');
    console.log('  GET  /scraper/status  - Check scraper status');
    console.log('  POST /scraper/start   - Start the scraper');
    console.log('  POST /scraper/stop    - Stop the scraper');
    console.log('  GET  /portfolios      - Get all portfolios');
    console.log('  GET  /processed-tokens - Get processed tokens');
    console.log('  POST /clear-processed-tokens - Clear processed tokens');
    console.log('  GET  /scraper-stats   - Get scraper stats');
    console.log('  POST /update          - Update code from git');
});
