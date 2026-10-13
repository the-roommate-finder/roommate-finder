"""Change an account email only after proving access to both mailboxes."""
import json

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.v1.models.models import User
from app.core.security import generate_otp, verify_otp
from app.workers.tasks import send_email_change_code

TTL = 600
MAX_ATTEMPTS = 5


class EmailChangeService:
    def __init__(self, db, redis):
        self.db = db
        self.redis = redis

    async def locked_user(self, user_id):
        # Serialize requests and confirmations for this account across workers.
        return (await self.db.execute(select(User).where(User.id == user_id)
            .with_for_update().execution_options(populate_existing=True))).scalar_one()

    async def available(self, email):
        if (await self.db.execute(select(User.id).where(User.email == email))).scalar_one_or_none():
            raise HTTPException(409, "That email address is unavailable.")

    async def request(self, user_id, email):
        user = await self.locked_user(user_id)
        if email == user.email:
            raise HTTPException(400, "Enter a different email address.")
        await self.available(email)
        rate_key = f"email-change:requests:{user_id}"
        requests = await self.redis.incr(rate_key)
        if requests == 1:
            await self.redis.expire(rate_key, TTL)
        if requests > 3:
            raise HTTPException(429, "Too many email change requests. Please try again in 10 minutes.")
        current_code, current_hash = generate_otp()
        new_code, new_hash = generate_otp()
        key = f"email-change:pending:{user_id}"
        await self.redis.setex(key, TTL, json.dumps({"current_email": user.email,
            "new_email": email, "current_hash": current_hash, "new_hash": new_hash}))
        await self.redis.delete(f"email-change:attempts:{user_id}")
        try:
            send_email_change_code.delay(user_email=user.email, otp=current_code, mailbox="current")
            send_email_change_code.delay(user_email=email, otp=new_code, mailbox="new")
        except Exception:
            await self.redis.delete(key)
            raise HTTPException(503, "Unable to send verification codes. Please try again.")
        return {"message": "Verification codes sent to your current and new email addresses.", "new_email": email}

    async def confirm(self, user_id, current_code, new_code):
        user = await self.locked_user(user_id)
        key = f"email-change:pending:{user_id}"
        value = await self.redis.get(key)
        if not value:
            raise HTTPException(400, "The codes have expired. Request new codes.")
        pending = json.loads(value)
        if pending["current_email"] != user.email:
            await self.redis.delete(key)
            raise HTTPException(400, "Your email has changed. Start again.")
        attempt_key = f"email-change:attempts:{user_id}"
        attempts = await self.redis.incr(attempt_key)
        if attempts == 1:
            await self.redis.expire(attempt_key, TTL)
        if attempts > MAX_ATTEMPTS:
            await self.redis.delete(key)
            raise HTTPException(429, "Too many incorrect codes. Request new codes.")
        current_valid = verify_otp(current_code, pending["current_hash"])
        new_valid = verify_otp(new_code, pending["new_hash"])
        if not (current_valid and new_valid):
            if attempts == MAX_ATTEMPTS:
                await self.redis.delete(key)
            raise HTTPException(400, "Incorrect verification codes. Check both emails and try again.")
        await self.available(pending["new_email"])
        user.email = pending["new_email"]
        user.is_email_verified = True
        try:
            await self.db.flush()
        except IntegrityError:
            await self.db.rollback()
            raise HTTPException(409, "That email address is unavailable.")
        # A consumed challenge cannot be replayed. Database changes commit in get_db.
        await self.redis.delete(key, attempt_key)
        return {"email": user.email, "message": "Your email address has been updated."}
