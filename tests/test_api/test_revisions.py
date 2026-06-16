import uuid

import pytest


@pytest.mark.asyncio
async def test_list_revisions_empty(client):
    session_id = str(uuid.uuid4())
    await client.post(
        "/api/v1/sessions",
        json={"id": session_id, "name": "Rev Test", "latex_content": "\\documentclass{article}"},
    )
    res = await client.get(f"/api/v1/sessions/{session_id}/revisions")
    assert res.status_code == 200
    assert res.json()["revisions"] == []


@pytest.mark.asyncio
async def test_revision_accept_reject_flow(client):
    session_id = str(uuid.uuid4())
    await client.post(
        "/api/v1/sessions",
        json={
            "id": session_id,
            "name": "Rev Flow",
            "latex_content": "\\documentclass{article}\\begin{document}Hello\\end{document}",
        },
    )

    from src.services.sessions import session_store

    record = session_store.add_revision(
        session_id,
        section="intro",
        original="Hello",
        suggestion="Hello world",
    )
    assert record is not None

    listed = await client.get(f"/api/v1/sessions/{session_id}/revisions")
    assert listed.status_code == 200
    revisions = listed.json()["revisions"]
    assert len(revisions) == 1
    assert revisions[0]["action"] == "pending"

    accepted = await client.post(
        f"/api/v1/revisions/{session_id}/{record.id}",
        json={"action": "accepted"},
    )
    assert accepted.status_code == 200

    listed2 = await client.get(f"/api/v1/sessions/{session_id}/revisions")
    assert listed2.json()["revisions"][0]["action"] == "accepted"


@pytest.mark.asyncio
async def test_get_citations_empty(client):
    session_id = str(uuid.uuid4())
    await client.post(
        "/api/v1/sessions",
        json={"id": session_id, "name": "Cite Test", "latex_content": ""},
    )
    res = await client.get(f"/api/v1/sessions/{session_id}/citations")
    assert res.status_code == 200
    body = res.json()
    assert body["results"] == []
    assert "summary" in body


@pytest.mark.asyncio
async def test_citation_registry_persisted(client):
    session_id = str(uuid.uuid4())
    await client.post(
        "/api/v1/sessions",
        json={"id": session_id, "name": "Cite Persist", "latex_content": ""},
    )

    from src.services.sessions import session_store

    session_store.set_citation_registry(
        session_id,
        [{"key": "smith2020", "status": "verified", "message": "ok"}],
    )

    res = await client.get(f"/api/v1/sessions/{session_id}/citations")
    assert res.status_code == 200
    results = res.json()["results"]
    assert len(results) == 1
    assert results[0]["key"] == "smith2020"
