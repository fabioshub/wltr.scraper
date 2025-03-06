import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const MIN_PNL = 25000;
const MIN_ROI = 2000;
const MAX_TOKENS_TO_PROCESS = 100; // Number of tokens/rows to process
const MAX_TRADERS_PER_TOKEN = 100; // Maximum number of top traders to process per token
const START_FROM_ROW = 40;

(async () => {
    // Connect to the Chrome instance via its debugging port
    const browser = await chromium.connectOverCDP('http://localhost:9222');

    // Use the first available context or create a new one
    const context = browser.contexts()[0] || (await browser.newContext());
    const page = await context.newPage();

    await page.goto('https://neo.bullx.io/explore');

    // Wait for the table body to be visible
    await page.waitForSelector('.b-table-body');
    await page.waitForTimeout(2000);

    // Get all token rows
    const tokenRows = await page.$$('.b-table-row');
    console.log(`Found ${tokenRows.length} token rows in the table`);

    // Keep track of processed token names to avoid duplicates
    const processedTokenNames = new Set<string>();

    // Process each token, up to MAX_TOKENS_TO_PROCESS
    for (let tokenIndex = 0; tokenIndex < Math.min(tokenRows.length, MAX_TOKENS_TO_PROCESS); tokenIndex++) {
        // Navigate back to the main page if we're not on the first token
        if (tokenIndex > 0) {
            await page.goto('https://neo.bullx.io/explore');
            await page.waitForSelector('.b-table-body');
            await page.waitForTimeout(2000);
        }

        // Find all rows that we haven't processed yet
        const availableRows = await page.$$('.b-table-row');
        let selectedTokenName = '';
        let foundNewToken = false;

        // Try to find a row we haven't processed yet
        for (const row of availableRows) {
            // Get the token name from the span
            const nameSpan = await row.$('span.font-normal.text-grey-50.block.text-xs');
            if (nameSpan) {
                const tokenName = (await nameSpan.textContent()) || '';
                if (tokenName && !processedTokenNames.has(tokenName)) {
                    console.log(`Found new token to process: ${tokenName}`);
                    selectedTokenName = tokenName;
                    processedTokenNames.add(tokenName);

                    // Click on this row
                    await row.click();
                    foundNewToken = true;
                    break;
                }
            }
        }

        if (!foundNewToken) {
            console.log('No new tokens found to process. Ending script.');
            break;
        }

        console.log(`Processing token ${tokenIndex + 1}: ${selectedTokenName}`);
        await page.waitForTimeout(1200);

        // Find all spans containing "Top Traders" and log their count and text content
        const topTradersSpans = await page.$$('span:text("Top Traders")');

        for (const span of topTradersSpans) {
            const text = await span.textContent();
        }

        // Wait for and click the "Top Traders" span
        await page.click('span:text("Top Traders")');

        await page.waitForTimeout(1000);

        // Wait for the table row containing a Solscan link
        try {
            await page.waitForSelector('.b-table-row a[href*="solscan"]', { timeout: 10000 });
        } catch (error) {
            console.log('Could not find Solscan links within 10 seconds, going back to previous page');
            await page.goBack();
            await page.waitForTimeout(2000);
            continue; // Skip to the next iteration of the main loop
        }

        // Process the top traders for this token (limited to MAX_TRADERS_PER_TOKEN)
        for (let rowNumber = START_FROM_ROW; rowNumber <= MAX_TRADERS_PER_TOKEN; rowNumber++) {
            console.log(
                `Token "${selectedTokenName}", Processing visible row ${rowNumber} of max ${MAX_TRADERS_PER_TOKEN}`,
            );

            try {
                // Find the row with the specific row number in its first cell
                const rowSelector = `.b-table-row:has(.b-table-cell span:text-is("${rowNumber}"))`;

                // Progressive scrolling to find the target row in virtual list
                let isRowPresent = false;
                let scrollAttempts = 0;
                const maxScrollAttempts = 20; // Adjust as needed

                while (!isRowPresent && scrollAttempts < maxScrollAttempts) {
                    // Check if target row is already in DOM
                    isRowPresent = await page
                        .waitForSelector(rowSelector, { timeout: 1000 })
                        .then(() => true)
                        .catch(() => false);

                    if (isRowPresent) break;

                    // Scroll down progressively to load more rows
                    await page.evaluate(() => {
                        const tableBody = document.querySelector('.b-table .no-scrollbar .no-scrollbar');
                        if (tableBody) {
                            // Scroll down by a reasonable amount
                            tableBody.scrollTop += 300;
                            return tableBody.scrollTop;
                        }
                        return 0;
                    });

                    await page.waitForTimeout(500); // Wait for DOM to update
                    scrollAttempts++;
                    console.log(`Scrolling attempt ${scrollAttempts} to find row ${rowNumber}...`);
                }

                if (!isRowPresent) {
                    console.log(
                        `Could not find row with visible number ${rowNumber} after ${maxScrollAttempts} scroll attempts. Moving to next token.`,
                    );
                    break; // Break the row loop, will continue with the next token
                }

                // Get the row element once we've found it
                const row = await page.locator(rowSelector);

                // Make sure it's visible by scrolling to it
                await row.scrollIntoViewIfNeeded();

                // Additional scrolling if still not visible
                const isVisible = await row.isVisible();
                if (!isVisible) {
                    console.log(`Row ${rowNumber} is not visible, using additional scrolling methods`);

                    // Find the scrollable container and scroll it
                    await page.evaluate((rowNum) => {
                        // Find the row with this number
                        const spanWithNumber = Array.from(document.querySelectorAll('.b-table-cell span')).find(
                            (span) => span.textContent?.trim() === String(rowNum),
                        );

                        if (spanWithNumber) {
                            // Get the row containing this span
                            const targetRow = spanWithNumber.closest('.b-table-row');
                            if (targetRow) {
                                // Scroll with both methods for reliability
                                targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });

                                // Also scroll the container a bit more
                                const scrollables = Array.from(
                                    document.querySelectorAll('.b-table-body, .no-scrollbar, [style*="overflow"]'),
                                ).filter((el) => {
                                    const style = window.getComputedStyle(el);
                                    return (
                                        style.overflow === 'auto' ||
                                        style.overflow === 'scroll' ||
                                        style.overflowY === 'auto' ||
                                        style.overflowY === 'scroll'
                                    );
                                });

                                if (scrollables.length > 0) {
                                    // Get the innermost container
                                    const container = scrollables[scrollables.length - 1];
                                    // Ensure it's scrolled enough to see the row
                                    // Cast to HTMLElement to access offsetTop property
                                    const targetRowElement = targetRow as HTMLElement;
                                    container.scrollTop =
                                        targetRowElement.offsetTop - (container as HTMLElement).clientHeight / 2;
                                }
                            }
                        }
                    }, rowNumber);

                    // Wait longer for scroll to complete
                    await page.waitForTimeout(800);
                }

                // Check if the row has a Solscan link
                const hasSolscanLink = await row
                    .locator('a[href*="solscan"]')
                    .count()
                    .then((count) => count > 0);
                if (!hasSolscanLink) {
                    console.log(`Row ${rowNumber} doesn't have a Solscan link, skipping`);
                    continue;
                }

                // Find and click the div after the Solscan link
                const divUnderLink = await row.locator('a[href*="solscan"] + div');
                if ((await divUnderLink.count()) === 0) {
                    console.log(`Could not find div under Solscan link for row ${rowNumber}`);
                    continue;
                }

                // Click the div
                await divUnderLink.click();

                // Add a small wait to ensure the click action completes
                await page.waitForTimeout(2000);

                // Find and extract Total Revenue
                const totalRevenueSpan = await page.locator('span:text("Total Revenue")');
                const revenueValueSpan = totalRevenueSpan.locator('xpath=./following-sibling::span');

                // Wait for loader to disappear and number to appear
                await page.waitForFunction((selector) => {
                    const element = document.evaluate(
                        selector,
                        document,
                        null,
                        XPathResult.FIRST_ORDERED_NODE_TYPE,
                        null,
                    ).singleNodeValue;
                    return (
                        element &&
                        element.textContent &&
                        !element.textContent.includes('...') &&
                        /[\d.]+[MK]?/.test(element.textContent)
                    );
                }, '//span[text()="Total Revenue"]/following-sibling::span');

                // Find and extract Realized PnL
                const realizedPnLDiv = await page.locator('span:text("Realized PnL")');
                const pnlValueDiv = realizedPnLDiv.locator('xpath=./following-sibling::span').first();

                // Wait for loader to disappear and number to appear
                await page.waitForFunction((selector) => {
                    const element = document.evaluate(
                        selector,
                        document,
                        null,
                        XPathResult.FIRST_ORDERED_NODE_TYPE,
                        null,
                    ).singleNodeValue;
                    return (
                        element &&
                        element.textContent &&
                        !element.textContent.includes('...') &&
                        /[\d.]+[MK]?/.test(element.textContent)
                    );
                }, '//span[text()="Realized PnL"]/following-sibling::span[1]');

                const revenueValue = (await revenueValueSpan.textContent()) || '0';
                const cleanRevenueValue = revenueValue.replace(/[^0-9MKk.]/g, ''); // Remove everything except numbers, dots, M and K

                let revenueDollars = parseFloat(cleanRevenueValue);
                if (cleanRevenueValue.toUpperCase().endsWith('M')) {
                    revenueDollars *= 1000000;
                } else if (cleanRevenueValue.toUpperCase().endsWith('K')) {
                    revenueDollars *= 1000;
                }

                const pnlValue = (await pnlValueDiv.textContent()) || '0';
                const cleanPnlValue = pnlValue.replace(/[^0-9MKk.]/g, '');

                let pnlDollars = parseFloat(cleanPnlValue);
                if (cleanPnlValue.toUpperCase().endsWith('M')) {
                    pnlDollars *= 1000000;
                } else if (cleanPnlValue.toUpperCase().endsWith('K')) {
                    pnlDollars *= 1000;
                }

                console.log(`Row ${rowNumber} - Realized PnL:`, pnlDollars);
                if (pnlDollars < MIN_PNL) {
                    console.log(`Row ${rowNumber} - Not interested in wallet - PnL is too low: ${pnlDollars}`);
                    await page.click('button.w-5.h-5.bg-transparent.outline-none');
                    await page.waitForTimeout(500);
                    continue;
                }
                console.log(`Row ${rowNumber} - Total Revenue:`, revenueDollars);

                // Find and extract Total Spent
                const totalSpentSpan = await page.locator('span:text("Total Spent")');
                const spentValueSpan = totalSpentSpan.locator('xpath=./following-sibling::span');

                // Wait for loader to disappear and number to appear
                await page.waitForFunction((selector) => {
                    const element = document.evaluate(
                        selector,
                        document,
                        null,
                        XPathResult.FIRST_ORDERED_NODE_TYPE,
                        null,
                    ).singleNodeValue;
                    return (
                        element &&
                        element.textContent &&
                        !element.textContent.includes('...') &&
                        /[\d.]+[MK]?/.test(element.textContent)
                    );
                }, '//span[text()="Total Spent"]/following-sibling::span');

                const spentValue = (await spentValueSpan.textContent()) || '0';
                const cleanSpentValue = spentValue.replace(/[^0-9MKk.]/g, '');

                let spentDollars = parseFloat(cleanSpentValue);
                if (cleanSpentValue.toUpperCase().endsWith('M')) {
                    spentDollars *= 1000000;
                } else if (cleanSpentValue.toUpperCase().endsWith('K')) {
                    spentDollars *= 1000;
                }
                console.log(`Row ${rowNumber} - Total Spent:`, spentDollars);

                // Calculate and log ROI
                const roi = ((revenueDollars - spentDollars) / spentDollars) * 100;
                console.log(`Row ${rowNumber} - ROI:`, roi.toFixed(2) + '%');
                if (roi < MIN_ROI) {
                    console.log(`Row ${rowNumber} - Not interested in wallet - ROI is too low`);
                    await page.click('button.w-5.h-5.bg-transparent.outline-none');
                    await page.waitForTimeout(500);
                    continue;
                }

                // Find the link in the drawer content and extract portfolio ID
                const drawerLink = await page.locator('.ant-modal-content a[href*="/portfolio/"]');
                const href = await drawerLink.getAttribute('href');
                const portfolioId = href?.split('/portfolio/')[1];
                console.log(`Row ${rowNumber} - Portfolio ID:`, portfolioId);

                // Find all rows in the modal
                const rows = await page.locator('.ant-modal-content .b-table-row').all();

                // For each row, get the first cell's span text within the a tag and group by time
                const timeGroups: {
                    seconds: string[];
                    lessThan30m: string[];
                    moreThan30m: string[];
                    lessThan2h: string[];
                    moreThan2h: string[];
                    days: string[];
                    weeks: string[];
                } = {
                    seconds: [],
                    lessThan30m: [],
                    moreThan30m: [],
                    lessThan2h: [],
                    moreThan2h: [],
                    days: [],
                    weeks: [],
                };

                for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
                    const spanText = await rows[rowIndex]
                        .locator('.b-table-cell')
                        .first()
                        .locator('a span')
                        .textContent();
                    const trimmedText = spanText?.trim() || '';

                    // Parse the time value
                    if (trimmedText.includes('s')) {
                        timeGroups.seconds.push(trimmedText);
                    } else if (trimmedText.includes('m')) {
                        const value = parseInt(trimmedText);
                        if (value < 30) {
                            timeGroups.lessThan30m.push(trimmedText);
                        } else {
                            timeGroups.moreThan30m.push(trimmedText);
                        }
                    } else if (trimmedText.includes('h')) {
                        const value = parseInt(trimmedText);
                        if (value < 2) {
                            timeGroups.lessThan2h.push(trimmedText);
                        } else {
                            timeGroups.moreThan2h.push(trimmedText);
                        }
                    } else if (trimmedText.includes('d')) {
                        timeGroups.days.push(trimmedText);
                    } else if (trimmedText.includes('w')) {
                        timeGroups.weeks.push(trimmedText);
                    } else {
                        console.log(`Row ${rowNumber}, Trade ${rowIndex + 1} - Unrecognized time format:`, trimmedText);
                    }
                }

                // Log the grouped results
                console.log(`Row ${rowNumber} - Seconds group:`, timeGroups.seconds.join(', '));
                console.log(`Row ${rowNumber} - Less than 30m group:`, timeGroups.lessThan30m.join(', '));
                console.log(`Row ${rowNumber} - More than 30m group:`, timeGroups.moreThan30m.join(', '));
                console.log(`Row ${rowNumber} - Less than 2h group:`, timeGroups.lessThan2h.join(', '));
                console.log(`Row ${rowNumber} - More than 2h group:`, timeGroups.moreThan2h.join(', '));
                console.log(`Row ${rowNumber} - Days group:`, timeGroups.days.join(', '));
                console.log(`Row ${rowNumber} - Weeks group:`, timeGroups.weeks.join(', '));

                // Check if seconds group has the most entries compared to any other individual group
                const highestCount = Math.max(
                    timeGroups.lessThan30m.length,
                    timeGroups.moreThan30m.length,
                    timeGroups.lessThan2h.length,
                    timeGroups.moreThan2h.length,
                    timeGroups.days.length,
                    timeGroups.weeks.length,
                );

                if (timeGroups.seconds.length > highestCount) {
                    console.log(`Row ${rowNumber} - Not interested in wallet - most trades are in seconds`);
                    await page.click('button.w-5.h-5.bg-transparent.outline-none');
                    await page.waitForTimeout(500);
                    continue;
                }

                const portfolioData = {
                    roi: `${roi.toFixed(2)}%`,
                    pnl: `${pnlDollars}`,
                    link: `http://neo.bullx.io/portfolio/${portfolioId}`,
                };

                // Read existing data from file, or create new if doesn't exist
                const filePath = path.join('portfolios.json');

                let portfolios = {};

                try {
                    if (existsSync(filePath)) {
                        const fileContent = readFileSync(filePath, 'utf8');
                        portfolios = JSON.parse(fileContent);
                    }
                } catch (error) {
                    console.log(`Error reading portfolios file: ${error}`);
                    // If there's an error parsing, start with an empty object
                    portfolios = {};
                }

                // Add or update the portfolio data
                // @ts-ignore
                portfolios[portfolioId] = portfolioData;

                // Write the updated data back to the file
                try {
                    writeFileSync(filePath, JSON.stringify(portfolios, null, 2));
                    console.log(`Row ${rowNumber} - Saved portfolio data to file`);
                } catch (error) {
                    console.log(`Error writing to portfolios file: ${error}`);
                }

                // Additional wait to ensure any final loading completes
                await page.waitForTimeout(1000);

                await page.click('button.w-5.h-5.bg-transparent.outline-none');
                await page.waitForTimeout(500);
            } catch (error) {
                console.log(`Error processing row ${rowNumber}:`, error);
                continue;
            }
        }
    }

    // Disconnect when done (this won't close the Chrome instance)
    await browser.close();
})();
