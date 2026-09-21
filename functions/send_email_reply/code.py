#input_type_name: SendEmailReplyInput
#output_type_name: SendEmailReplyResult
#function_name: send_email_reply

from datetime import datetime, timezone

from pydantic import BaseModel
from lemma_sdk import FunctionContext, Pod


class SendEmailReplyInput(BaseModel):
    deal_id: str
    to: str
    subject: str
    body: str


class SendEmailReplyResult(BaseModel):
    sent: bool
    via: str            # "thread_reply" | "new_email"
    thread_id: str | None = None
    activity_id: str | None = None


async def send_email_reply(ctx: FunctionContext, data: SendEmailReplyInput) -> SendEmailReplyResult:
    pod = Pod.from_env()

    # Find the deal's existing Gmail thread, if any.
    thread_id = None
    threads = pod.records.list(
        "email_threads",
        filter=[{"field": "deal_id", "op": "eq", "value": data.deal_id}],
        limit=1,
    ).to_dict()["items"]
    if threads:
        thread_id = threads[0].get("gmail_thread_id")

    if thread_id:
        res = pod.connectors.execute(
            "gmail",
            "GMAIL_REPLY_TO_THREAD",
            {
                "user_id": "me",
                "thread_id": thread_id,
                "recipient_email": data.to,
                "message_body": data.body,
                "is_html": False,
            },
        ).to_dict()["result"]
        via = "thread_reply"
    else:
        res = pod.connectors.execute(
            "gmail",
            "GMAIL_SEND_EMAIL",
            {
                "user_id": "me",
                "recipient_email": data.to,
                "subject": data.subject,
                "body": data.body,
            },
        ).to_dict()["result"]
        via = "new_email"
        # Try to capture the new thread id so future replies stay in-thread.
        try:
            new_thread = (res or {}).get("data", {}) or {}
            thread_id = new_thread.get("threadId") or new_thread.get("thread_id")
            if thread_id:
                pod.table("email_threads").create(
                    {"gmail_thread_id": thread_id, "deal_id": data.deal_id}
                )
        except Exception:
            pass

    ok = bool((res or {}).get("successful", True))

    now = datetime.now(timezone.utc).isoformat()
    act = pod.table("activities").create(
        {
            "deal_id": data.deal_id,
            "type": "email",
            "occurred_at": now,
            "title": data.subject,
            "summary": f"To {data.to}: " + (data.body[:300] + "…" if len(data.body) > 300 else data.body),
            "direction": "outbound",
            "source_ref": thread_id,
        }
    )
    pod.table("deals").update(data.deal_id, {"last_activity_at": now})

    return SendEmailReplyResult(sent=ok, via=via, thread_id=thread_id, activity_id=str(act["id"]))
