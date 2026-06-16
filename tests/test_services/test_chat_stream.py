from src.services.chat_stream import _merge_agent_into_done


def test_merge_agent_includes_revision_id():
    done: dict = {"revision_id": "", "suggestion": ""}
    _merge_agent_into_done(
        done,
        {
            "suggestion": "polished text",
            "original_text": "raw text",
            "apply_mode": "selection",
            "metadata": {"revision_id": "rev-abc-123"},
        },
    )
    assert done["revision_id"] == "rev-abc-123"
    assert done["apply_mode"] == "selection"
    assert done["suggestion"] == "polished text"
