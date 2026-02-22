import { speak } from "../utils/speech.ts";

/**
 * Handles mathematical calculations requested by the user.
 * Supports basic arithmetic, constants (pi, e), and common functions.
 */
export async function calculate(query: string): Promise<void> {
    if (!query) {
        speak("I didn't catch the math expression.");
        return;
    }

    // Currency conversion handling
    const currencyMap: Record<string, string> = {
        "usd": "usd", "dollars": "usd", "dollar": "usd", "$": "usd",
        "eur": "eur", "euro": "eur", "euros": "eur", "€": "eur",
        "gbp": "gbp", "pounds": "gbp", "pound": "gbp", "£": "gbp",
        "jpy": "jpy", "yen": "jpy",
        "cad": "cad", "loonie": "cad", "loonies": "cad",
        "aud": "aud",
        "ngn": "ngn", "naira": "ngn",
        "inr": "inr", "rupee": "inr", "rupees": "inr",
        "cny": "cny", "yuan": "cny",
        "rub": "rub", "ruble": "rub", "rubles": "rub",
        // Top 50 Economies
        "krw": "krw", "won": "krw", "brl": "brl", "real": "brl", "mxn": "mxn", "peso": "mxn",
        "sar": "sar", "riyal": "sar", "try": "try", "lira": "try", "chf": "chf", "franc": "chf",
        "idr": "idr", "rupiah": "idr", "twd": "twd", "pln": "pln", "zloty": "pln",
        "ars": "ars", "sek": "sek", "krona": "sek", "nok": "nok", "krone": "nok",
        "sgd": "sgd", "thb": "thb", "baht": "thb", "aed": "aed", "dirham": "aed",
        "zar": "zar", "rand": "zar", "egp": "egp", "cop": "cop", "clp": "clp",
        "myr": "myr", "ringgit": "myr", "php": "php", "vnd": "vnd", "dong": "vnd",
        "pkr": "pkr", "bdt": "bdt", "taka": "bdt", "irr": "irr", "dkk": "dkk",
        "czk": "czk", "koruna": "czk", "hkd": "hkd", "nzd": "nzd", "ils": "ils", "shekel": "ils",
        "kzt": "kzt", "qar": "qar", "kwd": "kwd", "dinar": "kwd", "huf": "huf", "forint": "huf",
        "uah": "uah", "hryvnia": "uah", "pen": "pen", "ron": "ron", "leu": "ron",
        "omr": "omr", "mad": "mad",
        // Crypto Coins
        "btc": "btc", "bitcoin": "btc",
        "eth": "eth", "ethereum": "eth",
        "sol": "sol", "solana": "sol",
        "bnb": "bnb", "binance": "bnb",
        "xrp": "xrp", "ripple": "xrp",
        "ada": "ada", "cardano": "ada",
        "avax": "avax", "avalanche": "avax",
        "dot": "dot", "polkadot": "dot",
        "doge": "doge", "dogecoin": "doge",
        "shib": "shib", "shiba": "shib",
        "matic": "matic", "polygon": "matic",
        "ltc": "ltc", "litecoin": "ltc",
        "trx": "trx", "tron": "trx",
        "link": "link", "chainlink": "link",
        "uni": "uni", "uniswap": "uni",
        "bch": "bch", "bitcoin cash": "bch",
        "atom": "atom", "cosmos": "atom",
        "xlm": "xlm", "stellar": "xlm",
        "xmr": "xmr", "monero": "xmr",
        "etc": "etc", "ethereum classic": "etc",
        "icp": "icp", "internet computer": "icp",
        "fil": "fil", "filecoin": "fil",
        "apt": "apt", "aptos": "apt",
        "near": "near", "arb": "arb", "arbitrum": "arb",
        "op": "op", "optimism": "op", "stx": "stx", "stacks": "stx",
        "rndr": "rndr", "render": "rndr", "inj": "inj", "injective": "inj",
        "tia": "tia", "celestia": "tia", "sei": "sei", "sui": "sui",
        "grt": "grt", "algo": "algo", "algorand": "algo",
        "qnt": "qnt", "quant": "qnt", "ftm": "ftm", "fantom": "ftm",
        "sand": "sand", "mana": "mana", "axs": "axs", "flow": "flow",
        "eos": "eos", "theta": "theta"
    };

    const tokens = query.toLowerCase().split(/\s+/);
    const fromCurrencyToken = tokens.find(t => currencyMap[t]);
    const toIndex = tokens.indexOf("to");
    const toCurrencyToken = toIndex !== -1 ? tokens.slice(toIndex + 1).find(t => currencyMap[t]) : null;

    if (fromCurrencyToken && toCurrencyToken && tokens.some(t => !isNaN(parseFloat(t)))) {
        const amount = parseFloat(tokens.find(t => !isNaN(parseFloat(t))) || "1");
        const fromCode = currencyMap[fromCurrencyToken];
        const toCode = currencyMap[toCurrencyToken];

        if (fromCode === toCode) {
            speak(`${amount} ${fromCode.toUpperCase()} is obviously ${amount} ${toCode.toUpperCase()}.`);
            return;
        }

        try {
            // Using fawazahmed0's Currency API (Free, no key, supports NGN)
            const url = `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${fromCode}.json`;
            const response = await fetch(url);

            if (!response.ok) {
                // Secondary fallback URL
                const fallbackUrl = `https://latest.currency-api.pages.dev/v1/currencies/${fromCode}.json`;
                const fallbackRes = await fetch(fallbackUrl);
                if (!fallbackRes.ok) throw new Error("API Offline");
                const data = await fallbackRes.json();
                const rate = data[fromCode][toCode];
                if (rate) {
                    const result = amount * rate;
                    speak(`${amount} ${fromCode.toUpperCase()} is approximately ${result.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${toCode.toUpperCase()}`);
                    return;
                }
            }

            const data = await response.json();
            const rate = data[fromCode][toCode];

            if (rate !== undefined) {
                const result = amount * rate;
                speak(`${amount} ${fromCode.toUpperCase()} is approximately ${result.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${toCode.toUpperCase()}`);
                return;
            } else {
                speak(`Sorry, I couldn't find the exchange rate from ${fromCode.toUpperCase()} to ${toCode.toUpperCase()}.`);
                return;
            }
        } catch (error) {
            console.error("Currency API Error:", error);
            speak("I'm having trouble connecting to the exchange rate service. Please try again later.");
            return;
        }
    }

    // Pre-processing to handle natural language math
    let mathQuery = query.toLowerCase()
        .replace(/plus/g, "+")
        .replace(/minus/g, "-")
        .replace(/times/g, "*")
        .replace(/multiplied by/g, "*")
        .replace(/divided by/g, "/")
        .replace(/over/g, "/")
        .replace(/to the power of/g, "**")
        .replace(/power/g, "**")
        .replace(/squared/g, "**2")
        .replace(/cubed/g, "**3")
        .replace(/root of/g, "Math.sqrt")
        .replace(/square root of/g, "Math.sqrt")
        .replace(/cube root of/g, "Math.cbrt")
        .replace(/percent of/g, "/100*")
        .replace(/percentage of/g, "/100*")
        .replace(/mod/g, "%")
        .replace(/modulo/g, "%")
        .replace(/pi/g, "Math.PI")
        .replace(/euler's number/g, "Math.E")
        .replace(/absolute value of/g, "Math.abs")
        .replace(/abs\(/g, "Math.abs(")
        .replace(/sin\(/g, "Math.sin(")
        .replace(/cos\(/g, "Math.cos(")
        .replace(/tan\(/g, "Math.tan(")
        .replace(/log\(/g, "Math.log10(") // Default log to log10 for users usually
        .replace(/ln\(/g, "Math.log(")
        .replace(/exp\(/g, "Math.exp(")
        .replace(/factorial of (\d+)/g, (_, n) => {
            let res = 1;
            for (let i = 2; i <= parseInt(n); i++) res *= i;
            return res.toString();
        });

    // Handle some word numbers if they appear in common expressions
    const wordNumbers: Record<string, string> = {
        "one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
        "six": "6", "seven": "7", "eight": "8", "nine": "9", "ten": "10"
    };

    Object.keys(wordNumbers).forEach(word => {
        const reg = new RegExp(`\\b${word}\\b`, 'g');
        mathQuery = mathQuery.replace(reg, wordNumbers[word]);
    });

    // Filter to allow only safe mathematical characters and Math object access
    const sanitizedQuery = mathQuery.replace(/[^0-9+\-*/.() \s,MathPIEabcdeglnqrst%]/g, "");

    try {
        // eslint-disable-next-line no-new-func
        const result = new Function(`return ${sanitizedQuery}`)();

        if (typeof result === "number" && isFinite(result)) {
            // Humanize the result
            const displayResult = Number.isInteger(result) ? result : parseFloat(result.toFixed(4));
            speak(`The answer is ${displayResult}`);
        } else {
            speak("I couldn't calculate a valid result for that.");
        }
    } catch (e) {
        console.error("Calculation Error:", e);
        speak("Sorry, I couldn't understand that math expression.");
    }
}
