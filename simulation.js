require('dotenv').config();

const { chromium } = require("playwright");
const { default: Instructor } = require("@instructor-ai/instructor");
const { default: OpenAI } = require("openai");
const { z } = require("zod");
const { createClient } = require("@supabase/supabase-js");
const Browserbase = require('@browserbasehq/sdk').default;
const crypto = require('crypto');

const QUERY = process.env.QUERY;
const CUSTOMER = process.env.CUSTOMER;
const BROWSERBASE_API_KEY = process.env.BROWSERBASE_API_KEY;
const BROWSERBASE_PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const MAX_RETRIES = 3;
const CONCURRENT_SESSIONS = 1;

// Human-like timing function
function sleep(min, max) {
	const timeout = Math.floor(Math.random() * (max - min + 1)) + min;
	return new Promise(resolve => setTimeout(resolve, timeout));
}

async function runSimulation(query, customer, supabase) {
	let EMAIL = null;
	let PASSWORD = null;

	console.log(`[${EMAIL || 'new-account'}] Starting simulation for query: ${query}`);

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
				proxies: true
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
				const loginButton = await page.locator('button[data-testid="login-button"]', { timeout: 10000 }).first();
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

			// Sign up instead of login
			await sleep(800, 2000);

			// Go to Sign up
			const signupLink = await page.locator('a[href="/create-account"]', { timeout: 45000 });
			const signupLinkBox = await signupLink.boundingBox();
			await page.mouse.move(
				signupLinkBox.x + signupLinkBox.width / 2,
				signupLinkBox.y + signupLinkBox.height / 2,
				{ steps: 6 }
			);
			await sleep(300, 700);
			await signupLink.click();
			console.log("Clicked Sign up link on auth page");

			await sleep(800, 2000);

			// Open temp email in a new tab
			const emailPage = await context.newPage();
			await emailPage.goto("https://10minutemail.com");
			console.log("Opened 10minutemail.com in a new tab");

			// Get email address
			await emailPage.waitForSelector('#mail_address');
			EMAIL = await emailPage.evaluate(() => document.getElementById('mail_address').value);
			console.log("Got email address:", EMAIL);

			// Enter email
			await page.waitForSelector('input[name="email"]');
			const emailInput = await page.locator('input[name="email"]');
			const emailInputBox = await emailInput.boundingBox();
			await page.mouse.move(
				emailInputBox.x + emailInputBox.width / 2,
				emailInputBox.y + emailInputBox.height / 2,
				{ steps: 8 }
			);
			await sleep(300, 700);
			await emailInput.click();
			await sleep(500, 1000);
			for (let i = 0; i < EMAIL.length; i++) {
				await page.keyboard.type(EMAIL[i]);
				await sleep(50, 150);
			}

			// Continue after email
			const continueButton = await page.locator('button[data-dd-action-name="Continue"]');
			const continueButtonBox = await continueButton.boundingBox();
			await page.mouse.move(
				continueButtonBox.x + continueButtonBox.width / 2,
				continueButtonBox.y + continueButtonBox.height / 2,
				{ steps: 7 }
			);
			await sleep(300, 700);
			await continueButton.click();

			// Generate and enter password
			function generatePassword(length = 12) {
				return crypto.randomBytes(length).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, length);
			}
			PASSWORD = generatePassword(12);
			console.log("Generated password:", PASSWORD);

			try {
				await page.waitForSelector('input[name="new-password"]', { timeout: 30000 });
			} catch (error) {
				console.log("Error waiting for password input, page content:", await page.content());
			}

			const passwordInput = await page.locator('input[name="new-password"]');
			const passwordInputBox = await passwordInput.boundingBox();
			await page.mouse.move(
				passwordInputBox.x + passwordInputBox.width / 2,
				passwordInputBox.y + passwordInputBox.height / 2,
				{ steps: 5 }
			);
			await sleep(300, 700);
			await passwordInput.click();
			await sleep(500, 1000);
			for (let i = 0; i < PASSWORD.length; i++) {
				await page.keyboard.type(PASSWORD[i]);
				await sleep(40, 120);
			}

			const passwordContinueButton = await page.locator('button[data-dd-action-name="Continue"]');
			const passwordContinueBox = await passwordContinueButton.boundingBox();
			await page.mouse.move(
				passwordContinueBox.x + passwordContinueBox.width / 2,
				passwordContinueBox.y + passwordContinueBox.height / 2,
				{ steps: 6 }
			);
			await sleep(300, 700);
			await passwordContinueButton.click();

			// Wait for email
			await emailPage.waitForSelector('.mail_message', { timeout: 60000 });

			// Extract verification code
			const emailCode = await emailPage.evaluate(() => {
				const messageText = document.querySelector('.message_bottom')?.textContent || '';
				const codeMatch = messageText.match(/Your ChatGPT code is (\d{6})/);
				if (codeMatch?.[1]) return codeMatch[1];

				const paragraphs = document.querySelectorAll('.message_bottom p');
				for (const p of paragraphs) {
					const t = p.textContent?.trim() || '';
					if (/^\d{6}$/.test(t)) return t;
				}
				return null;
			});
			console.log("Extracted verification code:", emailCode);

			// Enter code
			await page.waitForSelector('input[autocomplete="one-time-code"]');
			const codeInput = await page.locator('input[autocomplete="one-time-code"]');
			const codeInputBox = await codeInput.boundingBox();
			await page.mouse.move(
				codeInputBox.x + codeInputBox.width / 2,
				codeInputBox.y + codeInputBox.height / 2,
				{ steps: 7 }
			);
			await sleep(300, 700);
			await codeInput.click();
			await sleep(500, 1000);
			for (let i = 0; i < emailCode.length; i++) {
				await page.keyboard.type(emailCode[i]);
				await sleep(80, 200);
			}

			// Continue after code
			const codeContinueButton = await page.locator('button[data-dd-action-name="Continue"]');
			const codeContinueBox = await codeContinueButton.boundingBox();
			await page.mouse.move(
				codeContinueBox.x + codeContinueBox.width / 2,
				codeContinueBox.y + codeContinueBox.height / 2,
				{ steps: 5 }
			);
			await sleep(300, 700);
			await codeContinueButton.click();

			// Name
			function generateRandomName() {
				const firstNames = ['Joseph', 'Sarah', 'Michael', 'Emma', 'David', 'Lisa', 'James', 'Jennifer', 'Robert', 'Emily', 'William', 'Olivia', 'Thomas', 'Sophia', 'Daniel'];
				const lastNames = ['Smith', 'Johnson', 'Williams', 'Jones', 'Brown', 'Davis', 'Miller', 'Wilson', 'Moore', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White', 'Harris'];
				const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
				const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
				return `${firstName} ${lastName}`;
			}
			const fullName = generateRandomName();
			await page.waitForSelector('input[data-focused="true"]');
			const nameInput = await page.locator('input[data-focused="true"]');
			const nameInputBox = await nameInput.boundingBox();
			await page.mouse.move(
				nameInputBox.x + nameInputBox.width / 2,
				nameInputBox.y + nameInputBox.height / 2,
				{ steps: 8 }
			);
			await sleep(300, 700);
			await nameInput.click();
			await sleep(500, 1000);
			for (let i = 0; i < fullName.length; i++) {
				await page.keyboard.type(fullName[i]);
				await sleep(60, 180);
			}
			console.log(`Entered name ${fullName}`);

			// Birthday
			async function fillRandomBirthday() {
				const today = new Date();
				const minAge = 18, maxAge = 65;
				const minYear = today.getFullYear() - maxAge;
				const maxYear = today.getFullYear() - minAge;
				const year = Math.floor(Math.random() * (maxYear - minYear + 1)) + minYear;
				const month = Math.floor(Math.random() * 12) + 1;
				let maxDays = 31;
				if (month === 2) {
					maxDays = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 29 : 28;
				} else if ([4, 6, 9, 11].includes(month)) {
					maxDays = 30;
				}
				const day = Math.floor(Math.random() * maxDays) + 1;

				const dateField = await page.locator('.react-aria-DateField');
				const dateFieldBox = await dateField.boundingBox();
				await page.mouse.move(
					dateFieldBox.x + dateFieldBox.width / 2,
					dateFieldBox.y + dateFieldBox.height / 2,
					{ steps: 7 }
				);
				await sleep(300, 700);
				await dateField.click({ force: true });
				await sleep(500, 1000);

				const formattedMonth = month.toString().padStart(2, '0');
				const formattedDay = day.toString().padStart(2, '0');
				const dateString = `${formattedMonth}${formattedDay}${year}`;
				for (let i = 0; i < dateString.length; i++) {
					await page.keyboard.type(dateString[i]);
					await sleep(70, 150);
				}
				console.log(`Set birthday to: ${month}/${day}/${year}`);
				await sleep(800, 1500);
			}
			await fillRandomBirthday();

			// Continue after birthday
			const birthdayContinueButton = await page.locator('button[data-dd-action-name="Continue"]');
			const birthdayContinueBox = await birthdayContinueButton.boundingBox();
			await page.mouse.move(
				birthdayContinueBox.x + birthdayContinueBox.width / 2,
				birthdayContinueBox.y + birthdayContinueBox.height / 2,
				{ steps: 8 }
			);
			await sleep(300, 700);
			await birthdayContinueButton.click();
			console.log("Clicked continue button");

			await sleep(2000, 3000);


			// Dismiss onboarding modal
			try {
				const modal = page.locator('[data-testid="modal-onboarding"]', { timeout: 10000 });
				if (await modal.isVisible().catch(() => false)) {
					const btn = modal.getByTestId('getting-started-button')
						.or(modal.getByRole('button', { name: /okay, let’s go/i }));
					await btn.click({ timeout: 5000 });
					await expect(modal).toBeHidden();
					console.log("Dismissed onboarding modal");
				}
			} catch (error) {
				console.log("No onboarding modal found");
			}

			try {
				await page.waitForSelector('button[data-testid="getting-started-button"]', { timeout: 10000 });
				const okayLetsGoButton = await page.locator('button[data-testid="getting-started-button"]', { timeout: 10000 });
				const okayLetsGoBox = await okayLetsGoButton.boundingBox();
				await page.mouse.move(
					okayLetsGoBox.x + okayLetsGoBox.width / 2,
					okayLetsGoBox.y + okayLetsGoBox.height / 2,
					{ steps: 7 }
				);
				await sleep(300, 700);
				await okayLetsGoButton.click();
				console.log("Clicked 'Okay, let's go' button");
			} catch (error) {
				console.log("No 'Okay, let's go' button found");
			}

			await sleep(1200, 2500);

			// Type the query
			try {
				const promptArea = await page.locator('div.ProseMirror[contenteditable="true"]');
				const promptBox = await promptArea.boundingBox();
				await page.mouse.move(
					promptBox.x + promptBox.width / 2,
					promptBox.y + promptBox.height / 2,
					{ steps: 8 }
				);
				await sleep(300, 800);
				await promptArea.click();
			} catch (error) {
				console.log("No prompt area found");
				console.log("Page content:", await page.content());
			}

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
		console.log("No websites cited");
		return { success: false, error: "No websites cited" };
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

	// Create an array of simulation promises – each will create an account then simulate
	const simulationPromises = Array.from({ length: numSessions }, () =>
		runSimulation(QUERY, CUSTOMER, supabase)
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