import pytest
from app.config import settings

def test_verify_connection_success(test_client):
    response = test_client.get("/api/v1/auth/verify", headers={"X-Venue-Key": settings.VENUE_AUTH_KEY})
    assert response.status_code == 200
    assert response.json()["authenticated"] is True

def test_verify_connection_missing_key(test_client):
    response = test_client.get("/api/v1/auth/verify")
    assert response.status_code == 401

def test_verify_connection_invalid_key(test_client):
    response = test_client.get("/api/v1/auth/verify", headers={"X-Venue-Key": "wrong_key"})
    assert response.status_code == 401
