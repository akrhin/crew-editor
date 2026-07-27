"""FastAPI backend for crew-editor — save/load/list/delete projects."""

from __future__ import annotations
import uuid

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .models import (
    ExportRequest,
    ExportResponse,
    FlowProject,
    SaveRequest,
    SaveResponse,
    ProjectListItem,
)
from . import storage

app = FastAPI(
    title="Crew Editor API",
    version="1.0.0",
    docs_url="/api/docs",
)

# Allow requests from the frontend (any origin during dev)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/flow/list", response_model=list[ProjectListItem])
def list_projects():
    """List all saved flow projects."""
    return storage.list_projects()


@app.post("/api/flow/save", response_model=SaveResponse)
def save_project(body: SaveRequest):
    """Save or overwrite a flow project."""
    flow_id = uuid.uuid4().hex[:12]
    project = FlowProject(
        id=flow_id,
        name=body.name,
        nodes=[n for n in body.nodes],
        edges=[e for e in body.edges],
        viewport=body.viewport or {"x": 0, "y": 0, "zoom": 1},
    )
    saved = storage.save_project(project)
    return SaveResponse(id=saved.id, saved_at=saved.updated_at)


@app.get("/api/flow/load/{project_id}", response_model=FlowProject)
def load_project(project_id: str):
    """Load a flow project by ID."""
    project = storage.load_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@app.delete("/api/flow/{project_id}", status_code=204)
def delete_project(project_id: str):
    """Delete a flow project."""
    if not storage.delete_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")


@app.post("/api/flow/export-py", response_model=ExportResponse)
def export_python(body: ExportRequest):
    """Export flow graph to Python code using the frontend export utility."""
    import sys
    import importlib.util

    # Import the frontend export module directly
    spec = importlib.util.spec_from_file_location(
        "export_utils",
        "/home/sintez/crew-editor/src/utils/export.ts",
    )
    # Since .ts can't be imported directly, we hardcode the generation logic
    # as a simplified version that the frontend also calls.

    # Build a simple Python flow from the graph
    lines = generate_flow_python(body.nodes, body.edges)
    return ExportResponse(code=lines, filename="flow.py")


def generate_flow_python(
    nodes: list[dict], edges: list[dict]
) -> str:
    """Generate CrewAI Flow Python code from graph data."""
    flow_lines = [
        '"""Auto-generated CrewAI Flow."""',
        "from crewai.flow.flow import Flow, listen, router, start",
        "from crewai import Agent, Task, Crew",
        "from crewai.llm import LLM",
        "",
    ]

    # Map node-id → method name
    method_names: dict[str, str] = {}
    for node in nodes:
        data = node.get("data", {})
        mn = data.get(
            "method_name",
            data.get("name", f"node_{node['id'][:8]}"),
        )
        method_names[node["id"]] = mn

    # Find edges by source
    out_edges: dict[str, list[dict]] = {}
    for edge in edges:
        out_edges.setdefault(edge["source"], []).append(edge)

    # Generate methods
    for node in nodes:
        ntype = node.get("type", "")
        data = node.get("data", {})
        mn = method_names[node["id"]]
        edges_from_node = out_edges.get(node["id"], [])

        # Decorator
        if ntype == "start" or "start" in ntype:
            flow_lines.append("    @start()")
        elif ntype == "listen" or "listen" in ntype:
            events = data.get("listen_events", data.get("event_names", []))
            if events:
                if len(events) == 1:
                    flow_lines.append(f'    @listen("{events[0]}")')
                else:
                    events_str = ", ".join(f'"{e}"' for e in events)
                    flow_lines.append(f"    @listen(and_([{events_str}]))")
            else:
                flow_lines.append("    @listen()")
        elif ntype == "router" or "router" in ntype:
            flow_lines.append("    @router()")
        else:
            # Legacy — skip or generic
            continue

        # Method signature
        safe_name = mn.replace(" ", "_").replace("-", "_")
        flow_lines.append(f"    def {safe_name}(self):")
        flow_lines.append(f'        """{data.get("goal", data.get("description", ""))}"""')

        # If node has an agent
        agent_data = data.get("agent", {})
        if agent_data and agent_data.get("role"):
            role = agent_data["role"]
            goal = agent_data.get("goal", "")
            flow_lines.append(f"        agent = Agent(role=\"{role}\", goal=\"{goal}\")")

        flow_lines.append("        pass")
        flow_lines.append("")

    result = "\n".join(flow_lines)
    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8766, reload=True)
