import { Node, Edge } from 'reactflow';
import { v4 as uuidv4 } from 'uuid';
import { FlowMethodData, FlowEdgeData, AgentData } from '../types';

const getId = () => `import_node_${uuidv4()}`;

/**
 * Parse a Python CrewAI Flow class source code into a graph of nodes and edges.
 * Handles real-world patterns:
 *   - @router(variable), @listen(variable), @listen(or_(...)) with mixed vars/strings
 *   - Multi-line role/goal/backstory in parenthesised strings
 *   - tools=[var1, var2, *SPREAD] lists
 *   - Agents without explicit role/goal/backstory (from **dict unpacking)
 * Returns null if the code doesn't contain a valid Flow class.
 */
export function importFlowFromPython(pythonCode: string): { nodes: Node[]; edges: Edge[] } | null {
  if (!pythonCode || typeof pythonCode !== 'string') return null;

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const classMatch = pythonCode.match(/class\s+(\w+)\s*\(Flow\[/);
  if (!classMatch) return null;

  // Split method blocks by 'def ' at line-start
  const allParts = pythonCode.split(/\n(?=def\s+\w+\s*\()/);

  interface MethodInfo {
    name: string;
    decoratorType: 'start' | 'listen' | 'router' | 'none';
    /** Events this method listens to (from @listen or @router variable) */
    listenEvents: string[];
    /** For router: the variable/method name it's wired to */
    routerInput: string;
    body: string;
  }

  const methodInfos: MethodInfo[] = [];

  for (const part of allParts) {
    const lines = part.split('\n');
    const decoratorLines: string[] = [];
    let defLineIdx = -1;

    // Find the 'def' line (scan backwards)
    for (let i = lines.length - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('def ')) { defLineIdx = i; break; }
    }
    if (defLineIdx < 0) continue;

    // Collect decorators above def
    for (let i = defLineIdx - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('@')) {
        decoratorLines.unshift(trimmed);
      } else if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
        continue;
      } else {
        break;
      }
    }

    const defMatch = lines[defLineIdx].trim().match(/def\s+(\w+)\s*\(self/);
    if (!defMatch) continue;
    const methodName = defMatch[1];
    const body = lines.slice(defLineIdx + 1).join('\n');

    let decoratorType: 'start' | 'listen' | 'router' | 'none' = 'none';
    let listenEvents: string[] = [];
    let routerInput = '';

    for (const dec of decoratorLines) {
      if (dec.match(/^@start\s*\(\)/)) {
        decoratorType = 'start';
        continue;
      }

      // @router(variable_name) or @router("string")
      const routerMatch = dec.match(/^@router\s*\((.*)\)\s*$/);
      if (routerMatch) {
        decoratorType = 'router';
        const inner = routerMatch[1].trim();
        if (inner.startsWith('"') || inner.startsWith("'")) {
          routerInput = inner.replace(/["']/g, '');
        } else {
          routerInput = inner; // variable name (method reference)
        }
        continue;
      }

      // @listen(...)
      const listenMatch = dec.match(/^@listen\s*\((.*)\)\s*$/);
      if (listenMatch) {
        decoratorType = 'listen';
        const inner = listenMatch[1].trim();
        // or_(...) with mixed arguments
        const orMatch = inner.match(/^or_\s*\((.*)\)\s*$/s);
        if (orMatch) {
          listenEvents = parseOrArgs(orMatch[1].trim());
        } else {
          // Single argument: string or variable
          const sq = inner.match(/^["']([^"']*)["']$/);
          if (sq) {
            listenEvents = [sq[1]];
          } else {
            // Variable name reference
            const varMatch = inner.match(/^(\w+)$/);
            if (varMatch) {
              listenEvents = [varMatch[1]];
            }
          }
        }
        continue;
      }
    }

    methodInfos.push({
      name: methodName,
      decoratorType,
      listenEvents,
      routerInput,
      body,
    });
  }

  if (methodInfos.length === 0) return null;

  // Phase 1: Build node ID map
  const methodNameToNodeId: Record<string, string> = {};

  // Order: start first, then router, then listen
  const sorted = [...methodInfos].sort((a, b) => {
    const order: Record<string, number> = { start: 0, router: 1, listen: 2, none: 99 };
    return (order[a.decoratorType] ?? 99) - (order[b.decoratorType] ?? 99);
  });

  sorted.forEach((m) => {
    const nodeId = getId();
    methodNameToNodeId[m.name] = nodeId;
  });

  // Phase 2: Create nodes
  const leftX = 250;
  const rightX = 650;

  // Collect listen node names for two-column positioning
  const listenNames: string[] = [];
  for (const m of sorted) {
    if (m.decoratorType === 'listen') listenNames.push(m.name);
  }

  let startY = 60;
  const stepY = 180;

  sorted.forEach((m, idx) => {
    const nodeId = methodNameToNodeId[m.name];
    if (!nodeId) return;

    const agent = extractAgentFromBody(m.body);
    let x = leftX;
    if (m.decoratorType === 'router') {
      x = leftX + 180;
    } else if (m.decoratorType === 'listen') {
      // Two-column listen layout
      const li = listenNames.indexOf(m.name);
      x = li % 2 === 0 ? rightX - 100 : rightX + 100;
    }

    const yPos = startY + idx * stepY;

    const baseData: FlowMethodData = {
      method_name: m.name,
      node_type: m.decoratorType as FlowMethodData['node_type'],
      listen_events: [],
      router_events: [],
      agent: agent || undefined,
    };

    if (m.decoratorType === 'start') {
      baseData.router_events = [m.name]; // start emits its method name
      nodes.push({
        id: nodeId,
        type: 'start',
        position: { x, y: yPos },
        data: baseData,
      });
    } else if (m.decoratorType === 'listen') {
      baseData.listen_events = m.listenEvents;
      nodes.push({
        id: nodeId,
        type: 'listen',
        position: { x, y: yPos },
        data: baseData,
      });
    } else if (m.decoratorType === 'router') {
      baseData.router_events = m.routerInput ? [m.routerInput] : [];
      nodes.push({
        id: nodeId,
        type: 'router',
        position: { x, y: yPos },
        data: baseData,
      });
    }
  });

  // Phase 3: Edge construction
  // For each method that has listenEvents or routerInput, find matching sources
  for (const m of methodInfos) {
    const targetId = methodNameToNodeId[m.name];
    if (!targetId) continue;

    if (m.decoratorType === 'listen' && m.listenEvents.length > 0) {
      for (const event of m.listenEvents) {
        // Try to resolve as method name first (e.g. @listen(builder_plan) → find node for builder_plan)
        const resolvedSrcId = methodNameToNodeId[event];
        if (resolvedSrcId) {
          edges.push(makeEdge(resolvedSrcId, targetId, event));
          continue;
        }
        // String event (e.g. "sage", "builder", "approved") — connect from all routers
        // since routers emit category strings or verdict signals
        for (const rm of methodInfos) {
          if (rm.decoratorType === 'router') {
            const srcId = methodNameToNodeId[rm.name];
            if (srcId && srcId !== targetId) {
              edges.push(makeEdge(srcId, targetId, event));
            }
          }
        }
      }
    }

    if (m.decoratorType === 'router' && m.routerInput) {
      // Router listens to a specific method's event
      const srcId = methodNameToNodeId[m.routerInput];
      if (srcId) {
        edges.push(makeEdge(srcId, targetId, m.routerInput));
      }
    }

    // For start methods, connect to the next important node if they have no router/listen edge from themselves
    // Already handled: @start emits its method name, routers/listeners pick it up
  }

  // Phase 4: For listen events that are still unresolved (no edges), connect from the nearest router
  const resolvedTargets = new Set(edges.map(e => e.target));
  for (const m of methodInfos) {
    const targetId = methodNameToNodeId[m.name];
    if (!targetId || resolvedTargets.has(targetId)) continue;
    if (m.decoratorType !== 'listen') continue;

    // Find any router above this method
    for (const rm of methodInfos) {
      if (rm.decoratorType === 'router') {
        const srcId = methodNameToNodeId[rm.name];
        if (srcId) {
          const eventName = m.listenEvents[0] || m.name;
          edges.push(makeEdge(srcId, targetId, eventName));
          break;
        }
      }
    }
  }

  return { nodes, edges };
}

/** Make a single edge helper */
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

/**
 * Parse the inner content of or_(...) — handles mixed quoted strings and variable names:
 *   or_(builder_plan, "builder_changes_requested", "reviewer_changes_requested")
 *   or_("approved", "blocked", "escalated")
 */
function parseOrArgs(inner: string): string[] {
  const results: string[] = [];
  // Tokenize: split by comma but respect quoted strings
  const tokens = splitByCommaOutsideQuotes(inner);
  for (const token of tokens) {
    const t = token.trim();
    if (t.length === 0) continue;
    // Check if it's a quoted string
    const sq = t.match(/^["']([^"']*)["']$/);
    if (sq) {
      results.push(sq[1]);
    } else {
      // It's a variable (method name reference) — remove any trailing whitespace/comments
      const varMatch = t.match(/^(\w+)/);
      if (varMatch) {
        results.push(varMatch[1]);
      }
    }
  }
  return results;
}

/**
 * Split a string by commas that are NOT inside quoted strings.
 * Handles nested parentheses inside quotes gracefully.
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

/**
 * Extract Agent(...) from a method body.
 * Handles:
 *   - Multi-line role/goal/backstory in parenthesised string literals "..." or (...)
 *   - f-strings (role=f"...")
 *   - Concatenated strings (role="..." "...")
 *   - tools=[var, *spread, var2]
 *   - llm from **dict unpacking (**HEAVY_AGENT, **LIGHT_AGENT, **PRO_AGENT)
 *   - No Agent present at all (returns null)
 */
function extractAgentFromBody(body: string): AgentData | null {
  // Find the Agent(...) call with balanced parentheses
  const agentStart = body.match(/Agent\s*\(/);
  if (!agentStart) return null;

  const startIdx = (agentStart.index ?? 0) + agentStart[0].length;
  const depth = findBalancedParen(body, startIdx - 1);
  if (depth < 0) return null;

  const argsStr = body.slice(startIdx, depth);

  const role = extractStrArg(argsStr, 'role');
  const goal = extractStrArg(argsStr, 'goal');
  const backstory = extractStrArg(argsStr, 'backstory');

  // If no explicit role/goal/backstory, the Agent gets them from **dict unpacking
  // Still create a node but with empty fields
  const name = extractGenerator(argsStr, 'name')
    || extractGenerator(argsStr, 'role')
    || 'Unnamed Agent';

  const tools = extractToolList(argsStr);
  const llm = extractLlm(argsStr);

  if (!role && !goal) {
    // Agent exists but without explicit role/goal (e.g., from **HEAVY_AGENT)
    return {
      name,
      role: '',
      goal: '',
      backstory: '',
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
  }

  return {
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
}

/**
 * Find the index of the closing paren matching the opening paren at openIdx.
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
    if (ch === '(') depth++;
    if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Extract a string argument value like role="..." or role=(...)
 * Handles: role="string", role=("multi", "line"), role=f"...", role=("..." "...")
 */
function extractStrArg(args: string, key: string): string {
  const re = new RegExp(`\\b${key}\\s*=\\s*`, 'm');
  const match = re.exec(args);
  if (!match) return '';

  let idx = match.index + match[0].length;
  // Skip whitespace
  while (idx < args.length && (args[idx] === ' ' || args[idx] === '\n' || args[idx] === '\r')) idx++;

  if (idx >= args.length) return '';

  // Check if it starts with parenthesis (multiline)
  if (args[idx] === '(') {
    // Collect content inside parens
    const endIdx = findBalancedParen(args, idx);
    if (endIdx < 0) return '';
    const inner = args.slice(idx + 1, endIdx).trim();
    // The inner may be concatenated strings: "..." "\n" "..."
    return extractConcatenatedStrings(inner);
  }

  // f-string or regular string
  if (args[idx] === 'f' && idx + 1 < args.length && (args[idx + 1] === '"' || args[idx + 1] === "'")) {
    idx++; // skip 'f'
  }

  // Single quoted string
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
 * Extract concatenated strings: "part1" "part2" "part3"
 * This matches the pattern within parenthesised role/goal/backstory.
 */
function extractConcatenatedStrings(s: string): string {
  const parts: string[] = [];
  let pos = 0;
  while (pos < s.length) {
    // Skip whitespace and newlines
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
      // Not a string — skip to next string
      pos++;
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Extract a generator/name-like argument (simple string, not multiline)
 */
function extractGenerator(args: string, key: string): string {
  const re = new RegExp(`\\b${key}\\s*=\\s*["']([^"']*)["']`, 'm');
  const m = re.exec(args);
  return m ? m[1].trim() : '';
}

/**
 * Extract tool variable names from tools=[...]
 * Handles: [tavily_tool, serper_tool, *GBRAIN_TOOLS_FOUNDATION, *PERSONA_TOOLS_DEFAULT]
 */
function extractToolList(args: string): string[] {
  const toolsMatch = args.match(/tools\s*=\s*\[([\s\S]*?)\]/);
  if (!toolsMatch) return [];
  const inner = toolsMatch[1];
  const items = splitByCommaOutsideQuotes(inner);
  const result: string[] = [];
  for (const item of items) {
    const t = item.trim();
    if (!t) continue;
    // Remove * prefix for spread vars
    const clean = t.replace(/^\*+/, '');
    // Only keep identifiers (variable names), skip literals
    if (/^[a-zA-Z_]\w*$/.test(clean)) {
      result.push(clean);
    }
  }
  return result;
}

/**
 * Extract LLM model name from **dict unpacking or explicit llm= argument.
 * Checks for **HEAVY_AGENT, **PRO_AGENT, **LIGHT_AGENT, **BASE_AGENT
 * which contain llm=reasoning_llm, llm=light_llm, llm=classifier_llm
 * Also checks for explicit llm=LLM(...) or llm='model-name'
 */
function extractLlm(args: string): string {
  // Check for explicit llm='model' or llm="model"
  const explicitMatch = args.match(/\bllm\s*=\s*["']([^"']+)["']/);
  if (explicitMatch) return explicitMatch[1];

  // Check for **HEAVY_AGENT, **PRO_AGENT → implies reasoning_llm
  if (/\*\*HEAVY_AGENT/.test(args) || /\*\*PRO_AGENT/.test(args)) {
    return 'reasoning_llm';
  }
  // Check for **LIGHT_AGENT → implies light_llm
  if (/\*\*LIGHT_AGENT/.test(args)) {
    return 'light_llm';
  }
  // Check for **BASE_AGENT → implies deepseek-v4-flash
  if (/\*\*BASE_AGENT/.test(args)) {
    return 'deepseek-v4-flash';
  }

  // Try llm=LLM(**...)
  const llmLiteral = args.match(/\bllm\s*=\s*LLM\s*\(/);
  if (llmLiteral) return 'LLM(...)';

  // Check llm=variable_name
  const llmVar = args.match(/\bllm\s*=\s*(\w+)/);
  if (llmVar) return llmVar[1];

  return 'gpt-4o';
}
