from urllib.parse import parse_qs, urlparse
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import update

from app.api.v1.models.models import User
from app.api.v1.services.google_auth_service import GoogleAuthService, OAUTH_STATE_COOKIE
from app.core.config import settings

pytestmark = pytest.mark.asyncio
AUTH = "/api/v1/auth"
PASSWORD = "LocalTest123!"


async def register(api):
    response = await api.client.post(f"{AUTH}/register", json={
        "email": api.email, "password": PASSWORD, "role": "lister", "display_name": "API Test",
    })
    assert response.status_code == 201, response.text
    assert response.json()["role"] == "lister"
    assert response.json()["display_name"] == "API Test"
    return response.json()


async def verify(api):
    otp = api.deliveries["send_otp_email"].call_args.kwargs["otp"]
    response = await api.client.post(f"{AUTH}/verify-email", json={"email": api.email, "otp": otp})
    assert response.status_code == 200, response.text


async def login(api, password=PASSWORD):
    return await api.client.post(f"{AUTH}/login", json={"email": api.email, "password": password})


async def test_register_verify_login_refresh_logout(api):
    await register(api)
    assert (await login(api)).status_code == 403
    await verify(api)
    response = await login(api)
    assert response.status_code == 200, response.text
    tokens = response.json()
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    assert (await api.client.get("/api/v1/users/me", headers=headers)).status_code == 200
    assert (await api.client.get("/api/v1/users/me")).status_code in (401, 403)
    assert (await api.client.get("/api/v1/users/me", headers={"Authorization": "Bearer invalid"})).status_code == 401

    refreshed = await api.client.post(f"{AUTH}/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert refreshed.status_code == 200, refreshed.text
    assert (await api.client.post(f"{AUTH}/refresh", json={"refresh_token": tokens["refresh_token"]})).status_code == 401
    tokens = refreshed.json()
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    assert (await api.client.post(f"{AUTH}/logout", headers=headers, json={"refresh_token": tokens["refresh_token"]})).status_code == 200
    assert (await api.client.get("/api/v1/users/me", headers=headers)).status_code == 401
    assert (await api.client.post(f"{AUTH}/refresh", json={"refresh_token": tokens["refresh_token"]})).status_code == 401


async def test_duplicate_registration_and_admin_role_rejected(api):
    await register(api)
    response = await api.client.post(f"{AUTH}/register", json={"email": api.email, "password": PASSWORD})
    assert response.status_code == 409
    response = await api.client.post(f"{AUTH}/register", json={"email": api.email, "password": PASSWORD, "role": "admin"})
    assert response.status_code == 422


async def test_password_reset_and_lockout(api):
    await register(api)
    await verify(api)
    for _ in range(settings.LOGIN_MAX_ATTEMPTS):
        assert (await login(api, "wrong-password")).status_code == 401
    assert (await login(api)).status_code == 423
    await api.redis.delete(f"auth:lockout:{api.email}", f"auth:fails:{api.email}")
    response = await api.client.post(f"{AUTH}/forgot-password", json={"email": api.email})
    assert response.status_code == 200
    token = api.deliveries["send_password_reset_email"].call_args.kwargs["token"]
    body = {"token": token, "new_password": "Replacement123!"}
    assert (await api.client.post(f"{AUTH}/reset-password", json=body)).status_code == 200
    assert (await api.client.post(f"{AUTH}/reset-password", json=body)).status_code == 400
    assert (await login(api)).status_code == 401
    assert (await login(api, "Replacement123!")).status_code == 200


async def begin_google(api, monkeypatch, redirect=False):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "test-client")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "test-secret")
    response = await api.client.get(f"{AUTH}/google" + ("/redirect" if redirect else ""))
    assert response.status_code == (302 if redirect else 200)
    url = response.headers["location"] if redirect else response.json()["auth_url"]
    state = parse_qs(urlparse(url).query)["state"][0]
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "SameSite=lax" in response.headers["set-cookie"]
    assert 0 < await api.redis.ttl(f"oauth:state:{state}") <= 600
    return state


