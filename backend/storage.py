"""File-based storage for .flow project files."""

from __future__ import annotations
import json
import os
import uuid
from pathlib import Path

from .models import FlowProject, ProjectListItem

STORAGE_DIR = Path(os.environ.get(
    "CREW_EDITOR_DATA_DIR",
    os.path.expanduser("~/.hermes/crew-editor/projects"),
))


def _ensure_dir():
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)


def _project_path(project_id: str) -> Path:
    return STORAGE_DIR / f"{project_id}.flow"


def list_projects() -> list[ProjectListItem]:
    """List all saved projects."""
    _ensure_dir()
    items: list[ProjectListItem] = []
    for fpath in sorted(STORAGE_DIR.glob("*.flow"), key=os.path.getmtime, reverse=True):
        try:
            data = json.loads(fpath.read_text())
            items.append(ProjectListItem(
                id=data.get("id", fpath.stem),
                name=data.get("name", fpath.stem),
                saved_at=data.get("saved_at", ""),
                node_count=len(data.get("nodes", [])),
                edge_count=len(data.get("edges", [])),
            ))
        except (json.JSONDecodeError, KeyError):
            continue
    return items


def load_project(project_id: str) -> FlowProject | None:
    """Load a project by ID."""
    path = _project_path(project_id)
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text())
        return FlowProject(**data)
    except (json.JSONDecodeError, Exception):
        return None


def save_project(project: FlowProject) -> FlowProject:
    """Save a project. Returns the saved project with timestamps."""
    _ensure_dir()
    if not project.id:
        project.id = uuid.uuid4().hex[:12]
    now = FlowProject.now_ts()
    if not project.saved_at:
        project.saved_at = now
    project.updated_at = now

    path = _project_path(project.id)
    path.write_text(project.model_dump_json(indent=2))
    return project


def delete_project(project_id: str) -> bool:
    """Delete a project. Returns True if existed."""
    path = _project_path(project_id)
    if not path.exists():
        return False
    path.unlink()
    return True
