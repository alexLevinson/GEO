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

// Human-like timing function
function sleep(min, max) {
	const timeout = Math.floor(Math.random() * (max - min + 1)) + min;
	return new Promise(resolve => setTimeout(resolve, timeout));
}

(async () => {
	// Initialize Supabase client
	const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

	// Get a random account from the 1000 most recently created accounts with less than 3 failures
	const { data: accountData, error: accountError } = await supabase
		.from('chatgpt_accounts')
		.select('email, password, failures')
		.lt('failures', 3)
		.order('created_at', { ascending: false })
		.limit(1000);

	if (accountError) {
		console.error("Error fetching accounts:", accountError);
		process.exit(1);
	}

	if (!accountData || accountData.length === 0) {
		console.error("No accounts found in database");
		process.exit(1);
	}

	// Select a random account from the result
	const randomIndex = Math.floor(Math.random() * accountData.length);
	const randomAccount = accountData[randomIndex];

	const EMAIL = randomAccount.email;
	const PASSWORD = randomAccount.password;

	console.log(`Using account: ${EMAIL}`);

	let retries = 0;
	let responseContent = "";
	let success = false;
	let browser = null;
	let session = null;

	while (retries < MAX_RETRIES && !success) {
		try {
			console.info(`Attempt ${retries + 1}/${MAX_RETRIES}: Launching browser...`);

			// Initialize Browserbase SDK
			const bb = new Browserbase({ apiKey: BROWSERBASE_API_KEY });

			// Create a new browser session with proxies and advanced stealth
			session = await bb.sessions.create({
				projectId: BROWSERBASE_PROJECT_ID,
				proxies: true
			});

			// Connect to the browser session
			browser = await chromium.connectOverCDP(session.connectUrl);
			console.info('Connected to Browserbase with proxy!');

			await sleep(800, 2000);

			const context = browser.contexts()[0];
			const page = context.pages()[0];

			await page.goto("https://www.chatgpt.com");
			console.log("Navigated to ChatGPT");

			await sleep(1500, 3000);

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
			console.log("Initiated Auth Flow");

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

			console.log("Attempted login with account: ", EMAIL);
			await sleep(2000, 3500);

			// Add this section to handle the onboarding modal IF it appears
			try {
				// Check if the modal appears with a shorter timeout
				const modalVisible = await page.waitForSelector('div[data-testid="modal-temporary-chat-onboarding"]', {
					timeout: 3000,
					state: 'visible'
				}).then(() => true).catch(() => false);

				if (modalVisible) {
					console.log("Temporary chat onboarding modal appeared");
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
					console.log("Dismissed onboarding modal");
				} else {
					console.log("No onboarding modal detected, continuing");
				}
			} catch (error) {
				console.log("No onboarding modal or error handling it, continuing anyway:", error.message);
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
			console.log("Turned on temporary chat");

			await sleep(1200, 2500);

			console.log("Clicking tools button");
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

			console.log("Checking for web search functionality");
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
				console.log("Enabling web search");

				// Wait for the Search button to appear after enabling web search
				console.log("Waiting for Search button to appear...");
				await page.waitForSelector('button.composer-btn[data-is-selected="true"] span[data-label="true"]:has-text("Search")', {
					timeout: 10000,
					state: 'visible'
				});
				console.log("Search button appeared, web search is enabled");
			} catch (error) {
				console.error("Web search functionality not available for this account");

				// Increment failures count instead of marking as unusable
				await supabase
					.from('chatgpt_accounts')
					.update({ failures: (randomAccount.failures || 0) + 1 })
					.eq('email', EMAIL);

				console.log(`Account ${EMAIL} failure count incremented`);
				await browser.close();
				process.exit(1);
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
			await page.keyboard.type(QUERY, { delay: 80 });
			await sleep(500, 1200);
			await page.keyboard.press('Enter');

			console.log("Typed query, waiting for response...");

			await sleep(25000, 35000);
			console.log("Response received, getting page content...");

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

			console.log("Response extracted");
			await sleep(800, 1500);
			await browser.close();

		} catch (error) {
			console.error(`Attempt ${retries + 1} failed:`, error.message);

			// Close browser if it was initialized
			try {
				if (browser) {
					await browser.close();
					console.log("Browser connection closed");
				}
			} catch (closeError) {
				console.error("Error closing browser:", closeError.message);
			}

			retries++;

			if (retries < MAX_RETRIES) {
				console.log(`Waiting to retry... (${retries}/${MAX_RETRIES})`);
				await sleep(5000, 8000);
			}
		}
	}

	if (!success) {
		console.error(`Failed after ${MAX_RETRIES} attempts. Exiting.`);
		process.exit(1);
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
		customerMentioned: z.boolean().describe(`Whether ${CUSTOMER} was mentioned`),
		customerBest: z.boolean().describe(`Whether ${CUSTOMER} was presented as the best option`)
	});

	const aiResp = await client.chat.completions.create({
		messages: [
			{
				role: "system", content: `You will analyze the response below. The customer is ${CUSTOMER}.`
					+ "\n1: Give a list of all websites cited as sources in the response. These should be fully qualified urls that come directly from the response."
					+ `\n2: Was ${CUSTOMER} mentioned?`
					+ `\n3: Was ${CUSTOMER} presented as the best option?`
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
			.update({ failures: (randomAccount.failures || 0) + 1 })
			.eq('email', EMAIL);
	}

	// Save results to Supabase
	const { data, error } = await supabase
		.from('chatgpt_scrapes')
		.insert({
			customer: CUSTOMER,
			account_email: EMAIL,
			account_password: PASSWORD,
			query: QUERY,
			cited_sources: aiResp.websitesCited,
			customer_mentioned: aiResp.customerMentioned,
			customer_top_ranked: aiResp.customerBest
		})
		.select();

	if (error) {
		console.error("Error saving to Supabase:", error);
		process.exit(1);
	} else {
		console.log("Successfully saved to Supabase:", data);
	}
	process.exit(0);
})();