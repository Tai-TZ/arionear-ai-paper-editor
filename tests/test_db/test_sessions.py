import uuid

from src.services.sessions import session_store


def test_create_and_get_paper_session():
    session_id = str(uuid.uuid4())
    created = session_store.create(
        session_id=session_id,
        name="Test Paper",
        latex_content="\\documentclass{article}",
        metadata={"journal": "Nature"},
    )
    assert created.id == session_id
    assert created.name == "Test Paper"
    assert "documentclass" in created.latex_content

    fetched = session_store.get(session_id)
    assert fetched is not None
    assert fetched.name == "Test Paper"
    assert fetched.metadata["journal"] == "Nature"


def test_update_paper_session():
    session_id = str(uuid.uuid4())
    session_store.create(session_id=session_id, name="Draft")
    updated = session_store.update(session_id, name="Final", latex_content="updated latex")
    assert updated is not None
    assert updated.name == "Final"
    assert updated.latex_content == "updated latex"


def test_revision_and_citation_registry():
    session_id = str(uuid.uuid4())
    session_store.create(session_id=session_id)

    revision = session_store.add_revision(
        session_id, section="intro", original="old text", suggestion="new text"
    )
    assert revision is not None
    assert revision.action == "pending"

    resolved = session_store.set_revision_action(session_id, revision.id, "accepted")
    assert resolved is not None
    assert resolved.action == "accepted"

    registry = [
        {
            "key": "smith2024",
            "status": "verified",
            "layers": [{"source": "crossref"}],
            "metadata": {"title": "A Paper", "doi": "10.1234/example"},
            "message": "OK",
        }
    ]
    session_store.set_citation_registry(session_id, registry)

    session = session_store.get(session_id)
    assert session is not None
    assert len(session.citation_registry) == 1
    assert session.citation_registry[0]["key"] == "smith2024"
    assert len(session.revision_history) == 1
    assert session.revision_history[0].action == "accepted"
