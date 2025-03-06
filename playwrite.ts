import { chromium, type Page, type BrowserContext } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * This script opens neo.bullx.io in a browser and pauses for manual interaction
 * You can manually log in, navigate, and interact with the site
 * Press Enter in the terminal to continue the script after you're done
 */
async function main() {
    console.log('Starting browser...');

    // Launch the browser in non-headless mode so you can interact with it
    const browser = await chromium.launch({
        headless: false, // Show the browser UI
        slowMo: 50, // Slow down operations by 50ms for visibility
    });

    // Create a new browser context and page
    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 }, // Set a reasonable viewport size
    });
    const page = await context.newPage();

    // Check if we have saved cookies from a previous session
    const cookiesPath = path.join(__dirname, 'cookies.json');
    if (fs.existsSync(cookiesPath)) {
        try {
            const cookiesString = fs.readFileSync(cookiesPath, 'utf8');
            const cookies = JSON.parse(cookiesString);
            await context.addCookies(cookies);
            console.log('Loaded cookies from previous session');
        } catch (error) {
            console.error('Failed to load cookies:', error);
        }
    }

    // Navigate to neo.bullx.io
    console.log('Navigating to neo.bullx.io...');
    await page.goto('https://neo.bullx.io', {
        waitUntil: 'networkidle', // Wait until network is idle
        timeout: 60000, // Timeout after 60 seconds
    });

    console.log('Page loaded successfully');

    // Take an initial screenshot
    const screenshotsDir = path.join(__dirname, 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir);
    }
    await page.screenshot({ path: path.join(screenshotsDir, 'initial-load.png') });

    // Pause for manual interaction - you can interact with the browser now
    console.log('\n---------------------------------------------');
    console.log('✋ PAUSED FOR MANUAL INTERACTION');
    console.log('The browser is now under your control.');
    console.log('You can manually interact with neo.bullx.io');
    console.log('You can log in, navigate around, etc.');
    console.log('\nAvailable commands (type in terminal):');
    console.log('- press Enter: continue the script');
    console.log('- type "screenshot": take a screenshot');
    console.log('- type "cookies": save current cookies');
    console.log('- type "quit": exit without continuing');
    console.log('---------------------------------------------\n');

    // Handle different commands from the terminal
    let shouldContinue = true;
    while (shouldContinue) {
        const command = await new Promise<string>((resolve) => {
            process.stdin.once('data', (data) => {
                resolve(data.toString().trim().toLowerCase());
            });
        });

        switch (command) {
            case '':
                // Empty command (just Enter key) - continue the script
                shouldContinue = false;
                console.log('Continuing script execution...');
                break;

            case 'screenshot':
                // Take a screenshot
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const screenshotPath = path.join(screenshotsDir, `manual-${timestamp}.png`);
                await page.screenshot({ path: screenshotPath });
                console.log(`Screenshot saved to ${screenshotPath}`);
                break;

            case 'cookies':
                // Save cookies
                const cookies = await context.cookies();
                fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
                console.log(`Cookies saved to ${cookiesPath}`);
                break;

            case 'quit':
                // Exit without continuing
                console.log('Exiting script...');
                await browser.close();
                process.exit(0);
                break;

            default:
                console.log(`Unknown command: ${command}`);
                console.log('Available commands: Enter (continue), "screenshot", "cookies", "quit"');
                break;
        }
    }

    // Save cookies before continuing
    console.log('Saving cookies from the current session...');
    const cookies = await context.cookies();
    fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));

    // Take a final screenshot
    await page.screenshot({ path: path.join(screenshotsDir, 'final-state.png') });
    console.log('Final screenshot saved');

    // Close the browser
    await browser.close();
    console.log('Browser closed');
}

// Run the script with retry logic
let retries = 3;
async function runWithRetry() {
    try {
        await main();
    } catch (error: unknown) {
        retries--;
        if (retries > 0) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`Error occurred: ${errorMessage}`);
            console.log(`Retrying... (${retries} retries left)`);
            await runWithRetry();
        } else {
            console.error('Error:', error);
            process.exit(1);
        }
    }
}

runWithRetry();
