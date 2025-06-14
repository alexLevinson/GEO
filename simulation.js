require('dotenv').config();

const playwright = require("playwright");
const { default: Instructor } = require("@instructor-ai/instructor");
const { default: OpenAI } = require("openai");
const { z } = require("zod");
const { createClient } = require("@supabase/supabase-js");

const QUERY = process.env.QUERY;
const CUSTOMER = process.env.CUSTOMER;
const BROWSERBASE_API_KEY = process.env.BROWSERBASE_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

(async () => {
	// Initialize Supabase client
	const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

	// Get a random account from the 1000 most recently created accounts
	const { data: accountData, error: accountError } = await supabase
		.from('chatgpt_accounts')
		.select('email, password')
		.order('created_at', { ascending: false })
		.limit(1000);

	if (accountError) {
		console.error("Error fetching accounts:", accountError);
		return;
	}

	if (!accountData || accountData.length === 0) {
		console.error("No accounts found in database");
		return;
	}

	// Select a random account from the result
	const randomIndex = Math.floor(Math.random() * accountData.length);
	const randomAccount = accountData[randomIndex];

	const EMAIL = randomAccount.email;
	const PASSWORD = randomAccount.password;

	console.log(`Using account: ${EMAIL}`);

	console.info("Launching browser...");

	/* To make things easier, we've setup Playwright using the window variables.
	 You can access it and your API key using playwright or `wss://connect.browserbase.com?apiKey=${BROWSERBASE_API_KEY}`. */
	const browser = await playwright.chromium.connectOverCDP(`wss://connect.browserbase.com?apiKey=${BROWSERBASE_API_KEY}`);
	console.info('Connected!');

	await new Promise((resolve) => setTimeout(resolve, 1000));

	const context = browser.contexts()[0];
	const page = context.pages()[0];

	await page.goto("https://www.chatgpt.com");
	console.log("Navigated to ChatGPT");

	await page.locator('button[data-testid="login-button"]').first().click();
	console.log("Clicked login button");

	await new Promise((resolve) => setTimeout(resolve, 1000));

	// Login
	await page.locator('input[name="email"]').fill(EMAIL);
	await page.locator('button._root_625o4_51._primary_625o4_86').click();

	await page.locator('input#\\:re\\:-password[name="password"]').fill(PASSWORD);

	await new Promise((resolve) => setTimeout(resolve, 1000));

	await page.locator('button._root_625o4_51._primary_625o4_86').click();

	console.log("Attempted login");
	await new Promise((resolve) => setTimeout(resolve, 1000));

	// Turn on temporary chat
	await page.getByRole('button', { name: 'Turn on temporary chat' }).click();
	console.log("Turned on temporary chat");

	// Type the query
	await page.locator('div.ProseMirror[contenteditable="true"]').click();
	await page.keyboard.type(QUERY, { delay: 50 });
	await page.keyboard.press('Enter');

	console.log("Typed query, waiting for response...");

	await new Promise((resolve) => setTimeout(resolve, 30000));
	console.log("Response received, getting page content...");

	// Get the entire page HTML content
	const pageContent = await page.content();

	// Extract content between markers
	const startMarker = 'ChatGPT said:';
	const endMarker = 'aria-label="Copy"';

	const startIndex = pageContent.indexOf(startMarker);
	const endIndex = pageContent.indexOf(endMarker, startIndex);

	let responseContent = "";
	if (startIndex !== -1 && endIndex !== -1) {
		responseContent = pageContent.substring(startIndex + startMarker.length, endIndex);
	}

	console.log("Response extracted:", responseContent);
	await browser.close();

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
					+ "\n1: Give a list of all websites cited as sources in the response."
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

	console.log("Analysis:", aiResp);

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
	} else {
		console.log("Successfully saved to Supabase:", data);
	}
})();