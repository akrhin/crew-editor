import { Node, Edge } from 'reactflow';
import { v4 as uuidv4 } from 'uuid';
import { FlowMethodData, FlowEdgeData, AgentData } from '../types';

const getId = () => `import_node_${uuidv4()}`;

interface MethodInfo {
  name: string;
  decoratorType: 'start' | 'listen' | 'router' | 'none';
  /** Events this method listens to (from @listen or resolved variable refs) */
  listenEvents: string[];
  /** For @router: the variable/method name it routes on */
  routerInput: string;
  /** Body text after the def line (includes Agent(...) if present) */
  body: string;
}

// ──────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────

/**
 * Parse a real-world CrewAI Flow Python class into a graph of nodes and edges.
 *
 * Handles all patterns from the production crewai-router-flow main.py:
 *   - `@start()` → StartNode
 *   - `@listen("event")` → ListenNode with string event
 *   - `@listen(variable_name)` → ListenNode resolved to method reference
 *   - `@listen(or_(mixed, "strings", variables))` → ListenNode with multiple events
 *   - `@router(variable_name)` → RouterNode wired to a source method
 *   - Multi-line Agent(role=(...), goal=(...), backstory=(...)) with f-strings,
 *     concatenated strings, indented parenthesised blocks
 *   - tools=[var, *SPREAD, another_var]
 *   - llm from **HEAVY_AGENT / **PRO_AGENT / **LIGHT_AGENT / **BASE_AGENT
 *   - handle_general-style methods with no Agent (LLM direct call)
 *   - methods with Agent but no tools/skills/mcps (e.g. review_verdict, handle_reflection)
 *
 * @returns null if the code doesn't contain a viable Flow class, or {nodes, edges}
 */
