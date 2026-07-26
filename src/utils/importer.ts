import { Node, Edge } from 'reactflow';
import { v4 as uuidv4 } from 'uuid';
import { FlowMethodData, FlowEdgeData, AgentData } from '../types';

const getId = () => `import_node_${uuidv4()}`;

/**
 * Parse a Python CrewAI Flow class source code into a graph of nodes and edges.
 * Returns null if the code doesn't contain a valid Flow class.
 */
export function importFlowFromPython(pythonCode: string): { nodes: Node[]; edges: Edge[] } | null {
  if (!pythonCode || typeof pythonCode !== 'string') return null;

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const classMatch = pythonCode.match(/class\s+(\w+)\s*\(Flow\[/);
  if (!classMatch) return null;

  const allParts = pythonCode.split(/\n(?=def\s+\w+\s*\()/);

  const methodInfos: Array<{
    name: string;
    decoratorType: 'start' | 'listen' | 'router' | 'none';
    listenArgs: string[];
    routerEvent: string;
    body: string;
  }> = [];

  for (const part of allParts) {
    const lines = part.split('\n');
    const decoratorLines: string[] = [];
    let defLineIdx = -1;

    for (let i = lines.length - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('def ')) { defLineIdx = i; break; }
    }

    if (defLineIdx < 0) continue;

    for (let i = defLineIdx - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('@')) { decoratorLines.unshift(trimmed); }
      else if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('"""') || trimmed.startsWith("'''")) { continue; }
      else { break; }
    }

    const defMatch = lines[defLineIdx].trim().match(/def\s+(\w+)\s*\(self/);
    if (!defMatch) continue;
    const methodName = defMatch[1];
    const body = lines.slice(defLineIdx + 1).join('\n');

    let decoratorType: 'start' | 'listen' | 'router' | 'none' = 'none';
    let listenArgs: string[] = [];
    let routerEvent = '';

    for (const dec of decoratorLines) {
      if (dec.match(/^@start\s*\(\)/)) { decoratorType = 'start'; continue; }
      const routerMatch = dec.match(/^@router\s*\(\s*["']([^"']+)["']\s*\)/);
      if (routerMatch) { decoratorType = 'router'; routerEvent = routerMatch[1]; continue; }
      const listenMatch = dec.match(/^@listen\s*\(([\s\S]*)\)/);
      if (listenMatch) {
        decoratorType = 'listen';
        const inner = listenMatch[1].trim();
        const orMatch = inner.match(/^or_\s*\(([\s\S]*)\)\s*$/);
        if (orMatch) {
          const stringMatches = orMatch[1].match(/["']([^"']+)["']/g);
          if (stringMatches) listenArgs = stringMatches.map(s => s.replace(/["']/g, ''));
        } else {
          const singleMatch = inner.match(/["']([^"']+)["']/);
          if (singleMatch) listenArgs = [singleMatch[1]];
        }
        continue;
      }
    }

    methodInfos.push({ name: methodName, decoratorType, listenArgs, routerEvent, body });
  }

  if (methodInfos.length === 0) return null;

  const methodNameToNodeId: Record<string, string> = {};
  const sorted = [...methodInfos].sort((a, b) => {
    const order = { start: 0, listen: 1, router: 2, none: 3 };
    return (order[a.decoratorType] || 99) - (order[b.decoratorType] || 99);
  });

  sorted.forEach((m, idx) => {
    const nodeId = getId();
    methodNameToNodeId[m.name] = nodeId;
    const agent = extractAgentFromBody(m.body);
    const yPos = 50 + idx * 180;

    if (m.decoratorType === 'start') {
      nodes.push({ id: nodeId, type: 'start', position: { x: 300, y: yPos }, data: { method_name: m.name, node_type: 'start', listen_events: [], router_events: [], agent: agent || undefined } as FlowMethodData });
    } else if (m.decoratorType === 'listen') {
      nodes.push({ id: nodeId, type: 'listen', position: { x: 300, y: yPos }, data: { method_name: m.name, node_type: 'listen', listen_events: m.listenArgs, router_events: [], agent: agent || undefined } as FlowMethodData });
    } else if (m.decoratorType === 'router') {
      nodes.push({ id: nodeId, type: 'router', position: { x: 300, y: yPos }, data: { method_name: m.name, node_type: 'router', listen_events: [], router_events: m.routerEvent ? [m.routerEvent] : [], agent: agent || undefined } as FlowMethodData });
    }
  });

  for (const m of methodInfos) {
    if (m.decoratorType !== 'listen' && m.decoratorType !== 'router') continue;
    const targetId = methodNameToNodeId[m.name];
    if (!targetId) continue;

    if (m.decoratorType === 'listen') {
      const events = m.listenArgs.length > 0 ? m.listenArgs : [m.name];
      for (const event of events) {
        const sourceId = methodNameToNodeId[event];
        if (!sourceId) continue;
        edges.push({ id: `edge_${uuidv4()}`, source: sourceId, target: targetId, type: 'default', animated: false, style: { stroke: '#888', strokeWidth: 2 }, data: { event_names: [event], condition_type: 'single' } as FlowEdgeData });
      }
    }

    if (m.decoratorType === 'router') {
      const idx = sorted.indexOf(m);
      if (idx > 0) {
        const prevMethod = sorted[idx - 1];
        const sourceId = methodNameToNodeId[prevMethod.name];
        if (sourceId) {
          edges.push({ id: `edge_${uuidv4()}`, source: sourceId, target: targetId, type: 'default', animated: false, style: { stroke: '#888', strokeWidth: 2 }, data: { event_names: m.routerEvent ? [m.routerEvent] : [], condition_type: 'single' } as FlowEdgeData });
        }
      }
    }
  }

  return { nodes, edges };
}

function extractAgentFromBody(body: string): AgentData | null {
  const agentMatch = body.match(/Agent\s*\(([\s\S]*?)\)\s*(?:,|$|\n)/);
  if (!agentMatch) return null;
  const argsStr = agentMatch[1];
  const extract = (key: string): string => {
    const re = new RegExp(`${key}\\s*=\\s*["']([\\s\\S]*?)["']\\s*(?:,|$|\\))`, 'm');
    const m = argsStr.match(re);
    return m ? m[1] : '';
  };
  const role = extract('role');
  const goal = extract('goal');
  const backstory = extract('backstory');
  if (!role && !goal) return null;
  const nameMatch = body.match(/#\s*Agent:\s*(\w+)/);
  const name = nameMatch ? nameMatch[1] : role.replace(/\s+/g, '_');
  return { name, role, goal, backstory, tools: [], llm: 'gpt-4o', allowDelegation: false, verbose: true, maxIter: 25, maxRpm: 0, memory: true, cacheEnabled: true, allowCodeExecution: false, maxRetryLimit: 2 };
}
