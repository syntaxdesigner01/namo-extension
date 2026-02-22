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
