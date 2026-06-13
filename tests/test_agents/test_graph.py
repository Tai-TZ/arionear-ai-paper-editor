from unittest.mock import AsyncMock, patch

import pytest

from src.agents.graph import agent


@pytest.mark.asyncio
async def test_agent_chat_flow():
    mock_response = type("Msg", (), {"content": "Hello, I can help edit your paper."})()
    with patch("src.agents.nodes.academic_nodes.get_llm") as mock_llm:
        mock_llm.return_value.ainvoke = AsyncMock(return_value=mock_response)
        result = await agent.ainvoke({"query": "Hello", "task": "chat"})
    assert "response" in result
    assert result["response"]


@pytest.mark.asyncio
async def test_agent_structure_flow():
    latex = "\\section{Introduction}\nSome text here for the intro."
    mock_response = type("Msg", (), {"content": "[]"})()
    with patch("src.agents.nodes.academic_nodes.get_llm") as mock_llm:
        mock_llm.return_value.ainvoke = AsyncMock(return_value=mock_response)
        result = await agent.ainvoke(
            {
                "query": "check structure",
                "task": "structure",
                "latex": latex,
            }
        )
    assert isinstance(result, dict)
    assert result.get("structure_suggestions") is not None
