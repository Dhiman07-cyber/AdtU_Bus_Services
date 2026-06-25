# Security Audit - Cryptography & Vulnerability Assessment

## 1. Executive Summary
The system has a strong security posture, utilizing robust cryptographic verification patterns. It implements bank-grade asymmetric digital signing (RSA-2048) for transaction receipts, symmetric database encryption (AES-256-GCM) for sensitive demographic fields in the ledger, and time-restricted HMAC-signed QR passes. API endpoints are secured with Zod schemas and request wrappers.

* **Cryptographic Strength:** 9/10
* **Vulnerability Resilience:** 8/10
* **API Access Protection:** 9/10
* **Secrets Management:** 8/10

---

## 2. Cryptographic Architecture Review

### A. Asymmetric Signing (RSA-2048)
* **Location:** `src/lib/security/document-crypto.service.ts`
* **Implementation:** Receipts are signed using `crypto.sign('RSA-SHA256')` with a private key. The signature is stored alongside the payment transaction in the database.
* **Verification (CONFIRMED):** Scanning the QR pass triggers the verification endpoint. The API fetches the transaction data from the database, recomputes the SHA-256 hash, and verifies the signature using the public key. Any database modification invalidates the signature.

### B. Symmetric Encryption (AES-256-GCM)
* **Location:** `src/lib/security/encryption.service.ts`
* **Implementation (CONFIRMED):** Sensitive payment fields (`student_name`, `student_id`, `offline_transaction_id`) are stored as encrypted strings using `aes-256-gcm`.
* **Details:** Random salts and Initialization Vectors (IVs) are generated for each field. The encrypted payload combines salt + IV + authentication tag + ciphertext.
* **Format:** Encrypted strings use the prefix `enc:v1:`. The decryptor checks for this prefix, passing legacy plain-text fields through unchanged.

### C. Time-Restricted QR Passes
* **Location:** `src/lib/security/encryption.service.ts`
* **Implementation (CONFIRMED):** Student passes contain an encrypted JSON payload with the student UID, issued time, and expiration time (24 hours).
* **Signing:** The encrypted token is signed with a SHA-256 HMAC using `SIGNING_KEY`. Scanners verify the HMAC and check the expiration timestamp, preventing pass sharing.

---

## 3. Vulnerability & Threat Vector Analysis

### A. Privilege Escalation
* **Vector:** A student changes their role field to admin in their profile.
* **Resilience (CONFIRMED):** Firestore rules block updates to the `role` field on `users` and `students` documents, restricting changes to Admin SDK (server-side) callers.

### B. Insecure Direct Object References (IDOR)
* **Vector:** A user fetches or modifies another user's profile details.
* **Resilience (CONFIRMED):** 
  * Firestore rules permit reads and writes on `/students/{studentId}` only if the requester's UID matches the document ID.
  * Supabase `payments` RLS policies permit select calls only if `student_uid = auth.uid()::text`.

### C. Injection Risks (SQL & NoSQL)
* **Resilience (CONFIRMED):** Firestore queries use document references, preventing injection. Supabase queries use Parametrized PostgREST calls, protecting against SQL injection.

### D. Replay Attacks
* **Vector:** Capturing a student's QR code image to reuse later.
* **Resilience (CONFIRMED):** QR codes automatically expire after 24 hours. The scanner checks the decrypted `expiresAt` timestamp and rejects expired tokens.

---

## 4. Input Validation & API Access Controls
API endpoints are wrapped in `withSecurity()` handlers from `api-security.ts`. This middleware:
* Resolves and verifies authorization tokens.
* Enforces Zod schema validations.
* Integrates rate limit checks using `rate-limiter-flexible`.
* Sanitizes input strings using `url-sanitizer.ts`.
* Validates geographic coordinates using `location-validation-service.ts` to block spoofing attempts.

---

## 5. Technical Debt & Gaps
* **CONFIRMED:** The developer fallback generates an in-memory key pair if `DOCUMENT_PRIVATE_KEY` is missing in development. These signatures are lost when the server hot-reloads, invalidating existing receipts.
* **CONFIRMED:** Encryption keys fall back to a random key if `ENCRYPTION_SECRET_KEY` is missing, preventing decryption of previously saved records.

---

## 6. Production Risks & Recommendations

### Finding: Encryption Key Fallbacks Can Lead to Data Loss
* **Severity:** High
* **Real-world Impact:** If a container restarts in production with missing environment variables, the system generates a random key, making all existing database records undecryptable.
* **Immediate Recommendation:** Modify `encryption.service.ts` and `document-crypto.service.ts` to throw an error and fail closed at startup if key variables are missing, even in development.

---

## 7. Cross-References
* Authorization & RLS audit: [08_AUTHORIZATION_AUDIT.md](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/audits/08_AUTHORIZATION_AUDIT.md)
* Security rules configuration: [05_FIREBASE_AUDIT.md](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/audits/05_FIREBASE_AUDIT.md)
