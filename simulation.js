require('dotenv').config();

const { chromium } = require("playwright");
const { default: Instructor } = require("@instructor-ai/instructor");
const { default: OpenAI } = require("openai");
const { z } = require("zod");
const { createClient } = require("@supabase/supabase-js");
const Browserbase = require('@browserbasehq/sdk').default;

const QUERY = process.env.QUERY;
const CUSTOMER = process.env.CUSTOMER;
const BROWSERBASE_API_KEY = process.env.BROWSERBASE_API_KEY;
const BROWSERBASE_PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const MAX_RETRIES = 3;
const CONCURRENT_SESSIONS = 20;

// Human-like timing function
function sleep(min, max) {
	const timeout = Math.floor(Math.random() * (max - min + 1)) + min;
	return new Promise(resolve => setTimeout(resolve, timeout));
}

// Core simulation function extracted from the original code
async function runSimulation(account, query, customer, supabase) {
	const EMAIL = account.email;
	const PASSWORD = account.password;

	console.log(`[${EMAIL}] Starting simulation for query: ${query}`);

	// Increment usages count for the selected account
	await supabase
		.from('chatgpt_accounts')
		.update({ usages: (account.usages || 0) + 1 })
		.eq('email', EMAIL);

	console.log(`[${EMAIL}] Account usage count incremented`);

	let retries = 0;
	let responseContent = "";
	let success = false;
	let browser = null;
	let session = null;

	while (retries < MAX_RETRIES && !success) {
		try {
			console.info(`[${EMAIL}] Attempt ${retries + 1}/${MAX_RETRIES}: Launching browser...`);

			// Initialize Browserbase SDK
			const bb = new Browserbase({ apiKey: BROWSERBASE_API_KEY });

			// Create a new browser session
			session = await bb.sessions.create({
				projectId: BROWSERBASE_PROJECT_ID,
				proxies: false
			});

			// Connect to the browser session
			browser = await chromium.connectOverCDP(session.connectUrl);
			console.info(`[${EMAIL}] Connected to Browserbase!`);

			await sleep(800, 2000);

			const context = browser.contexts()[0];
			const page = context.pages()[0];

			await page.goto("https://www.chatgpt.com");
			console.log(`[${EMAIL}] Navigated to ChatGPT`);

			await sleep(1500, 3000);

			try {
				// Move mouse to login button first, then click
				const loginButton = await page.locator('button[data-testid="login-button"]').first();
				const loginButtonBox = await loginButton.boundingBox();
				await page.mouse.move(
					loginButtonBox.x + loginButtonBox.width / 2,
					loginButtonBox.y + loginButtonBox.height / 2,
					{ steps: 10 }
				);
				await sleep(300, 800);
				await loginButton.click();
				console.log(`[${EMAIL}] Initiated Auth Flow`);
			} catch (error) {
				console.log(`[${EMAIL}] No login button found, continuing anyway`);
			}

			//Login
			await sleep(1000, 2000);

			// Click on email field first
			const emailField = await page.locator('input[name="email"]');
			const emailBox = await emailField.boundingBox();
			await page.mouse.move(
				emailBox.x + emailBox.width / 2,
				emailBox.y + emailBox.height / 2,
				{ steps: 8 }
			);
			await sleep(200, 500);
			await emailField.click();
			await page.keyboard.type(EMAIL, { delay: 80 });

			await sleep(800, 1500);

			// Click continue button
			const continueButton = await page.locator('button._root_625o4_51._primary_625o4_86');
			const continueButtonBox = await continueButton.boundingBox();
			await page.mouse.move(
				continueButtonBox.x + continueButtonBox.width / 2,
				continueButtonBox.y + continueButtonBox.height / 2,
				{ steps: 5 }
			);
			await sleep(200, 400);
			await continueButton.click();

			await sleep(1200, 2000);

			// Click on password field, then type
			const passwordField = await page.locator('input#\\:re\\:-password[name="password"]');
			const passwordBox = await passwordField.boundingBox();
			await page.mouse.move(
				passwordBox.x + passwordBox.width / 2,
				passwordBox.y + passwordBox.height / 2,
				{ steps: 6 }
			);
			await sleep(200, 500);
			await passwordField.click();
			await page.keyboard.type(PASSWORD, { delay: 100 });

			await sleep(800, 1500);

			// Click login button
			const loginSubmitButton = await page.locator('button._root_625o4_51._primary_625o4_86');
			const loginSubmitButtonBox = await loginSubmitButton.boundingBox();
			await page.mouse.move(
				loginSubmitButtonBox.x + loginSubmitButtonBox.width / 2,
				loginSubmitButtonBox.y + loginSubmitButtonBox.height / 2,
				{ steps: 5 }
			);
			await sleep(200, 400);
			await loginSubmitButton.click();

			console.log(`[${EMAIL}] Attempted login`);

			// Wait for navigation to complete after login
			try {
				await page.waitForNavigation({ timeout: 30000 });
			} catch (error) {
				console.log(`[${EMAIL}] Navigation timeout or no navigation occurred, continuing anyway`);
			}

			await sleep(2000, 4000);

			// Check for "Check your inbox" header which indicates unusable account
			try {
				const inboxCheckExists = await page.locator('h1._heading_1k32w_67 span._root_xeddl_1:has-text("Check your inbox")').isVisible({ timeout: 5000 });

				if (inboxCheckExists) {
					console.log(`[${EMAIL}] Account requires email verification - marking as unusable`);

					// Mark account as unusable by adding 100 failures
					await supabase
						.from('chatgpt_accounts')
						.update({ failures: (account.failures || 0) + 100 })
						.eq('email', EMAIL);

					console.log(`[${EMAIL}] Account marked as unusable`);
					await browser.close();
					return { success: false, error: "Account requires verification" };
				}
			} catch (error) {
				console.log(`[${EMAIL}] No 'Check your inbox' prompt found, continuing`);
			}

			try {
				await page.waitForSelector('button[data-testid="getting-started-button"]', { timeout: 10000 });
				await page.locator('button[data-testid="getting-started-button"]').click();
				console.log(`[${EMAIL}] Clicked 'Okay, let's go' button`);
			} catch (error) {
				console.log(`[${EMAIL}] No 'Okay, let's go' button found`);
			}

			// Turn on temporary chat
			const tempChatButton = await page.getByRole('button', { name: 'Turn on temporary chat' });
			const tempChatBox = await tempChatButton.boundingBox();
			await page.mouse.move(
				tempChatBox.x + tempChatBox.width / 2,
				tempChatBox.y + tempChatBox.height / 2,
				{ steps: 8 }
			);
			await sleep(300, 700);
			await tempChatButton.click();
			console.log(`[${EMAIL}] Turned on temporary chat`);

			// Add this section to handle the onboarding modal IF it appears
			try {
				// Check if the modal appears with a shorter timeout
				const modalVisible = await page.waitForSelector('div[data-testid="modal-temporary-chat-onboarding"]', {
					timeout: 3000,
					state: 'visible'
				}).then(() => true).catch(() => false);

				if (modalVisible) {
					console.log(`[${EMAIL}] Temporary chat onboarding modal appeared`);
					await sleep(1000, 2000);
					// Click the Continue button with the specific structure
					const continueModalButton = await page.locator('div.flex-0 button.btn-primary:has-text("Continue")');
					const continueModalBox = await continueModalButton.boundingBox();
					await page.mouse.move(
						continueModalBox.x + continueModalBox.width / 2,
						continueModalBox.y + continueModalBox.height / 2,
						{ steps: 5 }
					);
					await sleep(300, 800);
					await continueModalButton.click();
					console.log(`[${EMAIL}] Dismissed onboarding modal`);
				} else {
					console.log(`[${EMAIL}] No onboarding modal detected, continuing`);
				}
			} catch (error) {
				console.log(`[${EMAIL}] No onboarding modal or error handling it, continuing anyway:`, error.message);
			}

			await sleep(1200, 2500);

			console.log(`[${EMAIL}] Clicking tools button`);
			const toolsButton = await page.locator('#system-hint-button');
			const toolsButtonBox = await toolsButton.boundingBox();
			await page.mouse.move(
				toolsButtonBox.x + toolsButtonBox.width / 2,
				toolsButtonBox.y + toolsButtonBox.height / 2,
				{ steps: 6 }
			);
			await sleep(300, 700);
			await toolsButton.click();

			await sleep(800, 1500);

			console.log(`[${EMAIL}] Checking for web search functionality`);
			try {
				// Try to click the "Search the web" button with a timeout
				const webSearchOption = await page.getByText('Search the web');
				const webSearchBox = await webSearchOption.boundingBox();
				await page.mouse.move(
					webSearchBox.x + webSearchBox.width / 2,
					webSearchBox.y + webSearchBox.height / 2,
					{ steps: 7 }
				);
				await sleep(400, 900);
				await webSearchOption.click({ timeout: 3000 });
				console.log(`[${EMAIL}] Enabling web search`);

				// Wait for the Search button to appear after enabling web search
				console.log(`[${EMAIL}] Waiting for Search button to appear...`);
				await page.waitForSelector('button.composer-btn[data-is-selected="true"] span[data-label="true"]:has-text("Search")', {
					timeout: 10000,
					state: 'visible'
				});
				console.log(`[${EMAIL}] Search button appeared, web search is enabled`);
			} catch (error) {
				console.error(`[${EMAIL}] Web search functionality not available for this account`);

				// Increment failures count instead of marking as unusable
				await supabase
					.from('chatgpt_accounts')
					.update({ failures: (account.failures || 0) + 1 })
					.eq('email', EMAIL);

				console.log(`[${EMAIL}] Account failure count incremented`);
				await browser.close();
				return { success: false, error: "Web search not available" };
			}

			await sleep(1000, 2000);

			// Type the query
			const promptArea = await page.locator('div.ProseMirror[contenteditable="true"]');
			const promptBox = await promptArea.boundingBox();
			await page.mouse.move(
				promptBox.x + promptBox.width / 2,
				promptBox.y + promptBox.height / 2,
				{ steps: 8 }
			);
			await sleep(300, 800);
			await promptArea.click();

			// Type with human-like delays between characters
			await page.keyboard.type(query, { delay: 80 });
			await sleep(500, 1200);
			await page.keyboard.press('Enter');

			console.log(`[${EMAIL}] Typed query, waiting for response...`);

			await sleep(25000, 35000);
			console.log(`[${EMAIL}] Response received, getting page content...`);

			// Get the entire page HTML content
			const pageContent = await page.content();

			// Extract content between markers
			const startMarker = 'ChatGPT said:';
			const endMarker = 'aria-label="Copy"';

			const startIndex = pageContent.indexOf(startMarker);
			const endIndex = pageContent.indexOf(endMarker, startIndex);

			if (startIndex !== -1 && endIndex !== -1) {
				responseContent = pageContent.substring(startIndex + startMarker.length, endIndex);
				success = true;
			} else {
				throw new Error("Could not extract response content");
			}

			console.log(`[${EMAIL}] Response extracted`);
			await sleep(800, 1500);
			await browser.close();

		} catch (error) {
			console.error(`[${EMAIL}] Attempt ${retries + 1} failed:`, error.message);

			// Close browser if it was initialized
			try {
				if (browser) {
					await browser.close();
					console.log(`[${EMAIL}] Browser connection closed`);
				}
			} catch (closeError) {
				console.error(`[${EMAIL}] Error closing browser:`, closeError.message);
			}

			retries++;

			if (retries < MAX_RETRIES) {
				console.log(`[${EMAIL}] Waiting to retry... (${retries}/${MAX_RETRIES})`);
				await sleep(5000, 8000);
			}
		}
	}

	if (!success) {
		console.error(`[${EMAIL}] Failed after ${MAX_RETRIES} attempts.`);

		// Increment failures count for the account after MAX_RETRIES failed attempts
		await supabase
			.from('chatgpt_accounts')
			.update({ failures: (account.failures || 0) + 1 })
			.eq('email', EMAIL);

		console.log(`[${EMAIL}] Account failure count incremented after ${MAX_RETRIES} retries`);
		return { success: false, error: "Max retries reached" };
	}

	const oai = new OpenAI({
		apiKey: OPENAI_API_KEY
	});

	const client = Instructor({
		client: oai,
		mode: "FUNCTIONS"
	});

	const AnalysisSchema = z.object({
		reasoning: z.string().describe("A few sentences explaining your reasoning for your answers"),
		websitesCited: z.array(z.string()).describe("List of all websites cited as sources in the response"),
		candidates: z.array(z.string()).describe("List of all candidate options mentioned in the response"),
		bestCandidate: z.string().describe("The best candidate option mentioned in the response"),
		customerMentioned: z.boolean().describe(`Whether ${customer} was mentioned`),
		customerBest: z.boolean().describe(`Whether ${customer} was presented as the best option`)
	});

	const aiResp = await client.chat.completions.create({
		messages: [
			{
				role: "system", content: `You will analyze the response below. The customer is ${customer}.`
					+ "\n1: Give a list of all websites cited as sources in the response. These should be fully qualified urls that come directly from the response."
					+ `\n2: Give a list of all candidate options (i.e. businesses given as possible answers) mentioned in the response.`
					+ `\n3: Who was mentioned as the best option?`
					+ `\n4: Was ${customer} mentioned?`
					+ `\n5: Was ${customer} presented as the best option?`
			},
			{ role: "user", content: "This is what ChatGPT said:" + responseContent }
		],
		model: "gpt-4.1-mini",
		response_model: {
			schema: AnalysisSchema,
			name: "Analysis"
		}
	});

	console.log("Parsed AI response");

	// Check if no websites were cited - count as a failure
	if (aiResp.websitesCited.length === 0) {
		console.log("No websites cited - incrementing failure count");
		await supabase
			.from('chatgpt_accounts')
			.update({ failures: (account.failures || 0) + 1 })
			.eq('email', EMAIL);
	}

	// Save results to Supabase
	const { data, error } = await supabase
		.from('chatgpt_scrapes')
		.insert({
			customer: customer,
			account_email: EMAIL,
			account_password: PASSWORD,
			query: query,
			cited_sources: aiResp.websitesCited,
			candidates: aiResp.candidates,
			best_candidate: aiResp.bestCandidate,
			customer_mentioned: aiResp.customerMentioned,
			customer_top_ranked: aiResp.customerBest
		})
		.select();

	if (error) {
		console.error("Error saving to Supabase:", error);
		return { success: false, error: "Error saving to Supabase" };
	} else {
		console.log("Successfully saved to Supabase:", data);
		return { success: true, data: data };
	}
}

