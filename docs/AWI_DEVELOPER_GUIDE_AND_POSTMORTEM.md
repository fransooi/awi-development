# AWI Developer Guide & Post-Mortem: The Recursion Bug

> **⚠️ IMPORTANT:** Before proceeding, read [ABSOLUTE_ORDERS.md](./ABSOLUTE_ORDERS.md) for critical protocols regarding crashes and debugging.

> **⚠️ IMPORTANT:** Before proceeding, read [ABSOLUTE_ORDERS.md](./ABSOLUTE_ORDERS.md) for critical protocols regarding crashes and debugging.

**Date:** January 2, 2026
**Topic:** Critical Recursion Bug in Procedure Execution & Parser Logic
**Status:** Resolved

---

## 1. The Incident: Infinite Recursion & Crash

### The Symptoms
When a user (or a procedure) executed a command like `awi.set_verbosity(1)` or `Set verbosity to 1`, the system would:
1.  Enter an infinite loop, repeatedly printing prompt debug logs.
2.  Eventually crash with `TypeError: Cannot read properties of undefined (reading 'length')` in `BranchBase.initTokens`.

### The Root Causes

#### Cause A: Stale Tokens in the "Basket" (The Loop)
The AWI engine uses a `basket` object to share state across connector calls.
1.  When a **Procedure** starts, its definition (tokens) is loaded into the `basket`.
2.  The procedure executes a step (e.g., `awi.set_verbosity(1)`).
3.  This step calls `awi.prompt()`.
4.  `awi.prompt()` calls `parser.preparePrompt()`.
5.  **The Bug:** `preparePrompt` was extracting `tokens` from the `basket` if they weren't explicitly passed in arguments.
6.  **The Result:** Instead of parsing the *new* command (`set_verbosity`), the parser found the *old* tokens (the running procedure itself) in the basket and returned them.
7.  The engine executed the procedure again... and again... ad infinitum.

#### Cause B: Type Confusion in Prompt Connector (The Crash)
1.  Inside the loop, `awi.prompt` was being called recursively.
2.  `awi.getArgs` was sometimes treating the `prompt` string as the `args` object.
3.  The code attempted to extract `tokens` from this string.
4.  This resulted in `tokens` being passed as a string (the prompt text) or garbage to `Branch.initTokens`.
5.  `Branch.initTokens` expected an array, tried to access `.length` on undefined/garbage, and crashed.

---

## 2. The Fixes (What to Avoid)

### Rule 1: Context Isolation in Parsers
**NEVER** read execution tokens from the shared `basket` inside the Parser. The Parser's job is to translate *current input* into *new tokens*. Reading from the basket risks picking up the state of the *caller*.

**Correct Pattern (`parser.mjs`):**
```javascript
async preparePrompt( args, basket, control ) {
    var { prompt } = this.awi.getArgs( [ 'prompt' ], args, basket, [ '' ] );
    
    // BAD: var { tokens } = this.awi.getArgs( [ 'tokens' ], args, basket, [ [] ] );
    
    // GOOD: Force empty basket for tokens to ensure we only get them if explicitly passed in args
    var { tokens } = this.awi.getArgs( [ 'tokens' ], args, {}, [ [] ] ); 
}
```

### Rule 2: Strict Type Checking for Args
When accepting flexible arguments (string vs object), explicitly check types before extracting properties.

**Correct Pattern (`prompt.mjs`):**
```javascript
// Only look for 'tokens' if args is actually an object, not a string prompt
if ( typeof args === 'object' && args !== null && !Array.isArray(args) ) {
    var t = this.awi.getArgs( [ 'tokens' ], args, {}, [ null ] );
    tokens = t.tokens;
}
```

### Rule 3: Defensive Programming in Core Engine
Core methods like `Branch.initTokens` must handle bad input gracefully to prevent hard crashes.

**Correct Pattern (`branch.mjs`):**
```javascript
initTokens( argsIn, basket, control ) {
    var { tokens } = this.awi.getArgs(...);
    
    // Validate inputs before usage
    if ( !Array.isArray(tokens) ) {
        console.error('Branch Error: tokens is not an array', tokens);
        tokens = []; // Fallback to empty to prevent crash
    }
    // ...
}
```

