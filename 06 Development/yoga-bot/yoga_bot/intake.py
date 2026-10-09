"""Canonical commit before acknowledgement, with stable retry metadata."""
from .api_client import Inbound, BackendUnavailable, BackendRejected, BackendContractError
from .intake_state import IntakeStateError


async def submit_message(client, state, *, update_id, actor, chat, body, fallback):
    try:
        context = state.prepare(update_id, actor, fallback)
        request = Inbound(update_id, actor, chat, body, context["topic"], context["conversation_id"])
        receipt = await client.inbound(request)
        state.accept(update_id, actor, receipt.conversation_id)
        return receipt, context["locale"]
    except (BackendUnavailable, BackendRejected, BackendContractError, IntakeStateError):
        raise
    except Exception:
        # An unexpected failure inside the canonical boundary must not consume
        # the user's update; UI transport is handled separately in runtime.
        raise BackendUnavailable("intake_unexpected_failure") from None