// Main function to run multiple concurrent simulations
async function runMultipleSimulations(numSessions = CONCURRENT_SESSIONS) {
	console.log(`Starting ${numSessions} concurrent simulations for query: ${QUERY}`);

	// Initialize Supabase client
	const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

	// Get accounts with less than 3 failures
	const { data: accountData, error: accountError } = await supabase
		.from('chatgpt_accounts')
		.select('email, password, failures, usages')
		.lt('failures', 3)
		.order('created_at', { ascending: false })
		.limit(numSessions * 2); // Get more accounts than needed in case some are unusable

	if (accountError) {
		console.error("Error fetching accounts:", accountError);
		return;
	}

	if (!accountData || accountData.length === 0) {
		console.error("No accounts found in database");
		return;
	}

	if (accountData.length < numSessions) {
		console.warn(`Only ${accountData.length} accounts available, running fewer sessions than requested`);
		numSessions = accountData.length;
	}

	// Shuffle accounts and take the first numSessions
	const shuffledAccounts = accountData
		.sort(() => 0.5 - Math.random())
		.slice(0, numSessions);

	console.log(`Selected ${shuffledAccounts.length} accounts for concurrent simulations`);

	// Create an array of simulation promises
	const simulationPromises = shuffledAccounts.map(account =>
		runSimulation(account, QUERY, CUSTOMER, supabase)
	);

	// Run all simulations concurrently and wait for results
	const results = await Promise.all(simulationPromises);

	// Summarize results
	const successful = results.filter(r => r.success).length;
	const failed = results.filter(r => !r.success).length;

	console.log(`Simulation summary: ${successful} successful, ${failed} failed`);

	return results;
}

// Run the main function as the entry point
(async () => {
	try {
		await runMultipleSimulations();
		process.exit(0);
	} catch (error) {
		console.error("Error in multiple simulations:", error);
		process.exit(1);
	}
})();