---

## 3. How to Create New Capabilities

### A. Creating a New Bubble (Tool)
1.  **Create File:** `bubbles/awi/my_bubble.mjs`
2.  **Class Structure:**
    ```javascript
    export default class BubbleMyTool extends BubbleBase {
        constructor(awi, config) {
            super(awi, config);
            this.token = 'my_tool';     // Used in commands: awi.my_tool()
            this.group = 'awi';
            this.name = 'My Tool';
            this.properties = {
                inputs: [ { name: 'param1', type: 'string' } ],
                outputs: [ { name: 'result', type: 'string' } ],
                action: 'Description of what this does'
            };
        }
        
        async play(args, basket, control) {
            // Extract arguments
            var { param1 } = this.awi.getArgs(['param1'], args, basket, ['default']);
            
            // Do work...
            var result = "Done " + param1;
            
            // Return answer
            return this.newAnswer(result);
        }
    }
    ```
3.  **Register:** Add to `connectors/awi/bubbles.mjs` (or relevant group loader).

### B. Creating a Procedure (Compound Task)
Procedures are defined in the **Persona** JSON files (e.g., `personas/awi.json` or user config).

**JSON Structure:**
```json
"procedures": {
    "my_procedure": {
        "description": "Does a complex task",
        "parameters": [ "arg1" ],
        "steps": [
            "awi.set_verbosity(1)",
            "awi.my_tool( arg1 )",
            "awi.chat('Tell user it is done')"
        ]
    }
}
```
*   **Note:** Procedures are parsed just like user input. Each step is sent to `awi.prompt()`.

---

## 4. The Execution Flow: From Prompt to Bubble

Here is the complete discovery path for the command: `"Set verbosity to 2"`

1.  **User Input:** User types `Set verbosity to 2` in the console.
2.  **Interface Layer:** `ed-commandline.mjs` detects line, emits event.
3.  **Prompt Connector:** `ConnectorPrompt.prompt( { prompt: "..." }, basket, control )` is called.
    *   Checks if `prompt` is a system command (quit, setup).
    *   Checks user login status.
    *   **Call 1:** calls `parser.preparePrompt`.
4.  **Parser Connector:** `ConnectorParser.preparePrompt( { prompt: "..." } )`
    *   **Attempt 1 (Mechanical):** `tokeniseExpression`.
        *   Scans string. Looks for syntax like `group.token(...)`.
        *   "Set verbosity to 2" does not match strict syntax.
    *   **Attempt 2 (Semantic/AI):**
        *   Constructs System Prompt listing all available Bubbles and Procedures.
        *   Sends to LLM (e.g., OpenAI/EdenAI).
        *   LLM responds with JSON: `[{ "type": "bubble", "token": "set_verbosity", "group": "awi", "parameters": { "level": 2 } }]`
    *   **Return:** Parser returns `{ tokens: [...] }`.
5.  **Prompt Connector (Resume):**
    *   Receives tokens.
    *   Calls `this.branch.addTokens(tokens)`.
    *   Calls `this.branch.runTokens()`.
6.  **Branch Engine:** `BranchBase.runTokens`
    *   Iterates through the token list.
    *   Calls `getExpression(token)`.
    *   Calls `getValue(token)`.
    *   **Discovery:** `token.type` is `'bubble'`.
        *   Look up `token.bubble` (instance of `BubbleSetVerbosity`).
    *   **Execution:** Calls `token.bubble.play(args)`.
7.  **Bubble Execution:** `BubbleSetVerbosity.play` runs.
    *   Sets global verbosity config.
    *   Returns success.
8.  **Output:** `Prompt` connector receives success, prints result to editor.

### Key Function Call Stack (Simplified)
```
ConnectorPrompt.prompt()
  -> awi.callConnectors('preparePrompt')
      -> ConnectorParser.preparePrompt()
          -> (LLM / Tokenizer)
          <- Returns Tokens
  -> Branch.addTokens()
  -> Branch.runTokens()
      -> Branch.getExpression()
          -> Branch.getValue()
              -> Bubble.play()
```

---

*Use this guide to ensure future connectors and procedures invoke the parser cleanly without leaking state.*