export function importFlowFromPython(pythonCode: string): { nodes: Node[]; edges: Edge[] } | null {
  if (!pythonCode || typeof pythonCode !== 'string') return null;

  // ── Step 1: detect class ...(Flow[...]) ──
  const classMatch = pythonCode.match(/class\s+(\w+)\s*\(Flow\[/);
  if (!classMatch) return null;

  // ── Step 2: split into method blocks ──
  // Each block starts with 'def ' at a line boundary and contains its decorators + body
  const allParts = pythonCode.split(/\n(?=def\s+\w+\s*\()/);

  const methodInfos: MethodInfo[] = parseMethodBlocks(allParts);
  if (methodInfos.length === 0) return null;

  // ── Step 3: build node ID map and sort ──
  const methodNameToNodeId: Record<string, string> = {};
  for (const m of methodInfos) {
    methodNameToNodeId[m.name] = getId();
  }

  // ── Step 4: create nodes with positions ──
  const { nodes, edges } = buildNodesAndEdges(methodInfos, methodNameToNodeId);

  return { nodes, edges };
}

// ──────────────────────────────────────────────────────────
// Parsing: method blocks → MethodInfo[]
// ──────────────────────────────────────────────────────────

function parseMethodBlocks(allParts: string[]): MethodInfo[] {
  const results: MethodInfo[] = [];

  for (const part of allParts) {
    const lines = part.split('\n');
    const decoratorLines: string[] = [];
    let defLineIdx = -1;

    // Find the 'def' line (scan from bottom)
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim().startsWith('def ')) {
        defLineIdx = i;
        break;
      }
    }
    if (defLineIdx < 0) continue;

    // Collect decorators (@...) directly above def
    for (let i = defLineIdx - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('@')) {
        decoratorLines.unshift(trimmed);
      } else if (
        trimmed === '' ||
        trimmed.startsWith('#') ||
        trimmed.startsWith('"""') ||
        trimmed.startsWith("'''")
      ) {
        continue; // skip blanks and comments
      } else {
        break;
      }
    }

    const defMatch = lines[defLineIdx].trim().match(/def\s+(\w+)\s*\(self/);
    if (!defMatch) continue;
    const methodName = defMatch[1];
    const body = lines.slice(defLineIdx + 1).join('\n');

    const parsed = parseDecorators(decoratorLines);
    if (!parsed) continue;

    results.push({
      name: methodName,
      decoratorType: parsed.type,
      listenEvents: parsed.listenEvents,
      routerInput: parsed.routerInput,
      body,
    });
  }

  return results;
}

interface DecoratorParseResult {
  type: 'start' | 'listen' | 'router' | 'none';
  listenEvents: string[];
  routerInput: string;
}

function parseDecorators(lines: string[]): DecoratorParseResult | null {
  let type: 'start' | 'listen' | 'router' | 'none' = 'none';
  let listenEvents: string[] = [];
  let routerInput = '';

  for (const dec of lines) {
    // @start()
    if (dec.match(/^@start\s*\(\)/)) {
      type = 'start';
      continue;
    }

    // @router(variable) or @router("string")
    const routerMatch = dec.match(/^@router\s*\((.*)\)\s*$/);
    if (routerMatch) {
      type = 'router';
      const inner = routerMatch[1].trim();
      routerInput = inner.startsWith('"') || inner.startsWith("'")
        ? inner.replace(/["']/g, '')
        : inner; // variable name (method reference)
      continue;
    }

    // @listen(...)
    const listenMatch = dec.match(/^@listen\s*\((.*)\)\s*$/);
    if (listenMatch) {
      type = 'listen';
      const inner = listenMatch[1].trim();

      // or_(arg1, arg2, ...) — mixed strings + variables
      const orMatch = inner.match(/^or_\s*\((.*)\)\s*$/s);
      if (orMatch) {
        listenEvents = parseOrArgs(orMatch[1].trim());
      } else {
        // Single argument: "string" or variable_name
        const sq = inner.match(/^["']([^"']*)["']$/);
        if (sq) {
          listenEvents = [sq[1]];
        } else {
          const varMatch = inner.match(/^(\w+)$/);
          if (varMatch) {
            listenEvents = [varMatch[1]];
          }
        }
      }
      continue;
    }
  }

  return { type, listenEvents, routerInput };
}

// ──────────────────────────────────────────────────────────
// Graph construction: nodes + edges
// ──────────────────────────────────────────────────────────

function buildNodesAndEdges(
  infos: MethodInfo[],
  nameToId: Record<string, string>,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Sort: start first, then router, then listen
  const sorted = [...infos].sort((a, b) => {
    const order: Record<string, number> = { start: 0, router: 1, listen: 2, none: 99 };
    return (order[a.decoratorType] ?? 99) - (order[b.decoratorType] ?? 99);
  });

  // Collect listen names for two-column layout
  const listenNames: string[] = sorted
    .filter((m) => m.decoratorType === 'listen')
    .map((m) => m.name);

  const START_Y = 60;
  const STEP_Y = 180;
  const LEFT_X = 250;
  const RIGHT_X = 650;

  // ── Create nodes ──
  sorted.forEach((m, idx) => {
    const nodeId = nameToId[m.name];
    if (!nodeId) return;

    const agent = extractAgentFromBody(m.body);

    // Position: start → left, router → shifted right, listen → two columns
    let x = LEFT_X;
    if (m.decoratorType === 'router') {
      x = LEFT_X + 180;
    } else if (m.decoratorType === 'listen') {
      const li = listenNames.indexOf(m.name);
      x = li % 2 === 0 ? RIGHT_X - 100 : RIGHT_X + 100;
    }

    const yPos = START_Y + idx * STEP_Y;

    const baseData: FlowMethodData = {
      method_name: m.name,
      node_type: m.decoratorType as FlowMethodData['node_type'],
      listen_events: [],
      router_events: [],
      agent: agent || undefined,
    };

    if (m.decoratorType === 'start') {
      // @start emits its method name as an event
      baseData.router_events = [m.name];
      nodes.push({ id: nodeId, type: 'start', position: { x, y: yPos }, data: baseData });
    } else if (m.decoratorType === 'listen') {
      baseData.listen_events = m.listenEvents;
      nodes.push({ id: nodeId, type: 'listen', position: { x, y: yPos }, data: baseData });
    } else if (m.decoratorType === 'router') {
      baseData.router_events = m.routerInput ? [m.routerInput] : [];
      nodes.push({ id: nodeId, type: 'router', position: { x, y: yPos }, data: baseData });
    }
  });

  // ── Build edges ──
  // Strategy:
  //   1. @listen with variable events (method names) → connect from that method
  //   2. @listen with string events → connect from the FIRST @router in the list
  //      (typically the classifier router), since we can't statically determine
  //      which router emits which category string
  //   3. @router → connect from the source method specified in routerInput
  //
  // Known limitation: "approved" could come from builder_verify or review_verdict,
  // but we connect from the first router. Users can adjust edges in the editor.

  // Find the primary (first) router
  const firstRouter = sorted.find((m) => m.decoratorType === 'router');
  const firstRouterId = firstRouter ? nameToId[firstRouter.name] : undefined;

  for (const m of infos) {
    const targetId = nameToId[m.name];
    if (!targetId) continue;

    if (m.decoratorType === 'listen' && m.listenEvents.length > 0) {
      for (const event of m.listenEvents) {
        // 1. Try to resolve as a method name (variable reference like @listen(builder_plan))
        const resolvedSrcId = nameToId[event];
        if (resolvedSrcId) {
          edges.push(makeEdge(resolvedSrcId, targetId, event));
          continue;
        }

        // 2. String event — connect from the primary router
        if (firstRouterId && firstRouterId !== targetId) {
          edges.push(makeEdge(firstRouterId, targetId, event));
        }
      }
    }

    if (m.decoratorType === 'router' && m.routerInput) {
      const srcId = nameToId[m.routerInput];
      if (srcId) {
        edges.push(makeEdge(srcId, targetId, m.routerInput));
      }
    }
  }

  // ── Fallback: connect unresolved listen nodes to the nearest source ──
  const resolvedTargets = new Set(edges.map((e) => e.target));
  for (const m of infos) {
    const targetId = nameToId[m.name];
    if (!targetId || resolvedTargets.has(targetId)) continue;
    if (m.decoratorType !== 'listen') continue;

    // Find the first router above this method in source order
    for (const rm of infos) {
      if (rm.decoratorType === 'router') {
        const srcId = nameToId[rm.name];
        if (srcId) {
          edges.push(makeEdge(srcId, targetId, m.listenEvents[0] || m.name));
          break;
        }
      }
    }
  }

  return { nodes, edges };
}

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

/** Create a single edge with event metadata */
function makeEdge(source: string, target: string, eventName?: string): Edge {
  return {
    id: `edge_${uuidv4()}`,
    source,
    target,
    type: 'default',
    animated: false,
    style: { stroke: '#888', strokeWidth: 2 },
    data: {
      event_names: eventName ? [eventName] : [],
      condition_type: 'single' as const,
    } as FlowEdgeData,
  };
}

// ──────────────────────────────────────────────────────────
// or_(...) parser
// ──────────────────────────────────────────────────────────

/**
 * Parse the inner content of `or_(...)`.
 *
 * Handles mixed quoted strings and bare variable names:
 * ```
 * or_(builder_plan, "builder_changes_requested", "reviewer_changes_requested")
 * or_("approved", "blocked", "escalated")
 * ```
 */
function parseOrArgs(inner: string): string[] {
  const results: string[] = [];
  const tokens = splitByCommaOutsideQuotes(inner);
  for (const token of tokens) {
    const t = token.trim();
    if (t.length === 0) continue;
    const sq = t.match(/^["']([^"']*)["']$/);
    if (sq) {
      results.push(sq[1]);
    } else {
      const varMatch = t.match(/^(\w+)/);
      if (varMatch) {
        results.push(varMatch[1]);
      }
    }
  }
  return results;
}

/**
 * Split a string by commas that are NOT inside quoted strings or brackets.
 * Tracks bracket/paren depth so commas inside function calls are ignored.
 */
function splitByCommaOutsideQuotes(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inQuote: string | null = null;
  let current = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuote) {
      current += ch;
      if (ch === inQuote && (i === 0 || s[i - 1] !== '\\')) {
        inQuote = null;
      }
    } else if (ch === '"' || ch === "'") {
      current += ch;
      inQuote = ch;
    } else if (ch === '(' || ch === '[' || ch === '{') {
      current += ch;
      depth++;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      current += ch;
      depth--;
    } else if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim().length > 0) {
    parts.push(current);
  }
  return parts;
}

// ──────────────────────────────────────────────────────────
// Agent(...) extractor
// ──────────────────────────────────────────────────────────

/**
 * Extract Agent(...) from a method body.
 *
 * Handles real-world patterns from crewai-router-flow main.py:
 *   - Multi-line role/goal/backstory in parenthesised strings:
 *       role=("Multi-line string with\n" "concatenation")
 *   - f-strings: role=f"Hello {name}"
 *   - Parenthesised concatenation: role=("part1" "part2")
 *   - tools=[tavily_tool, *GBRAIN_TOOLS, var]
 *   - llm inferred from **HEAVY_AGENT, **PRO_AGENT, **LIGHT_AGENT, **BASE_AGENT
 *   - Agent without role= (just goal=, backstory=, **DICT)
 *   - methods with NO Agent at all (handle_general) → returns null
 *   - methods with Agent but no tools/mcps (review_verdict, handle_reflection)
 */
function extractAgentFromBody(body: string): AgentData | null {
  // ── Find Agent( ... ) with balanced parens ──
  const agentStart = body.match(/Agent\s*\(/);
  if (!agentStart) return null;

  const openIdx = (agentStart.index ?? 0) + agentStart[0].length - 1; // index of '('
  const closeIdx = findBalancedParen(body, openIdx);
  if (closeIdx < 0) return null;

  // Everything between Agent( and the matching )
  const argsStr = body.slice(openIdx + 1, closeIdx).trim();

  const role = extractStrArg(argsStr, 'role');
  const goal = extractStrArg(argsStr, 'goal');
  const backstory = extractStrArg(argsStr, 'backstory');
  const name = extractGenerator(argsStr, 'name') || extractGenerator(argsStr, 'role') || 'Unnamed Agent';
  const tools = extractToolList(argsStr);
  const llm = extractLlm(argsStr);

  const defaults = {
    name,
    role: role.slice(0, 200),
    goal: goal.slice(0, 200),
    backstory: backstory.slice(0, 200),
    tools,
    llm,
    allowDelegation: false,
    verbose: true,
    maxIter: 25,
    maxRpm: 0,
    memory: true,
    cacheEnabled: true,
    allowCodeExecution: false,
    maxRetryLimit: 2,
  };

  // If Agent exists but has no role/goal/backstory (from **dict completely)
  if (!role && !goal) {
    return { ...defaults, role: '', goal: '', backstory: '' };
  }

  return defaults;
}

/**
 * Find the index of the closing paren/bracket matching the opener at `openIdx`.
 * Handles quoted strings with escape sequences.
 */
function findBalancedParen(s: string, openIdx: number): number {
  let depth = 0;
  let inQuote: string | null = null;
  for (let i = openIdx; i < s.length; i++) {
    const ch = s[i];
    if (inQuote) {
      if (ch === inQuote && (i === 0 || s[i - 1] !== '\\')) {
        inQuote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Extract a named string argument value.
 *
 * Handles:
 *   role="simple string"
 *   role=("multi-line\n" "concatenated")
 *   role=f"interpolated"
 *   role=("multi " "line")
 */
function extractStrArg(args: string, key: string): string {
  const re = new RegExp(`\\b${key}\\s*=\\s*`, 'm');
  const match = re.exec(args);
  if (!match) return '';

  let idx = match.index + match[0].length;
  // Skip whitespace / newlines
  while (idx < args.length && (args[idx] === ' ' || args[idx] === '\n' || args[idx] === '\r')) idx++;
  if (idx >= args.length) return '';

  // Parenthesised multi-line string: role=("..." "...")
  if (args[idx] === '(') {
    const endIdx = findBalancedParen(args, idx);
    if (endIdx < 0) return '';
    const inner = args.slice(idx + 1, endIdx).trim();
    return extractConcatenatedStrings(inner);
  }

  // f-string prefix
  if (args[idx] === 'f' && idx + 1 < args.length && (args[idx + 1] === '"' || args[idx + 1] === "'")) {
    idx++;
  }

  // Simple quoted string
  if (args[idx] === '"' || args[idx] === "'") {
    const quote = args[idx];
    let end = idx + 1;
    while (end < args.length) {
      if (args[end] === quote && args[end - 1] !== '\\') break;
      end++;
    }
    return args.slice(idx + 1, end);
  }

  return '';
}

/**
 * Extract text from concatenated string literals:
 *   "part1" "part2" "part3"  → "part1 part2 part3"
 *
 * Used inside parenthesised role=(...) blocks.
 */
function extractConcatenatedStrings(s: string): string {
  const parts: string[] = [];
  let pos = 0;
  while (pos < s.length) {
    // Skip whitespace / newlines between string literals
    while (pos < s.length && (s[pos] === ' ' || s[pos] === '\n' || s[pos] === '\r' || s[pos] === '\t')) pos++;
    if (pos >= s.length) break;

    // f-string prefix
    if (s[pos] === 'f' && pos + 1 < s.length && (s[pos + 1] === '"' || s[pos + 1] === "'")) {
      pos++;
    }

    if (s[pos] === '"' || s[pos] === "'") {
      const quote = s[pos];
      pos++;
      let strPart = '';
      while (pos < s.length) {
        if (s[pos] === '\\' && pos + 1 < s.length) {
          strPart += s[pos + 1];
          pos += 2;
          continue;
        }
        if (s[pos] === quote) {
          pos++;
          break;
        }
        strPart += s[pos];
        pos++;
      }
      parts.push(strPart);
    } else {
      // Non-string content — skip (e.g. Python comments between strings)
      pos++;
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Extract a simple quoted value (name="value").
 */
function extractGenerator(args: string, key: string): string {
  const re = new RegExp(`\\b${key}\\s*=\\s*["']([^"']*)["']`, 'm');
  const m = re.exec(args);
  return m ? m[1].trim() : '';
}

/**
 * Extract tool variable names from tools=[...].
 *
 * Handles:
 *   tools=[tavily_tool, serper_tool]
 *   tools=[*GBRAIN_TOOLS_BUILDER, *PERSONA_TOOLS_DEFAULT, *SHELL_TOOLS_DEFAULT]
 *   No tools= at all → empty array
 */
function extractToolList(args: string): string[] {
  const toolsMatch = args.match(/tools\s*=\s*\[([\s\S]*?)\]/);
  if (!toolsMatch) return [];
  const items = splitByCommaOutsideQuotes(toolsMatch[1]);
  const result: string[] = [];
  for (const item of items) {
    const t = item.trim();
    if (!t) continue;
    // Remove * prefix for spread vars: *GBRAIN_TOOLS → GBRAIN_TOOLS
    const clean = t.replace(/^\*+/, '');
    if (/^[a-zA-Z_]\w*$/.test(clean)) {
      result.push(clean);
    }
  }
  return result;
}

/**
 * Extract LLM model name from **dict unpacking or explicit llm= argument.
 *
 * Resolution order:
 *   1. Explicit llm='model-name'
 *   2. **HEAVY_AGENT / **PRO_AGENT  → 'reasoning_llm'
 *   3. **LIGHT_AGENT                → 'light_llm'
 *   4. **BASE_AGENT                 → 'deepseek-v4-flash'
 *   5. llm=LLM(...)                 → 'LLM(...)'
 *   6. llm=variable_name            → variable name
 *   7. fallback                     → 'gpt-4o'
 */
function extractLlm(args: string): string {
  // 1. Explicit string
  const explicitMatch = args.match(/\bllm\s*=\s*["']([^"']+)["']/);
  if (explicitMatch) return explicitMatch[1];

  // 2. **HEAVY_AGENT or **PRO_AGENT
  if (/\*\*HEAVY_AGENT/.test(args) || /\*\*PRO_AGENT/.test(args)) return 'reasoning_llm';
  // 3. **LIGHT_AGENT
  if (/\*\*LIGHT_AGENT/.test(args)) return 'light_llm';
  // 4. **BASE_AGENT
  if (/\*\*BASE_AGENT/.test(args)) return 'deepseek-v4-flash';
  // 5. llm=LLM(...)
  if (/\bllm\s*=\s*LLM\s*\(/.test(args)) return 'LLM(...)';
  // 6. llm=variable_name
  const llmVar = args.match(/\bllm\s*=\s*(\w+)/);
  if (llmVar) return llmVar[1];

  return 'gpt-4o';
}
