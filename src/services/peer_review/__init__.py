"""Peer-review response agent (ROADMAP §2.2).

Splits pasted reviewer comments into classified items and drafts a point-by-point
response plus a proposed (never applied) manuscript change for each one.
"""

from src.services.peer_review.pipeline import PeerReviewError, run_peer_review_pipeline
from src.services.peer_review.service import respond_to_reviews

__all__ = ["PeerReviewError", "respond_to_reviews", "run_peer_review_pipeline"]
