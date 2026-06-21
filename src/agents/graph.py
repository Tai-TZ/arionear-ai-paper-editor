from langgraph.graph import END, StateGraph

from src.agents.nodes.academic_nodes import (
    chat_node,
    citation_node,
    edit_node,
    integrity_node,
    logic_node,
    parse_node,
    respond_node,
    route_node,
    structure_node,
    style_node,
)
from src.agents.state import AgentState


def route_by_task(state: AgentState) -> str:
    if state.get("error"):
        return "respond"
    task = state.get("task", "chat")
    mapping = {
        "style": "style",
        "edit": "edit",
        "citation": "citation",
        "structure": "structure",
        "logic": "logic",
        "template": "chat",
        "chat": "chat",
    }
    return mapping.get(task, "chat")


def build_graph():
    graph = StateGraph(AgentState)

    graph.add_node("route", route_node)
    graph.add_node("parse", parse_node)
    graph.add_node("style", style_node)
    graph.add_node("edit", edit_node)
    graph.add_node("integrity", integrity_node)
    graph.add_node("citation", citation_node)
    graph.add_node("structure", structure_node)
    graph.add_node("logic", logic_node)
    graph.add_node("chat", chat_node)
    graph.add_node("respond", respond_node)

    graph.set_entry_point("route")
    graph.add_edge("route", "parse")
    graph.add_conditional_edges("parse", route_by_task)

    graph.add_edge("style", "integrity")
    graph.add_edge("edit", "integrity")
    graph.add_edge("integrity", "respond")
    graph.add_edge("citation", "respond")
    graph.add_edge("structure", "respond")
    graph.add_edge("logic", "respond")
    graph.add_edge("chat", "respond")
    graph.add_edge("respond", END)

    return graph.compile()


agent = build_graph()
