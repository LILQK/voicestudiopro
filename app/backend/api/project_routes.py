from __future__ import annotations

from pydantic import BaseModel
from fastapi import APIRouter

from app.backend.storage.json_store import project_store
from app.backend.storage.schemas import Project


class CreateProjectRequest(BaseModel):
    name: str


router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("", response_model=list[Project])
def list_projects() -> list[Project]:
    return project_store.list()


@router.post("", response_model=Project)
def create_project(request: CreateProjectRequest) -> Project:
    return project_store.create(request.name)


@router.get("/{project_id}", response_model=Project)
def get_project(project_id: str) -> Project:
    return project_store.get(project_id)


@router.put("/{project_id}", response_model=Project)
def save_project(project_id: str, project: Project) -> Project:
    project.id = project_id
    return project_store.save(project)

