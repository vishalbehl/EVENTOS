# Module 2 - Topic 2.4: Cryptography, Fernet Encryption at Rest & Secret Security

## 1. Introduction & Learning Objectives
Welcome to **Topic 2.4**. In this chapter, you will master field-level encryption at rest using symmetric key cryptography (**Fernet** algorithm) and password security using **Bcrypt**.

### Learning Outcomes:
- Encrypt sensitive payment gateway credentials and webhook secrets before DB writes.
- Implement Fernet symmetric key wrappers in Python.
- Hash and verify user passwords safely against timing attacks.

---

## 2. Fernet Symmetric Encryption at Rest

In EventOS ([services/backend/CLAUDE.md](file:///d:/DEV/conf-platform/CLAUDE.md#L109)), sensitive configuration values (Stripe/Resend API keys, secret webhooks) are encrypted using Fernet:

```python
from cryptography.fernet import Fernet
import os

# Generate or load key from environment (FERNET_KEY)
FERNET_KEY = os.getenv("FERNET_KEY", Fernet.generate_key().decode())
cipher_suite = Fernet(FERNET_KEY.encode())

def encrypt_secret(secret_text: str) -> str:
    return cipher_suite.encrypt(secret_text.encode()).decode()

def decrypt_secret(encrypted_text: str) -> str:
    return cipher_suite.decrypt(encrypted_text.encode()).decode()
```

---

## 3. Password Hashing with Passlib & Bcrypt

```python
from passlib.context import CryptContext

pw_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pw_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pw_context.verify(plain_password, hashed_password)
```

---

## 4. Practical Exercise & Self-Assessment

### Hands-On Exercise:
1. Write a python script generating a Fernet key.
2. Encrypt the string `"sk_live_stripe_secret_key_12345"`.
3. Decrypt the ciphertext and verify matching plaintext.

---

## 5. Chapter Summary & Next Steps
You have completed Module 2! You have mastered database design, async ORM, Alembic migrations, RLS multi-tenancy, and Fernet encryption. Next, move to **[Module 3 - Topic 3.1: FastAPI Core & Pydantic v2](../module-3-backend-fastapi/topic-3.1-fastapi-and-pydantic-v2.md)**.