@pytest.mark.parametrize("method", ["GET", "POST"])
async def test_google_state_rejects_missing_mismatch_expired_and_other_browser(api, monkeypatch, method):
    exchange = AsyncMock()
    monkeypatch.setattr(GoogleAuthService, "_exchange_code", exchange)
    state = await begin_google(api, monkeypatch)

    async def callback(value):
        body = {"code": "fake-code"}
        if value is not None:
            body["state"] = value
        return await api.client.request(method, f"{AUTH}/google/callback", **{
            "params" if method == "GET" else "json": body,
        })

    assert (await callback(None)).status_code in (400, 422)
    assert (await callback("wrong-state")).status_code == 400
    api.client.cookies.clear()
    assert (await callback(state)).status_code == 400
    api.client.cookies.set(OAUTH_STATE_COOKIE, state)
    await api.redis.delete(f"oauth:state:{state}")
    assert (await callback(state)).status_code == 400
    exchange.assert_not_awaited()


@pytest.mark.parametrize("method", ["GET", "POST"])
async def test_google_login_and_replay(api, monkeypatch, method):
    exchange = AsyncMock(return_value={"access_token": "mock-google-token"})
    monkeypatch.setattr(GoogleAuthService, "_exchange_code", exchange)
    monkeypatch.setattr(GoogleAuthService, "_fetch_profile", AsyncMock(return_value={
        "email": api.email, "email_verified": True, "name": "Google Test", "sub": "test-subject",
    }))
    state = await begin_google(api, monkeypatch, redirect=method == "GET")
    body = {"code": "fake-code", "state": state}
    kwargs = {"params" if method == "GET" else "json": body}
    response = await api.client.request(method, f"{AUTH}/google/callback", **kwargs)
    assert response.status_code == 200, response.text
    assert response.json()["is_new_user"] is True
    token = response.json()["access_token"]
    assert (await api.client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"})).status_code == 200
    # Even restoring the original cookie cannot replay consumed state.
    api.client.cookies.set(OAUTH_STATE_COOKIE, state)
    assert (await api.client.request(method, f"{AUTH}/google/callback", **kwargs)).status_code == 400
    exchange.assert_awaited_once()
    assert (await login(api)).status_code == 401


async def test_google_rejects_inactive_existing_account(api, monkeypatch):
    await register(api)
    monkeypatch.setattr(GoogleAuthService, "_exchange_code", AsyncMock(return_value={"access_token": "mock"}))
    monkeypatch.setattr(GoogleAuthService, "_fetch_profile", AsyncMock(return_value={"email": api.email, "email_verified": True}))
    state = await begin_google(api, monkeypatch)
    response = await api.client.post(f"{AUTH}/google/callback", json={"code": "fake", "state": state})
    assert response.status_code == 403


async def test_legacy_google_password_placeholder_returns_401(api):
    user = await register(api)
    await verify(api)
    async with api.sessions() as db:
        await db.execute(update(User).where(User.id == user["id"]).values(hashed_password="google_oauth_old-placeholder"))
        await db.commit()
    assert (await login(api)).status_code == 401


async def test_google_configuration_and_denied_consent(api, monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "")
    assert (await api.client.get(f"{AUTH}/google")).status_code == 503
    response = await api.client.get(f"{AUTH}/google/callback", params={"error": "access_denied"})
    assert response.status_code == 400
    assert "access_denied" in response.json()["detail"]
    schema = (await api.client.get("/openapi.json")).json()
    assert "requestBody" in schema["paths"][f"{AUTH}/google/callback"]["post"]


@pytest.mark.parametrize("channel", ["email", "phone"])
async def test_otp_attempt_limit_persists_after_failed_requests(api, channel):
    user = await register(api)
    if channel == "email":
        path = f"{AUTH}/verify-email"
        body = {"email": api.email}
        delivery = "send_otp_email"
    else:
        phone = "+234" + user["id"].split("-")[-1].zfill(10)
        async with api.sessions() as db:
            await db.execute(update(User).where(User.id == user["id"]).values(phone_number=phone))
            await db.commit()
        body = {"phone_number": phone}
        assert (await api.client.post(f"{AUTH}/send-phone-otp", json=body)).status_code == 200
        path = f"{AUTH}/verify-phone-otp"
        delivery = "send_otp_sms"
    valid = api.deliveries[delivery].call_args.kwargs["otp"]
    wrong = "000000" if valid != "000000" else "111111"
    for attempt in range(settings.OTP_MAX_ATTEMPTS):
        response = await api.client.post(path, json={**body, "otp": wrong})
        assert response.status_code == 400, response.text
        assert f"{settings.OTP_MAX_ATTEMPTS - attempt - 1} attempt(s)" in response.json()["detail"]
    assert (await api.client.post(path, json={**body, "otp": valid})).status_code == 429


@pytest.mark.parametrize("role", ["seeker", "lister"])
@pytest.mark.parametrize("channel", ["email", "phone"])
async def test_verification_session_and_resume_onboarding(api, role, channel):
    response = await api.client.post(f"{AUTH}/register", json={
        "email": api.email, "password": PASSWORD, "role": role,
    })
    assert response.status_code == 201, response.text
    user = response.json()
    if channel == "email":
        path = f"{AUTH}/verify-email"
        body = {"email": api.email}
        delivery = "send_otp_email"
    else:
        phone = "+234" + user["id"].split("-")[-1].zfill(10)
        async with api.sessions() as db:
            await db.execute(update(User).where(User.id == user["id"]).values(phone_number=phone))
            await db.commit()
        body = {"phone_number": phone}
        assert (await api.client.post(f"{AUTH}/send-phone-otp", json=body)).status_code == 200
        path = f"{AUTH}/verify-phone-otp"
        delivery = "send_otp_sms"
    otp = api.deliveries[delivery].call_args.kwargs["otp"]
    assert (await api.client.post(path, json={**body, "otp": "000000" if otp != "000000" else "111111"})).status_code == 400
    response = await api.client.post(path, json={**body, "otp": otp})
    assert response.status_code == 200, response.text
    tokens = response.json()
    assert tokens["user"]["role"] == role
    assert tokens["user"]["is_profile_complete"] is False
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    profile = await api.client.get("/api/v1/users/me", headers=headers)
    assert profile.status_code == 200
    assert profile.json()["is_profile_complete"] is False
    # Verification is not a reusable passwordless-login endpoint.
    assert (await api.client.post(path, json={**body, "otp": otp})).status_code == 400
    assert (await api.client.post(path, json={**body, "otp": "123456"})).status_code == 400
    assert (await api.client.post(f"{AUTH}/refresh", json={"refresh_token": tokens["refresh_token"]})).status_code == 200
    resumed = await login(api)
    assert resumed.status_code == 200
    assert resumed.json()["user"]["is_profile_complete"] is False
    assert resumed.json()["access_token"] != tokens["access_token"]
    endpoint = "/api/v1/users/me/complete-profile"
    assert (await api.client.post(endpoint, json={"display_name": "Test"})).status_code in (401, 403)
    assert (await api.client.post(endpoint, headers=headers, json={"display_name": "  "})).status_code == 422
    # Saving a draft does not silently mark onboarding complete.
    draft = await api.client.patch("/api/v1/users/me", headers=headers, json={"bio": "Draft bio"})
    assert draft.status_code == 200
    assert draft.json()["is_profile_complete"] is False
    completed = await api.client.post(endpoint, headers=headers, json={"display_name": "  Test User  "})
    assert completed.status_code == 200, completed.text
    assert completed.json()["is_profile_complete"] is True
    assert completed.json()["display_name"] == "Test User"
    assert completed.json()["bio"] == "Draft bio"
    resumed = await login(api)
    assert resumed.status_code == 200
    assert resumed.json()["user"]["is_profile_complete"] is True
