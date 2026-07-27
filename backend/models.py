"""Pydantic models for FlowProject persistence."""

from __future__ import annotations
from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field


class FlowNode(BaseModel):
    """A single node in the flow graph."""
    id: str
    type: str  # 'start', 'listen', 'router', 'begin', 'agent', 'task', 'reroute'
    position: dict[str, float] = Field(default_factory=lambda: {"x": 0, "y": 0})
    data: dict[str, Any] = Field(default_factory=dict)


class FlowEdge(BaseModel):
    """An edge connecting two nodes."""
    id: str
    source: str
    target: str
    sourceHandle: str | None = None
    targetHandle: str | None = None
    data: dict[str, Any] = Field(default_factory=dict)
    label: str | None = None


class Viewport(BaseModel):
    x: float = 0
    y: float = 0
    zoom: float = 1


class FlowProject(BaseModel):
    """A saved flow project."""
    id: str
    name: str
    version: str = "1.0"
    nodes: list[FlowNode] = Field(default_factory=list)
    edges: list[FlowEdge] = Field(default_factory=list)
    viewport: Viewport = Field(default_factory=Viewport)
    saved_at: str = ""
    updated_at: str = ""

    @classmethod
    def now_ts(cls) -> str:
        return datetime.utcnow().isoformat() + "Z"


class SaveRequest(BaseModel):
    name: str
    nodes: list[dict[str, Any]] = Field(default_factory=list)
    edges: list[dict[str, Any]] = Field(default_factory=list)
    viewport: dict[str, float] | None = None


class SaveResponse(BaseModel):
    id: str
    saved_at: str


class ExportRequest(BaseModel):
    nodes: list[dict[str, Any]] = Field(default_factory=list)
    edges: list[dict[str, Any]] = Field(default_factory=list)


class ExportResponse(BaseModel):
    code: str
    filename: str


class ProjectListItem(BaseModel):
    id: str
    name: str
    saved_at: str
    node_count: int
    edge_count: int
