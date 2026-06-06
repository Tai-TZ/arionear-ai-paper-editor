from src.agents.state import AgentState


async def analyze_node(state: AgentState) -> dict:
    """Phân tích query từ user."""
    query = state.get("query", "")

    # TODO: Thêm logic phân tích thực tế
    # Ví dụ: gọi LLM, search vector DB, etc.
    analysis = f"Phân tích: {query}"

    return {"analysis": analysis}


async def respond_node(state: AgentState) -> dict:
    """Tạo response từ analysis."""
    analysis = state.get("analysis", "")
    error = state.get("error")

    if error:
        return {"response": f"Lỗi: {error}"}

    # TODO: Thêm logic tạo response thực tế
    response = f"Kết quả dựa trên phân tích: {analysis}"

    return {"response": response}
